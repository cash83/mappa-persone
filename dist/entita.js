import {
  MAPPA_DIM, MAPPA_MUCCHIO, MAPPA_MUCCHIO_OPACITA, MAPPA_OPACITA, MAPPA_PRINCIPALE,
  MAPPA_SFONDO_CART, MAPPA_SUE, MAPPA_VICINO, MAPPA_ZONA_SPENTA,
} from './costanti.js?v=3.3.21';
import {
  mappaAffianca, mappaColore, mappaDistanza, mappaElenco, mappaOra, mappaRighe, mappaSalta,
  mappaSua,
} from './utili.js?v=3.3.21';
import { cartellino, sensoreIndirizzo } from './cartellino.js?v=3.3.21';
import { parla } from './lingue.js?v=3.3.21';

/**
 * LA GESTIONE DELLE ENTITA'. Qui dentro sta tutto e solo quello che riguarda
 * chi si vede sulla mappa: leggere dove sono adesso, leggere dove sono state
 * nelle ore passate, e disegnarle. Come e' fatta la carta sotto non la riguarda:
 * quella e' `carta.js`, e da qui si usano solo `usa`, `butta` e `inquadra`.
 */

/**
 * Le posizioni delle ore passate, chieste al registratore come le chiede la
 * scheda mappa di Home Assistant: stessa domanda, stessi parametri, nessun
 * filtro nostro.
 */
export async function leggiStoria(hass, righe, ore) {
  const chi = righe.filter((r) => r.entity.indexOf('zone.') !== 0);
  if (!hass || !ore || !chi.length) return {};
  /* Chi ha acceso "usa anche il sensore dell'indirizzo" porta con se' un secondo
     canale: il telefono manda l'indirizzo per conto suo e ci mette dentro anche
     la coordinata, spesso piu' spesso di quanto mandi il tracciatore. Si chiede
     lo storico di tutti e due insieme. */
  const sensori = {};
  const ids = [];
  chi.forEach((r) => {
    ids.push(r.entity);
    if (mappaSua(r, 'usa_indirizzo', MAPPA_SUE)) {
      const s = sensoreIndirizzo(hass, r.entity);
      if (s) {
        sensori[r.entity] = s;
        ids.push(s);
      }
    }
  });

  const fine = new Date();
  const inizio = new Date(fine.getTime() - ore * 3600000);
  const risposta = await hass.callWS({
    type: 'history/history_during_period',
    start_time: inizio.toISOString(),
    end_time: fine.toISOString(),
    entity_ids: ids,
    minimal_response: false,
    no_attributes: false,
    significant_changes_only: false,
  });
  const storia = {};
  chi.forEach((r) => {
    let p = puntiDaStoria(risposta[r.entity]);
    const s = sensori[r.entity];
    if (s && risposta[s]) p = unisci(p, puntiDaStoria(risposta[s], true));
    storia[r.entity] = p;
  });
  return storia;
}

/**
 * Fonde le due fonti in ordine di tempo. Le stesse posizioni arrivano su tutti e
 * due i canali, quindi una lettura dell'indirizzo che cade a pochi metri e pochi
 * secondi da una del tracciatore e' la stessa cosa e si butta. E l'indirizzo lo
 * calcola il telefono e lo spedisce quando gli pare: ogni tanto arriva con la
 * coordinata di qualche minuto prima, e infilata in ordine di ARRIVO farebbe uno
 * sperone. Si buttano quelle che pretendono una velocita' assurda.
 */
function unisci(a, b) {
  /*
   * L'indirizzo NON e' una posizione GPS: e' il punto dell'indirizzo trovato,
   * spesso il centro dell'edificio o dell'isolato. Va bene per riempire i
   * silenzi del tracciatore, ma se lo si mette accanto alle posizioni vere tira
   * la scia in mezzo alle case. Quindi si tiene SOLO dove il tracciatore tace
   * da almeno un minuto e mezzo.
   */
  const soli = a.slice().sort((x, y) => x[2] - y[2]);
  const vicino = (t) => soli.some((q) => Math.abs(q[2] - t) < 90000);
  const tutti = a.concat(b.filter((p) => !vicino(p[2]))).sort((x, y) => x[2] - y[2]);
  const out = [];
  for (const p of tutti) {
    const u = out[out.length - 1];
    if (u && p[4] !== u[4] && Math.abs(p[2] - u[2]) < 25000 && mappaDistanza(u, p) < 12) continue;
    out.push(p);
  }
  const buone = [];
  for (let i = 0; i < out.length; i++) {
    const p = out[i];
    if (p[4] !== 1) {
      buone.push(p);
      continue;
    }
    let prima = null;
    for (let j = i - 1; j >= 0 && !prima; j--) if (out[j][4] !== 1) prima = out[j];
    let dopo = null;
    for (let j = i + 1; j < out.length && !dopo; j++) if (out[j][4] !== 1) dopo = out[j];
    const assurda = (q) => {
      if (!q) return false;
      const m = mappaDistanza(q, p);
      const sec = Math.abs(p[2] - q[2]) / 1000;
      if (m < 100) return false;
      return (m / Math.max(1, sec)) * 3.6 > 130;
    };
    if (assurda(prima) || assurda(dopo)) continue;
    buone.push(p);
  }
  return buone;
}

/**
 * Da quello che risponde il registratore alle coordinate. Due cose da sapere:
 * nella risposta compressa gli attributi arrivano SOLO quando cambiano, quindi
 * vanno portati avanti; e l'ora buona e' `last_updated` (`lu`), non
 * `last_changed`, che si muove solo se cambia la scritta dello stato.
 */
function puntiDaStoria(elenco, dallIndirizzo) {
  const out = [];
  let attr = {};
  for (const s of elenco || []) {
    if (s.a) attr = Object.assign({}, attr, s.a);
    else if (s.attributes) attr = Object.assign({}, attr, s.attributes);
    // il sensore dell'indirizzo tiene la coordinata in `location: [lat, lon]`
    const dove = dallIndirizzo && Array.isArray(attr.location) ? attr.location : null;
    const lat = dove ? Number(dove[0]) : Number(attr.latitude);
    const lon = dove ? Number(dove[1]) : Number(attr.longitude);
    if (isNaN(lat) || isNaN(lon)) continue;
    const t = s.lu ? s.lu * 1000 : new Date(s.last_updated || s.last_changed).getTime();
    const u = out[out.length - 1];
    // un telefono fermo manda centinaia di letture sovrapposte: quelle a meno di
    // pochi metri dalla precedente non aggiungono niente da vedere
    if (u && u[0] === lat && u[1] === lon) continue;   // due volte la stessa
    if (u && MAPPA_VICINO > 0 && mappaDistanza(u, [lat, lon]) < MAPPA_VICINO) continue;
    out.push([lat, lon, t, dallIndirizzo ? 20 : Number(attr.gps_accuracy), dallIndirizzo ? 1 : 0]);
  }
  return out;
}

/** Disegna tutto quello che sta sopra la mappa. L'inquadratura non la decide. */
export function disegnaEntita(carta, hass, config, storia, strade) {
  const L = carta.L;
  const D = parla(hass);
  const vivi = [];
  /* PRIMA si guarda chi si sovrappone, POI si disegna: facendo il contrario le
     icone singole vengono create e tolte a ogni giro, e il nome appeso non si
     chiude piu'. */
  const insieme = chiSiPesta(carta, hass, config);

  mappaRighe(config).forEach((riga, i) => {
    const ent = riga.entity;
    const st = hass.states[ent];
    if (!st) return;
    const lat = Number(st.attributes.latitude);
    const lon = Number(st.attributes.longitude);
    if (isNaN(lat) || isNaN(lon)) return;
    /* Il colore lo sceglie l'utente, riga per riga. Se non lo sceglie si usa il
       colore principale del tema, uguale per tutti: prima si pescava a caso da
       una tavolozza a seconda della posizione in elenco, e cambiando l'ordine
       cambiavano i colori da soli. */
    const col = mappaColore(riga.colore, carta.dentro, MAPPA_PRINCIPALE);
    const nome = st.attributes.friendly_name || ent;

    // la zona: il cerchio col raggio vero, e dentro la sua foto o la sua icona
    if (ent.indexOf('zone.') === 0) {
      /* La zona si puo' TOGLIERE DAL DISEGNO senza toglierla dall'elenco. Chi
         ha la foto di casa grande quanto il cortile ogni tanto vuole vedere la
         strada che c'e' sotto, e cancellare la riga vorrebbe dire rifare nome,
         foto, colore e grandezza da capo la volta dopo. Spenta qui, la zona
         resta una zona per tutto il resto: e' Home Assistant che le conosce, e
         lui le conosce lo stesso. */
      if (riga.mostra === false) return;
      // anche qui il colore lo sceglie l'utente, se no quello del tema
      const colz = mappaColore(riga.colore, carta.dentro, MAPPA_ZONA_SPENTA);
      const kc = 'z:' + ent;
      vivi.push(kc);
      const raggio = Number(st.attributes.radius) || 100;
      /* Con la FOTO il cerchio della zona e' gia' disegnato dalla foto stessa:
         il contorno colorato ci finisce esattamente sopra e sembra un anello che
         nessuno ha chiesto. Quindi con la foto il contorno si vede solo se un
         colore lo hai scelto tu, e il riempimento non serve mai. */
      const conFoto = !!riga.foto;
      const scelto = !!riga.colore;
      const filo = conFoto && !scelto ? 0 : 2;
      const dentroC = conFoto ? 0 : 0.2;
      const c = carta.usa(kc, () =>
        L.circle([lat, lon], { radius: raggio, color: colz, weight: filo, fillColor: colz, fillOpacity: dentroC })
      );
      c.setLatLng([lat, lon]);
      c.setRadius(raggio);
      c.setStyle({
        color: colz,
        fillColor: colz,
        weight: filo,
        opacity: filo ? 1 : 0,
        fillOpacity: dentroC,
      });

      /* Il segno e' ESATTAMENTE il cerchio della zona: il raggio vero convertito
         in pixel, senza nessun minimo. Il minimo era lo sbaglio di prima: da
         lontano le zone restavano grandi come francobolli e si sovrapponevano
         invece di rimpicciolirsi insieme al loro cerchio. */
      const kz = 'i:' + ent;
      vivi.push(kz);
      const q1 = carta.mappa.latLngToLayerPoint([lat, lon]);
      const q2 = carta.mappa.latLngToLayerPoint([lat + raggio / 111320, lon]);
      const cerchio = Math.min(600, Math.max(6, Math.round(Math.abs(q1.y - q2.y) * 2)));
      const opz = (riga.opacita === undefined || riga.opacita === null || riga.opacita === ''
        ? MAPPA_OPACITA : Number(riga.opacita)) / 100;
      const fz = riga.foto;
      const icona = riga.icona || st.attributes.icon;
      /* SOLO LA FOTO riempie il cerchio: e' la foto del posto, quindi e' larga
         quanto il posto. L'ICONA no: resta piccola in mezzo, come nella mappa di
         serie, se no ingrandendo diventava un francobollo gigante. Se il cerchio
         e' piu' piccolo dell'icona, comanda il cerchio. */
      const dz = fz ? cerchio : Math.min(cerchio, Number(riga.dim) || MAPPA_DIM);
      const bordoz = riga.colore ? colz : 'rgba(255,255,255,.95)';
      const htmlz = fz
        ? '<div class="segno segno-foto" style="opacity:' + opz + ';background-color:' + colz
          + ';border-color:' + bordoz + ";background-image:url('" + fz + "')\"></div>"
        : '<div class="segno-zona" style="opacity:' + opz + ';color:' + colz + ';'
          + '--mdc-icon-size:' + Math.round(dz * 0.6) + 'px">'
          + (icona ? '<ha-icon icon="' + icona + '"></ha-icon>' : nome.charAt(0).toUpperCase())
          + '</div>';
      const faiz = () => L.divIcon({
        className: '', html: htmlz, iconSize: [dz, dz], iconAnchor: [dz / 2, dz / 2],
      });
      const mz = carta.usa(kz, () => L.marker([lat, lon],
        { icon: faiz(), pane: 'zone', interactive: false }));
      mz.setLatLng([lat, lon]);
      const segnoz = htmlz + '|' + dz;
      if (mz.__segno !== segnoz) {
        mz.setIcon(faiz());
        mz.__segno = segnoz;
      }
      // il nome: quello scelto a mano, se no quello di Home Assistant
      const etichetta = (riga.nome || '').trim() || nome;
      /* Il nome si scrive solo se nel cerchio ci sta, e GRANDE QUANTO IL CERCHIO:
         a misura fissa, su un cerchio piccolo la scritta lo riempiva tutta e
         sembrava un'etichetta appiccicata sopra. */
      /* La misura della scritta si ricava da QUANTO CI STA: un nome lungo come
         "Scuola Mattia" in un cerchio piccolo usciva fuori da tutte e due le
         parti. Si stringe finche' entra, e se per entrare dovesse diventare
         illeggibile (sotto gli otto punti) non si scrive per niente. */
      /* La misura dipende SOLO dal cerchio, non da quante lettere ha il nome: se
         no due zone grandi uguali si comportavano in modo diverso, una scriveva
         e l'altra no. Il nome compare da 55 punti in su, e sotto sparisce: cosi'
         un nome lungo non finisce mai appeso sopra un puntino. */
      const corpo = Math.round(Math.max(9, Math.min(14, cerchio * 0.06)));
      const scritta = cerchio >= 55
        ? '<span class="pillola" style="font-size:' + corpo + 'px">'
          + etichetta.replace(/&/g, '&amp;').replace(/</g, '&lt;') + '</span>'
        : '';
      /* TRAPPOLA: `setTooltipContent('')` non cancella niente. Leaflet, se il
         contenuto e' vuoto, esce subito e lascia quello di prima: allargando la
         mappa i cerchi diventavano puntini e i nomi restavano grandi uguali,
         appesi in mezzo al nulla. Per farli sparire bisogna STACCARE il nome. */
      if (!scritta) {
        if (mz.getTooltip()) mz.unbindTooltip();
      } else if (mz.getTooltip()) {
        mz.setTooltipContent(scritta);
      } else {
        mz.bindTooltip(scritta, {
          permanent: true, direction: 'center', className: 'nome-zona', pane: 'nomiZone',
        });
      }
      return;
    }

    /* il tracciamento: le posizioni delle ore passate, la linea che le unisce
       nell'ordine in cui sono arrivate e un pallino su ognuna, sbiadito verso il
       passato. Come fa la scheda mappa di Home Assistant: nessuna strada
       calcolata, se la linea taglia una curva li' manca una posizione. */
    const passato = (storia && storia[ent]) || [];
    const sua = (k) => mappaSua(riga, k, MAPPA_SUE);
    if (passato.length > 1) {
      /* Se l'aggancio alla via ha risposto, arriva un ELENCO di pezzi, uno per
         viaggio: l'andata e il ritorno sono pezzi diversi e restano staccati,
         invece di essere uniti da una linea che nessuno ha percorso. Senza
         aggancio il pezzo e' uno solo, la linea che unisce i punti registrati. */
      const agganciata = (strade && strade[ent]) || null;
      /* LA RAGNATELA DELL'ATTESA. Con le strade accese, la linea che unisce le
         posizioni cosi' come arrivano e' SEMPRE sbagliata: non sa niente delle
         soste e unisce in fila anche le centinaia di letture di chi e' fermo in
         cortile. Prima la si disegnava finche' il calcolatore non aveva
         risposto, cioe' per qualche secondo a ogni apertura e a ogni cursore
         mosso. Adesso, con le strade accese, finche' non c'e' niente di pronto
         restano solo i pallini, che sono le posizioni vere. La fila si disegna
         solo per chi le strade le ha spente. */
      const conStrade = (config.aggancio === 'valhalla' || config.aggancio === 'osrm' || config.aggancio === 'stadia') && !!sua('via');
      const pezzi = agganciata
        || (conStrade ? [] : [{ p: passato.map((p) => [p[0], p[1]]).concat([[lat, lon]]) }]);
      /* Lo scostamento e' in PIXEL, per restare visibile a ogni ingrandimento.
         Il guaio e' che da lontano un pixel vale tanti metri: a venti pixel, su
         una veduta di paese, la scia finiva cento metri fuori dalla strada e
         sembrava sbagliata. Quindi c'e' un tetto in METRI: le due corsie non si
         allontanano mai piu' di tanto sul terreno. Da vicino non cambia niente,
         da lontano le due linee si riavvicinano fino a sovrapporsi, che e'
         giusto: a quella scala la corsia non si vedrebbe comunque. */
      const SCOSTO_MAX = 24;   // metri fra le due corsie, al massimo
      let px = Number(sua('scosto')) || 0;
      const c0 = carta.mappa.getCenter();
      const q0 = carta.mappa.latLngToLayerPoint(c0);
      const q100 = carta.mappa.layerPointToLatLng(L.point(q0.x + 100, q0.y));
      const metriPerPixel = carta.mappa.distance(c0, q100) / 100;
      if (px > 0 && px * metriPerPixel > SCOSTO_MAX) px = SCOSTO_MAX / metriPerPixel;
      /* PROVA - OGNI PERSONA LA SUA CORSIA. Quando due persone fanno la stessa
         strada nello stesso verso le loro scie si disegnavano una sopra l'altra
         e se ne vedeva una sola. Ogni persona ha un posto fisso nell'elenco
         (0, 1, 2...) e la sua linea si sposta di tanti pixel in piu' verso la
         destra del senso di marcia: le scie restano affiancate, nell'ordine in
         cui sono le persone nella scheda. Anche qui c'e' un tetto in metri, cosi'
         da lontano si riavvicinano. */
      /* Il passo fra una corsia e l'altra e' lo spessore della linea piu' grossa
         della scheda piu' due pixel: con 7 fissi, mamma (spessore 6) finiva sotto
         le linee degli altri tre. Con piu' persone la corsia di ognuno sostituisce
         lo scostamento suo: scostamenti diversi (8, 10, 20) mescolavano l'ordine. */
      const persone = mappaRighe(config).filter((r) => !String(r.entity).startsWith('zone.'));
      const passoCorsia = Math.max(...persone.map((r) => Number(mappaSua(r, 'spessore', MAPPA_SUE)) || 4)) + 2;
      const PERSONA_MAX = 8;   // metri per ogni corsia, al massimo
      const posto = Math.max(0, persone.map((r) => r.entity).indexOf(ent));
      let extra = 0;
      if (persone.length > 1) {
        const passo = passoCorsia * metriPerPixel > PERSONA_MAX ? PERSONA_MAX / metriPerPixel : passoCorsia;
        extra = passo / 2 + posto * passo;
        px = 0;
      }
      const distingui = !!sua('andata_ritorno');
      const spessore = Number(sua('spessore')) || 4;
      /* Andata o ritorno si decide dalle LETTURE DEL GPS, guardando come cambia
         la distanza da casa nel tempo. Se in un pezzo la distanza cresce e poi
         cala, quello e' un giro: si taglia nel punto piu' lontano e le due meta'
         prendono l'etichetta giusta. Prima si guardava solo dove il pezzo
         cominciava e finiva, e un giro che parte da una sosta - non da casa -
         diventava tutto "ritorno". */
      const tratte = [];
      /* le linee come sono state DISEGNATE (gia' spostate di lato), con il loro
         orario: servono ai pallini per sedersi sulla scia del loro viaggio */
      const disegnate = [];
      pezzi.forEach((pezzo, n) => {
        /* Le SOSTE non si spezzano in andata e ritorno e non si chiamano cosi':
           uno fermo in un posto non sta ne' andando ne' tornando. Prima il
           cartellino di una sosta diceva "Andata di Mamma, dalle 07:55 alle
           08:21", che sono i ventisei minuti passati davanti alla scuola. */
        if (pezzo.fermo) {
          tratte.push({ p: pezzo.p, da: pezzo.da, a: pezzo.a, ritorno: false, fermo: true });
        } else if (agganciata && distingui) {
          versoDaiPunti(hass, pezzo, passato, n).forEach((x) => tratte.push(x));
        } else {
          tratte.push({ p: pezzo.p, da: pezzo.da, a: pezzo.a, ritorno: false });
        }
      });
      tratte.forEach((pezzo, n) => {
        const kl = 'l:' + ent + ':' + n;
        vivi.push(kl);
        const ritorno = pezzo.ritorno;
        // affiancate come le corsie, ognuna alla destra del proprio senso di
        // marcia: cosi' si vedono tutte e due anche sulla stessa via
        const linea = agganciata && (px || extra) ? mappaAffianca(carta.mappa, pezzo.p, px / 2 + extra) : pezzo.p;
        if (agganciata && !pezzo.fermo) disegnate.push({ p: linea, da: pezzo.da, a: pezzo.a });
        /* Tutte le scie uguali, andata e ritorno, per tutte le persone
           (anche quelle nuove): colore pieno e un po' piu' sottili. L'andata chiara
           e trasparente spariva sopra il satellite; il verso lo dicono le frecce. */
        const stile = {
          color: col,
          weight: Math.max(2, spessore * 0.8),
          opacity: 0.9,
          lineCap: 'round',
          lineJoin: 'round',
        };
        const via = carta.usa(kl, () => {
          const l = L.polyline(linea,
            Object.assign({ bubblingMouseEvents: false, pane: 'scie' }, stile));
          l.on('click', () => l.openTooltip());   // col dito, come per i pallini
          return l;
        });
        via.setLatLngs(linea);
        via.setStyle(stile);
        const verso = pezzo.fermo
          ? D.sosta
          : (distingui ? (ritorno ? D.ritorno : D.andata) : D.scia);
        const quando = pezzo.da
          ? D.cartellinoScia(verso, nome, mappaOra(pezzo.da), mappaOra(pezzo.a))
          : nome;
        if (via.getTooltip()) via.setTooltipContent(quando);
        else via.bindTooltip(quando, { sticky: true });

        /* LE FRECCE DEL SENSO DI MARCIA. Si mettono ogni tot PIXEL, non ogni
           tot metri: cosi' restano poche e ben distanziate a qualunque
           ingrandimento, invece di ammucchiarsi quando si guarda da lontano.
           Stanno sulla linea GIA' SPOSTATA di lato, quindi andata e ritorno
           hanno ognuna le sue e non si accavallano nemmeno sulla stessa via.
           Nelle soste non ce ne sono: uno fermo non ha un senso di marcia. */
        if (sua('frecce') && !pezzo.fermo && linea.length > 1) {
          /* Il colore delle frecce e' una scelta a parte, non quello della
             persona: una freccia dello stesso colore della scia ci sparisce
             dentro. Vuoto vuol dire bianche, che e' quello che si legge sopra
             qualunque colore. */
          const colFre = riga.frecce_colore
            ? mappaColore(riga.frecce_colore, carta.dentro, MAPPA_PRINCIPALE)
            : '#fff';
          const px2 = linea.map((cc) => carta.mappa.latLngToLayerPoint(cc));
          const PASSO = 260;   // pixel fra una freccia e l'altra
          let fatta = 0;
          let dove = PASSO * 0.6;   // la prima non proprio sul capo
          let strada = 0;
          for (let i = 1; i < px2.length && fatta < 40; i++) {
            const a2 = px2[i - 1];
            const b2 = px2[i];
            const dx = b2.x - a2.x;
            const dy = b2.y - a2.y;
            const seg = Math.sqrt(dx * dx + dy * dy);
            if (seg < 0.001) continue;
            while (strada + seg >= dove && fatta < 40) {
              const t = (dove - strada) / seg;
              const q = carta.mappa.layerPointToLatLng(
                L.point(a2.x + dx * t, a2.y + dy * t)
              );
              const giro = Math.round((Math.atan2(dx, -dy) * 180) / Math.PI);
              const kf = 'fr:' + ent + ':' + n + ':' + fatta;
              vivi.push(kf);
              const segno = giro + '|' + colFre;
              const fai = () => L.divIcon({
                className: '',
                html: '<div class="freccia" style="transform:rotate(' + giro + 'deg)">'
                  + '<svg viewBox="0 0 20 20"><path style="fill:' + colFre + '"'
                  + ' d="M10 2.5 L16.5 10.5 L12.4 10.5'
                  + ' L12.4 17 L7.6 17 L7.6 10.5 L3.5 10.5 Z"/></svg></div>',
                iconSize: [20, 20],
                iconAnchor: [10, 10],
              });
              const fr = carta.usa(kf, () => L.marker(q, {
                icon: fai(), pane: 'frecce', interactive: false,
              }));
              fr.setLatLng(q);
              if (fr.__segno !== segno) {
                fr.setIcon(fai());
                fr.__segno = segno;
              }
              fatta += 1;
              dove += PASSO;
            }
            strada += seg;
          }
        }
      });

      /* i pallini: ogni posizione che il telefono ha davvero mandato. Sono la
         verita', la linea e' solo il collegamento. */
      if (sua('pallini')) {
        const passo = Number(sua('passo_pallini')) || 0;
        const secondi = Number(sua('passo_pallini_sec')) || 0;
        const dim = Number(sua('pallini_dim')) || 5;
        const sfuma = !!sua('sfuma');
        /* prima il tempo (un pallino ogni tot secondi), poi i metri */
        let mostrati = secondi > 0 ? diradaNelTempo(passato, secondi * 1000) : passato;
        if (passo > 0) mostrati = assottiglia(mostrati, passo);
        /* SULLA SCIA. Il GPS mette la lettura a dieci, venti metri dalla strada, e
           accanto a una scia agganciata il pallino sembrava un altro percorso. Si
           sposta sul punto piu' vicino della linea del SUO viaggio (quella il cui
           orario lo contiene), solo se e' vicino: una lettura lontana resta dov'e',
           perche' e' la verita' e la linea potrebbe essere sbagliata. */
        const sullaScia = !!sua('pallini_sulla_scia') && disegnate.length > 0;
        const posti = sullaScia ? inFilaSullaScia(carta.mappa, disegnate, mostrati) : null;
        mostrati.forEach((p, n) => {
          const dove = posti ? posti[n] : [p[0], p[1]];
          const kp = 'p:' + ent + ':' + n;
          vivi.push(kp);
          const eta = sfuma ? 0.3 + (0.6 * n) / Math.max(1, mostrati.length - 1) : 0.9;
          /* Col dito non esiste il "passaggio sopra", quindi l'ora si apre al
             TOCCO: sul telefono, se no, non si vedeva mai. E
             `bubblingMouseEvents: false` serve perche' il tocco non arrivi anche
             alla mappa, che chiuderebbe subito quello che si e' appena aperto. */
          /* IL BORDINO BIANCO. Il pallino ha il colore della persona, come la sua
             scia, e da quando si siede SOPRA la scia (3.3.x) spariva dentro: un
             cerchio viola su una linea viola si vede solo dove sporge. Un filo
             bianco attorno lo stacca dalla linea senza cambiargli colore - quindi
             senza perdere il "di chi e'" - e funziona su qualunque sfondo, chiaro,
             scuro o satellite. Il bianco NON sbiadisce col pallino: sui piu' vecchi
             restava un filo grigino che non si vedeva. Sbiadisce solo il colore
             dentro, che e' quello che racconta l'eta' della lettura. */
          const c = carta.usa(kp, () => {
            const q = L.circleMarker(dove, {
              radius: dim / 2,
              weight: 1.5,
              color: '#fff',
              opacity: 1,
              fillColor: col,
              fillOpacity: eta,
              bubblingMouseEvents: false,
              pane: 'pallini',
            });
            q.on('click', () => q.openTooltip());
            return q;
          });
          c.setLatLng(dove);
          c.setStyle({
            color: '#fff', opacity: 1, weight: 1.5,
            fillColor: col, fillOpacity: eta, radius: dim / 2,
          });
          /* Il nome sopra e l'ora sotto, come fa la scheda di serie. Con la sola
             ora, dove due persone si incrociano non si capiva di chi fosse il
             pallino che si era appena toccato. */
          const detto = '<b>' + mappaSalta(nome) + '</b><br>' + mappaOra(p[2]);
          if (c.getTooltip()) c.setTooltipContent(detto);
          else c.bindTooltip(detto, { direction: 'top' });
        });
      }
    }

    /* la persona: l'icona con la sua foto, o l'iniziale sul suo colore.
       La foto caricata a mano vince su quella che espone Home Assistant, e
       grandezza e trasparenza sono di questa riga: ognuno la sua. */
    const k = 'i:' + ent;
    if (insieme.dentro[ent]) return;   // sta in un mucchio chiuso: c'e' il pallino
    vivi.push(k);
    /* Se il gruppo e' aperto a ventaglio, la faccia si disegna spostata di lato e
       un filo la ricollega al punto vero. Cosi' si vedono tutte senza dover
       ingrandire fino alle case. */
    /* L'ALONE DELLA PRECISIONE, come lo disegna la mappa di serie. Il telefono
       non manda un punto: manda un punto e un raggio, che vuol dire "sono qui
       dentro, da qualche parte". Senza quel cerchio una posizione buona e una
       presa male sembrano la stessa cosa. Sta sul punto VERO, non su quello
       spostato dal ventaglio, perche' e' l'imprecisione di quella lettura. */
    const prec = Number(st.attributes.gps_accuracy);
    if (mappaSua(riga, 'alone', MAPPA_SUE) && prec > 0) {
      const ka = 'a:' + ent;
      vivi.push(ka);
      const al = carta.usa(ka, () => L.circle([lat, lon], {
        radius: prec, color: col, weight: 1, opacity: 0.5,
        fillColor: col, fillOpacity: 0.12, interactive: false, pane: 'scie',
      }));
      al.setLatLng([lat, lon]);
      al.setRadius(prec);
      al.setStyle({ color: col, fillColor: col });
    }

    const largo = insieme.spostati[ent];
    const plat = largo ? largo[0] : lat;
    const plon = largo ? largo[1] : lon;
    if (largo) {
      const kf = 'f:' + ent;
      vivi.push(kf);
      const filo = carta.usa(kf, () => L.polyline([[lat, lon], largo], {
        color: col, weight: 1, opacity: 0.8, interactive: false,
      }));
      filo.setLatLngs([[lat, lon], largo]);
      filo.setStyle({ color: col });
    }
    const foto = riga.foto || st.attributes.entity_picture;
    const d = Number(riga.dim) || MAPPA_DIM;
    const op = (riga.opacita === undefined || riga.opacita === null || riga.opacita === ''
      ? MAPPA_OPACITA : Number(riga.opacita)) / 100;
    /* Il cerchio intorno alla foto e' del COLORE della persona, non bianco:
       con la foto che riempie il tondo il bianco non si vede e non si capisce
       di chi sia la scia. */
    // il cerchio intorno alla foto prende il COLORE SCELTO; chi non ne ha scelto
    // uno resta col filo bianco, che e' il vestito di sempre
    const bordo = riga.colore ? col : '#fff';
    const html =
      '<div class="segno" style="opacity:' + op + ';background-color:' + col +
      ';border-color:' + bordo + ';' +
      (foto ? "background-image:url('" + foto + "')" : '') + '">' +
      (foto ? '' : nome.charAt(0).toUpperCase()) + '</div>';
    const fai = () => L.divIcon({ className: '', html: html, iconSize: [d, d], iconAnchor: [d / 2, d / 2] });
    const m = carta.usa(k, () => L.marker([plat, plon], { icon: fai() }));
    m.setLatLng([plat, plon]);
    // l'icona si rifa' SOLO se cambia davvero, se no l'immagine lampeggia
    const segno = html + '|' + d;
    if (m.__segno !== segno) {
      m.setIcon(fai());
      m.__segno = segno;
    }
    /* anche qui il nome va scappato: Leaflet lo mette dentro dell'HTML, e un
       nome con dentro una parentesi angolare spaccava il riquadro */
    const detta = mappaSalta(nome);
    if (m.getTooltip()) m.setTooltipContent(detta);
    else m.bindTooltip(detta, { direction: 'top', offset: [0, -d / 2] });
    if (!m.getPopup()) {
      // `autoPan` spento: aprendo il cartellino la mappa NON si sposta piu'
      m.bindPopup('', { className: 'mappa-cart', closeButton: true, autoPan: false });
    }
    m.off('click');
    m.on('click', () => {
      // ritoccando la stessa faccia il cartellino si chiude: la X e' piccola
      if (m.isPopupOpen && m.isPopupOpen()) {
        m.closePopup();
        return;
      }
      const p = m.getPopup();
      const alto = carta.dentro.clientHeight;
      // non piu' alto della scheda, e largo quanto la scheda lo lascia essere:
      // `minWidth` serve o Leaflet lo stringe fino a mandare a capo ogni scritta
      p.options.maxHeight = Math.max(150, alto - 40);
      const largo = Math.max(240, Math.min(320, carta.dentro.clientWidth - 40));
      p.options.maxWidth = largo;
      p.options.minWidth = largo;
      p.options.offset = L.point(0, 0);

      /**
       * Il cartellino cresce verso l'alto a partire dall'icona, e la mappa NON
       * si sposta per fargli posto (autoPan spento). Se sporge dal bordo di
       * sopra lo si fa scendere di quel tanto: resta dentro la scheda senza che
       * niente si muova. Va rifatto ogni volta che dentro si apre qualcosa.
       */
      const sistema = () => {
        const el = p.getElement();
        if (!el) return;
        const y = carta.mappa.latLngToContainerPoint([lat, lon]).y;
        const sporge = el.offsetHeight + 16 - y;
        const giu = sporge > 0 ? Math.min(sporge, Math.max(0, alto - y - 20)) : 0;
        if (giu !== p.options.offset.y) {
          p.options.offset = L.point(0, giu);
          p.update();
        }
      };

      // si rifa' a ogni apertura: dentro c'e' l'ora, la via, la distanza da casa
      m.setPopupContent(cartellino(hass, ent, st, col, () => {
        setTimeout(sistema, 30);
      }, alto, config.sfondo_cartellino || MAPPA_SFONDO_CART));
      m.openPopup();
      setTimeout(sistema, 30);
    });
  });

  disegnaMucchi(carta, insieme, vivi, config);
  carta.butta(vivi);
}

/**
 * CHI E' NELLO STESSO POSTO DIVENTA UN PALLINO SOLO, col numero di quanti sono,
 * come fa la mappa di Home Assistant. Due persone ferme in casa hanno le icone
 * una sopra l'altra: quella sotto non si vede e non si riesce a toccare.
 * Si guarda la distanza in PIXEL: e' la sovrapposizione sullo schermo che da'
 * fastidio, e cambia a ogni ingrandimento. Quaranta pixel, come in HA.
 */
function chiSiPesta(carta, hass, config) {
  const fuori = { dentro: {}, mucchi: [], spostati: {} };
  if (!carta.dentro.clientWidth || !carta.dentro.clientHeight) return fuori;

  const gente = [];
  mappaRighe(config).forEach((riga) => {
    const ent = riga.entity;
    if (ent.indexOf('zone.') === 0) return;
    const st = hass.states[ent];
    if (!st) return;
    const lat = Number(st.attributes.latitude);
    const lon = Number(st.attributes.longitude);
    if (isNaN(lat) || isNaN(lon)) return;
    gente.push({
      ent: ent,
      lat: lat,
      lon: lon,
      d: Number(riga.dim) || MAPPA_DIM,
      nome: st.attributes.friendly_name || ent,
    });
  });
  if (gente.length < 2) return fuori;

  const dove = gente.map((g) => carta.mappa.latLngToContainerPoint([g.lat, g.lon]));
  const quale = new Array(gente.length).fill(-1);
  let quanti = 0;
  for (let i = 0; i < gente.length; i++) {
    if (quale[i] >= 0) continue;
    quale[i] = quanti;
    for (let j = i + 1; j < gente.length; j++) {
      if (quale[j] >= 0) continue;
      const dx = dove[i].x - dove[j].x;
      const dy = dove[i].y - dove[j].y;
      if (Math.sqrt(dx * dx + dy * dy) < MAPPA_MUCCHIO) quale[j] = quanti;
    }
    quanti += 1;
  }
  for (let g = 0; g < quanti; g++) {
    const chi = gente.filter((x, i) => quale[i] === g);
    if (chi.length < 2) continue;
    const mu = {
      chi: chi,
      chiave: 'g:' + chi.map((x) => x.ent).sort().join('+'),
      lat: chi.reduce((t, x) => t + x.lat, 0) / chi.length,
      lon: chi.reduce((t, x) => t + x.lon, 0) / chi.length,
      d: Math.max(34, ...chi.map((x) => x.d)),
    };
    fuori.mucchi.push(mu);

    if (carta.mucchioAperto === mu.chiave) {
      /* APERTO A VENTAGLIO. Le facce si mettono in cerchio intorno al punto, a
         una distanza che tiene conto di quante sono e di quanto sono grandi:
         cosi' si vedono e si toccano tutte, e la mappa resta dov'e'. */
      const centro = carta.mappa.latLngToContainerPoint([mu.lat, mu.lon]);
      const raggio = mu.d * 0.9 + chi.length * 6;
      chi.forEach((x, i) => {
        const angolo = (2 * Math.PI * i) / chi.length - Math.PI / 2;
        const q = carta.mappa.containerPointToLatLng([
          centro.x + raggio * Math.cos(angolo),
          centro.y + raggio * Math.sin(angolo),
        ]);
        fuori.spostati[x.ent] = [q.lat, q.lng];
      });
    } else {
      chi.forEach((x) => { fuori.dentro[x.ent] = true; });
    }
  }
  return fuori;
}

/** i pallini col numero, uno per mucchio */
function disegnaMucchi(carta, insieme, vivi, config) {
  const L = carta.L;
  const vela = (config.gruppo_opacita === undefined || config.gruppo_opacita === null
    || config.gruppo_opacita === '' ? MAPPA_MUCCHIO_OPACITA : Number(config.gruppo_opacita)) / 100;
  insieme.mucchi.forEach((mu) => {
    const k = mu.chiave;
    if (carta.mucchioAperto === k) return;   // aperto: si vedono le facce
    vivi.push(k);
    const html = '<div class="gruppo" style="width:' + mu.d + 'px;height:' + mu.d
      + 'px;opacity:' + vela + '">' + mu.chi.length + '</div>';
    const fai = () => L.divIcon({
      className: '', html: html, iconSize: [mu.d, mu.d], iconAnchor: [mu.d / 2, mu.d / 2],
    });
    const m = carta.usa(k, () => L.marker([mu.lat, mu.lon], { icon: fai(), zIndexOffset: 500 }));
    m.setLatLng([mu.lat, mu.lon]);
    if (m.__segno !== html) {
      m.setIcon(fai());
      m.__segno = html;
    }
    const nomi = mu.chi.map((x) => mappaSalta(x.nome)).join(', ');
    if (m.getTooltip()) m.setTooltipContent(nomi);
    else m.bindTooltip(nomi, { direction: 'top', offset: [0, -mu.d / 2] });
    m.off('click');
    m.on('click', (ev) => {
      /* SI APRE A VENTAGLIO, non si ingrandisce. Ingrandire non bastava mai: due
         persone a sedici metri restano attaccate anche allo zoom 19, e a forza
         di stringere la mappa finiva addosso alle case. Cosi' invece le facce si
         aprono subito e la mappa non si muove di un pixel. Si richiude toccando
         la mappa da un'altra parte. */
      if (ev && ev.originalEvent) ev.originalEvent.stopPropagation();
      m.closeTooltip();
      carta.mucchioAperto = k;
      if (carta.alloZoom) carta.alloZoom();
    });
  });
}

/**
 * ANDATA O RITORNO, DALLE LETTURE DEL GPS. Si prendono le posizioni vere di quel
 * pezzo e si guarda quanto distano da casa, in ordine di tempo:
 *  - se la distanza cresce e poi cala di almeno duecento metri, e' un GIRO: si
 *    taglia nel punto piu' lontano, prima andata e dopo ritorno;
 *  - se no e' un pezzo solo, e conta dove finisce rispetto a dove comincia: se
 *    finisce piu' vicino a casa e' un ritorno, se piu' lontano un'andata.
 * Non conta piu' dove il pezzo comincia in assoluto: un giro che parte da una
 * sosta lontana da casa prima diventava tutto "ritorno".
 */
function versoDaiPunti(hass, pezzo, punti, n) {
  const uno = (ritorno) => [{ p: pezzo.p, da: pezzo.da, a: pezzo.a, ritorno: ritorno }];
  const casa = hass.states['zone.home'];
  if (!casa || isNaN(Number(casa.attributes.latitude))) return uno(n % 2 === 1);
  const dove = [Number(casa.attributes.latitude), Number(casa.attributes.longitude)];

  const dentro = (punti || []).filter((p) => p[2] >= pezzo.da && p[2] <= pezzo.a);
  if (dentro.length < 3) return uno(ritornoOandata(hass, pezzo, n));

  const lontananza = dentro.map((p) => mappaDistanza(p, dove));
  let boa = 0;
  for (let i = 1; i < lontananza.length; i++) {
    if (lontananza[i] > lontananza[boa]) boa = i;
  }
  const partenza = lontananza[0];
  const arrivo = lontananza[lontananza.length - 1];

  // si allontana e poi torna indietro: e' un giro, si taglia sul punto di boa
  if (lontananza[boa] - partenza > 200 && lontananza[boa] - arrivo > 200) {
    const quando = dentro[boa][2];
    const g = pezzo.p;
    // dove cade il giro di boa sulla linea disegnata: il punto piu' vicino
    let taglio = 0;
    let vicino = Infinity;
    for (let i = 0; i < g.length; i++) {
      const d = mappaDistanza(g[i], dentro[boa]);
      if (d < vicino) {
        vicino = d;
        taglio = i;
      }
    }
    if (taglio > 1 && taglio < g.length - 2) {
      return [
        { p: g.slice(0, taglio + 1), da: pezzo.da, a: quando, ritorno: false },
        { p: g.slice(taglio), da: quando, a: pezzo.a, ritorno: true },
      ];
    }
  }

  // pezzo solo: conta se finisce piu' vicino o piu' lontano da casa
  if (Math.abs(arrivo - partenza) > 150) return uno(arrivo < partenza);
  return uno(ritornoOandata(hass, pezzo, n));
}

/** un pallino ogni tot metri: chi sta fermo ne manda centinaia sovrapposti */
function assottiglia(punti, metri) {
  const fuori = [punti[0]];
  for (let i = 1; i < punti.length; i++) {
    if (mappaDistanza(fuori[fuori.length - 1], punti[i]) >= metri) fuori.push(punti[i]);
  }
  const u = punti[punti.length - 1];
  if (fuori[fuori.length - 1] !== u) fuori.push(u);
  return fuori;
}

/** un pallino ogni tot millisecondi: con una lettura ogni dieci secondi la scia era un rosario */
function diradaNelTempo(punti, ms) {
  if (!punti.length) return punti;
  const fuori = [punti[0]];
  for (let i = 1; i < punti.length; i++) {
    if ((punti[i][2] || 0) - (fuori[fuori.length - 1][2] || 0) >= ms) fuori.push(punti[i]);
  }
  const u = punti[punti.length - 1];
  if (fuori[fuori.length - 1] !== u) fuori.push(u);
  return fuori;
}

/*
 * I pallini SULLA SCIA E IN FILA. Ogni lettura va sulla linea del viaggio che
 * contiene la sua ora, e dentro quel viaggio sempre PIU' AVANTI della lettura
 * precedente: se la strada ripassa vicino allo stesso posto (un giro
 * dell'isolato, un'inversione), il pallino delle 07:53 non torna indietro sul
 * tratto delle 07:51. Una lettura a piu' di SULLA_SCIA_MAX metri dalla linea
 * resta dov'e' e non sposta la fila: e' la verita', e' la linea che sbaglia.
 * Le letture che non cadono in nessun viaggio (soste, capi) restano dove sono.
 */
const SULLA_SCIA_MAX = 60;
function inFilaSullaScia(mappa, linee, punti) {
  const fuori = punti.map((p) => [p[0], p[1]]);
  linee.forEach((l) => {
    if (!l.da || !l.a || !l.p || l.p.length < 2) return;
    const px = l.p.map((c) => mappa.latLngToLayerPoint(c));
    // a che punto della linea si e' arrivati: segmento e frazione
    let seg = 1;
    let fraz = 0;
    punti.forEach((p, n) => {
      const t = p[2] || 0;
      if (t < l.da || t > l.a) return;
      const q = mappa.latLngToLayerPoint([p[0], p[1]]);
      let meglio = null;
      let dmin = Infinity;
      for (let i = seg; i < px.length; i++) {
        const a = px[i - 1];
        const b = px[i];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const lung = dx * dx + dy * dy;
        let k = lung > 0 ? ((q.x - a.x) * dx + (q.y - a.y) * dy) / lung : 0;
        k = Math.max(i === seg ? fraz : 0, Math.min(1, k));
        const x = a.x + dx * k;
        const y = a.y + dy * k;
        const d = (x - q.x) * (x - q.x) + (y - q.y) * (y - q.y);
        if (d < dmin) {
          dmin = d;
          meglio = { x: x, y: y, i: i, k: k };
        }
      }
      if (!meglio) return;
      const ll = mappa.layerPointToLatLng([meglio.x, meglio.y]);   // L qui non c'e': basta la coppia
      if (mappaDistanza([p[0], p[1]], [ll.lat, ll.lng]) > SULLA_SCIA_MAX) return;
      fuori[n] = [ll.lat, ll.lng];
      seg = meglio.i;
      fraz = meglio.k;
    });
  });
  return fuori;
}

/**
 * Andata o ritorno si decide da CASA, non dall'ordine: chi ARRIVA a casa sta
 * tornando, chi PARTE da casa sta andando. Se non si capisce, si alternano.
 */
function ritornoOandata(hass, pezzo, n) {
  const casa = hass.states['zone.home'];
  const p = pezzo.p;
  if (casa && !isNaN(Number(casa.attributes.latitude))) {
    const dove = [Number(casa.attributes.latitude), Number(casa.attributes.longitude)];
    const soglia = (Number(casa.attributes.radius) || 100) + 150;
    const arriva = mappaDistanza(p[p.length - 1], dove) < soglia;
    const parte = mappaDistanza(p[0], dove) < soglia;
    if (arriva && !parte) return true;
    if (parte && !arriva) return false;
  }
  return n % 2 === 1;
}

/**
 * Dove sono ADESSO, e basta. Serve al mirino: Home Assistant riporta la mappa
 * sulle entita', non su tutto il tragitto delle ore passate.
 */
export function posizioniAdesso(hass, config) {
  const fuori = [];
  /* Le ZONE non contano: sono posti fermi, non gente da seguire. Contandole, chi
     ha una zona lontana si ritrovava la mappa aperta su mezza valle. */
  mappaElenco(config).forEach((ent) => {
    if (ent.indexOf('zone.') === 0) return;
    const st = hass.states[ent];
    if (!st) return;
    const lat = Number(st.attributes.latitude);
    const lon = Number(st.attributes.longitude);
    if (isNaN(lat) || isNaN(lon)) return;
    fuori.push([lat, lon]);
  });
  return fuori;
}

/**
 * La firma delle entita' della mappa: se non cambia, non c'e' niente da
 * ridisegnare. Home Assistant riassegna `hass` a ogni cambiamento di qualunque
 * cosa in casa, e senza questo controllo si ridisegnerebbe di continuo.
 */
export function firmaEntita(hass, config) {
  return mappaElenco(config)
    .map((e) => {
      const s = hass.states[e];
      if (!s) return e + ':-';
      const a = s.attributes || {};
      /* Ci vanno anche la PRECISIONE e lo STATO: l'alone e' grande quanto la
         precisione e il cartellino dice "A casa" o "Fuori", e quelle due cose
         cambiano anche stando fermi. Senza, l'alone restava della misura di
         prima e il cartellino diceva ancora "Fuori" da dentro casa. */
      return e + ':' + a.latitude + ',' + a.longitude + ',' + a.entity_picture
        + ',' + a.gps_accuracy + ',' + s.state;
    })
    .join('|');
}
