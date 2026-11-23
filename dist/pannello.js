/**
 * IL PANNELLO delle persone e delle zone, come la mappa di Home Assistant
 * 2026 (chiesto da Gabriele il 22/11): una casella che galleggia sulla mappa
 * con due linguette. PERSONE: faccia, nome, dove sta e da quanto; il tocco
 * sposta la mappa su di lei e apre il suo dettaglio QUI DENTRO, con le voci
 * del cartellino e i sensori extra scelti nelle impostazioni. ZONE: icona o
 * foto,
 * nome e quante persone ci sono adesso; il tocco inquadra la zona.
 * Si nasconde con la freccetta e si riapre dal bottoncino; la scelta resta
 * nel browser. Si spegne del tutto con `pannello: false` nella scheda.
 */
import { daCasa, daQuanto, laCitta, laVia, rilevatoDa } from './cartellino.js?v=3.3.90';
import { MAPPA_PRINCIPALE, MAPPA_ZONA_SPENTA } from './costanti.js?v=3.3.90';
import { mappaColore, mappaRighe, mappaSalta } from './utili.js?v=3.3.90';

const CHIAVE = 'mappa-persone:pannello-chiuso';

function chiuso() {
  try { return localStorage.getItem(CHIAVE) === '1'; } catch (e) { return false; }
}

function ricorda(valore) {
  try { localStorage.setItem(CHIAVE, valore ? '1' : '0'); } catch (e) { /* pazienza */ }
}

/** l'icona di un sensore: la sua se ce l'ha, se no una sensata dal tipo */
function iconaSensore(s) {
  if (s.attributes.icon) return s.attributes.icon;
  const TIPI = {
    battery: 'mdi:battery',
    temperature: 'mdi:thermometer',
    humidity: 'mdi:water-percent',
    power: 'mdi:flash',
    energy: 'mdi:lightning-bolt',
    connectivity: 'mdi:wifi',
    illuminance: 'mdi:brightness-5',
    pressure: 'mdi:gauge',
    distance: 'mdi:map-marker-distance',
    speed: 'mdi:speedometer',
  };
  const dc = s.attributes.device_class;
  if (dc && TIPI[dc]) return TIPI[dc];
  return 'mdi:gauge';
}

/**
 * IL DETTAGLIO DENTRO IL PANNELLO (chiesto da Gabriele il 22/11): toccando un
 * nome le informazioni compaiono qui, non piu' nel cartellino sulla mappa.
 * In cima la freccetta per tornare all'elenco; sotto le stesse voci del
 * cartellino, poi i sensori extra scelti nelle impostazioni della persona
 * (la batteria del telefono, il Wi-Fi...), poi i due collegamenti di Maps.
 */
function dettaglio(corpo, carta, hass, riga, D, torna) {
  const P = (D && D.pannello) || {};
  const ent = riga.entity;
  const st = hass.states[ent];
  const lat = Number(st.attributes.latitude);
  const lon = Number(st.attributes.longitude);
  const nome = st.attributes.friendly_name || ent;
  const col = mappaColore(riga.colore, carta.dentro, MAPPA_PRINCIPALE);
  const foto = riga.foto || st.attributes.entity_picture;
  const dove = st.state === 'home' ? (D.cart && D.cart.aCasa) || 'A casa'
    : st.state === 'not_home' ? (D.cart && D.cart.fuori) || 'Fuori'
      : st.state;
  const prec = st.attributes.gps_accuracy;
  const coord = (!isNaN(lat) && !isNaN(lon)) ? lat.toFixed(5) + ', ' + lon.toFixed(5) : '';

  /* UN RIQUADRINO della griglia: etichetta piccola sopra, valore grande e
     pieno sotto. `classi` aggiunge ' largo' (tutta la riga) o ' piccolo'
     (valore in corpo minore, per le voci lunghe in fondo). Il valore arriva
     gia' scappato da chi chiama, perche' puo' contenere un'icona. */
  const tile = (etich, valoreHtml, classi) => (valoreHtml
    ? '<div class="pannello-tile' + (classi || '') + '"><span>' + mappaSalta(etich) + '</span>'
      + '<b>' + valoreHtml + '</b></div>'
    : '');

  /* I SENSORI EXTRA entrano nella stessa griglia: etichetta = il loro nome
     senza il nome della persona davanti, valore = icona + stato, colorati.
     La batteria e' verde se sta bene e rossa sotto il 20 per cento. */
  let sensori = '';
  const scelti = Array.isArray(riga.sensori) ? riga.sensori : [];
  scelti.forEach((id) => {
    const s = hass.states[id];
    if (!s) return;
    const unita = s.attributes.unit_of_measurement;
    const val = (s.state === 'unavailable' || s.state === 'unknown') ? '—'
      : s.state + (unita ? ' ' + unita : '');
    let chiamato = s.attributes.friendly_name || id;
    if (chiamato.toLowerCase().indexOf(nome.toLowerCase()) === 0) {
      const corto = chiamato.slice(nome.length).trim();
      if (corto) chiamato = corto;
    }
    let colIcona = 'var(--primary-color, #2196f3)';
    if (s.attributes.device_class === 'battery' && !isNaN(Number(s.state))) {
      colIcona = Number(s.state) <= 20
        ? 'var(--error-color, #db4437)' : 'var(--success-color, #4caf50)';
    }
    sensori += tile(chiamato,
      '<span class="tinta" style="color:' + colIcona + '">'
      + '<ha-icon icon="' + mappaSalta(iconaSensore(s)) + '"></ha-icon> '
      + mappaSalta(val) + '</span>');
  });

  /* via e comune insieme, e in fondo "rilevato da" e coordinate insieme:
     meno riquadri, piu' ordine */
  const viaTesto = [laVia(hass, ent), laCitta(hass, ent)].filter(Boolean).join(' · ');
  const fondoVal = [rilevatoDa(hass, st), coord].filter(Boolean).join(' · ');
  const fondoEt = [rilevatoDa(hass, st) ? D.cart.rilevatoDa : '', coord ? D.cart.coordinate : '']
    .filter(Boolean).join(' · ');

  const box = document.createElement('div');
  box.className = 'pannello-dettaglio';
  box.innerHTML =
    '<div class="pannello-capo">'
    + '<button class="pannello-torna" title="' + mappaSalta(P.torna || 'Torna all\'elenco') + '">&#x2039;</button>'
    + '<div class="ritrattino" style="background-color:' + col + ';border-color:' + col + ';'
    + (foto ? "background-image:url('" + foto + "')" : '') + '">'
    + (foto ? '' : mappaSalta(nome.charAt(0).toUpperCase())) + '</div>'
    + '<div class="dicitura"><b>' + mappaSalta(nome) + '</b>'
    + '<span class="sotto"><span class="pannello-stato' + (st.state === 'home' ? ' casa' : '') + '">'
    + mappaSalta(dove) + '</span> ' + daQuanto(st.last_changed, D) + '</span></div>'
    + '</div>'
    + '<div class="pannello-griglia">'
    + tile(D.cart.via, mappaSalta(viaTesto), ' largo')
    + tile(D.cart.precisione, isNaN(Number(prec)) ? '' : Math.round(prec) + ' m')
    + tile(D.cart.daCasa, mappaSalta(daCasa(hass, st)))
    + sensori
    + tile(fondoEt, mappaSalta(fondoVal), ' largo piccolo')
    + '</div>'
    + (coord
      ? '<div class="pannello-tasti">'
        + '<a target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query=' + lat + ',' + lon + '">'
        + '<ha-icon icon="mdi:map-marker"></ha-icon> Maps</a>'
        + '<a target="_blank" rel="noopener" href="https://www.google.com/maps/dir/?api=1&destination=' + lat + ',' + lon + '">'
        + '<ha-icon icon="mdi:navigation-variant"></ha-icon> ' + mappaSalta(D.portamiMaps) + '</a>'
        + '</div>'
      : '');
  box.querySelector('.pannello-torna').addEventListener('click', torna);
  corpo.appendChild(box);
}

export function disegnaPannello(carta, hass, config, D) {
  const dentro = carta.dentro;
  const P = (D && D.pannello) || {};
  let el = dentro.querySelector(':scope > .pannello');
  let bottone = dentro.querySelector(':scope > .pannello-apri');

  if (config.pannello === false) {
    if (el) el.remove();
    if (bottone) bottone.remove();
    carta.apriDettaglio = null;   // il tocco sulla faccia torna al cartellino
    return;
  }

  /* IL TOCCO SULLA FACCIA (chiesto da Gabriele il 22/11): niente piu'
     cartellino sulla mappa, si apre il dettaglio QUI nel pannello. Se il
     pannello era nascosto si riapre da solo: un primo giro lo ricrea, il
     secondo ci mette dentro la persona. */
  carta.apriDettaglio = (ent) => {
    ricorda(false);
    disegnaPannello(carta, hass, config, D);
    const aperto = dentro.querySelector(':scope > .pannello');
    if (!aperto) return;
    aperto.__tab = 'persone';
    aperto.__vista = ent;
    disegnaPannello(carta, hass, config, D);
  };

  if (chiuso()) {
    if (el) el.remove();
    if (!bottone) {
      bottone = document.createElement('button');
      bottone.className = 'pannello-apri';
      bottone.title = P.apri || 'Apri il pannello';
      bottone.addEventListener('click', () => {
        ricorda(false);
        disegnaPannello(carta, hass, config, D);
      });
      if (carta.L && carta.L.DomEvent) carta.L.DomEvent.disableClickPropagation(bottone);
      dentro.appendChild(bottone);
    }
    return;
  }
  if (bottone) bottone.remove();

  if (!el) {
    el = document.createElement('div');
    el.className = 'pannello';
    el.__tab = 'persone';
    el.innerHTML =
      '<div class="pannello-linguette">'
      + '<button class="linguetta" data-t="persone"></button>'
      + '<button class="linguetta" data-t="zone"></button>'
      + '<button class="pannello-chiudi">&#x2039;</button>'
      + '</div><div class="pannello-corpo"></div>';
    el.querySelectorAll('.linguetta').forEach((b) => b.addEventListener('click', () => {
      el.__tab = b.getAttribute('data-t');
      el.__vista = null;
      disegnaPannello(carta, hass, config, D);
    }));
    el.querySelector('.pannello-chiudi').addEventListener('click', () => {
      ricorda(true);
      disegnaPannello(carta, hass, config, D);
    });
    /* i tocchi sul pannello non devono trascinare o ingrandire la mappa */
    if (carta.L && carta.L.DomEvent) {
      carta.L.DomEvent.disableClickPropagation(el);
      carta.L.DomEvent.disableScrollPropagation(el);
    }
    dentro.appendChild(el);
  }

  const linguette = el.querySelectorAll('.linguetta');
  linguette[0].textContent = P.persone || 'Persone';
  linguette[1].textContent = P.zone || 'Zone';
  linguette.forEach((b) => {
    b.classList.toggle('scelta', b.getAttribute('data-t') === el.__tab);
  });
  el.querySelector('.pannello-chiudi').title = P.chiudi || 'Nascondi il pannello';

  const corpo = el.querySelector('.pannello-corpo');
  corpo.innerHTML = '';
  const righe = mappaRighe(config);

  /* il dettaglio di una persona: prende tutto il pannello, le linguette
     spariscono e si torna con la freccetta. Se la persona nel frattempo e'
     sparita dalla configurazione, si torna all'elenco da soli. */
  const testa = el.querySelector('.pannello-linguette');
  if (el.__vista) {
    const riga = righe.find((r) => r.entity === el.__vista);
    if (riga && hass.states[riga.entity]) {
      testa.style.display = 'none';
      dettaglio(corpo, carta, hass, riga, D, () => {
        el.__vista = null;
        disegnaPannello(carta, hass, config, D);
      });
      return;
    }
    el.__vista = null;
  }
  testa.style.display = '';

  if (el.__tab === 'persone') {
    righe.forEach((riga) => {
      const ent = riga.entity;
      if (ent.indexOf('zone.') === 0) return;
      const st = hass.states[ent];
      if (!st) return;
      const lat = Number(st.attributes.latitude);
      const lon = Number(st.attributes.longitude);
      const nome = st.attributes.friendly_name || ent;
      const col = mappaColore(riga.colore, carta.dentro, MAPPA_PRINCIPALE);
      const foto = riga.foto || st.attributes.entity_picture;
      const dove = st.state === 'home' ? (D.cart && D.cart.aCasa) || 'A casa'
        : st.state === 'not_home' ? (D.cart && D.cart.fuori) || 'Fuori'
          : st.state;
      const r = document.createElement('div');
      r.className = 'pannello-riga';
      r.innerHTML =
        '<div class="ritrattino" style="background-color:' + col + ';border-color:' + col + ';'
        + (foto ? "background-image:url('" + foto + "')" : '') + '">'
        + (foto ? '' : mappaSalta(nome.charAt(0).toUpperCase())) + '</div>'
        + '<div class="dicitura"><b>' + mappaSalta(nome) + '</b>'
        + '<span>' + mappaSalta(dove) + ' &middot; ' + daQuanto(st.last_changed, D) + '</span></div>';
      /* il tocco apre il dettaglio QUI DENTRO, non piu' il cartellino sulla
         mappa; la mappa si sposta comunque sulla persona, senza ingrandire */
      r.addEventListener('click', () => {
        el.__vista = ent;
        if (!isNaN(lat) && !isNaN(lon)) carta.mappa.panTo([lat, lon]);
        disegnaPannello(carta, hass, config, D);
      });
      corpo.appendChild(r);
    });
    return;
  }

  // le zone: quelle scelte nella scheda, con quante persone dentro adesso
  righe.forEach((riga) => {
    const ent = riga.entity;
    if (ent.indexOf('zone.') !== 0) return;
    const st = hass.states[ent];
    if (!st) return;
    const lat = Number(st.attributes.latitude);
    const lon = Number(st.attributes.longitude);
    const nome = riga.nome || st.attributes.friendly_name || ent;
    const colz = mappaColore(riga.colore, carta.dentro, MAPPA_ZONA_SPENTA);
    const quanti = (st.attributes.persons || []).length;
    const scritta = quanti === 0
      ? (P.nessuno || 'Nessuno qui')
      : (P.persona ? P.persona(quanti) : quanti + ' persone');
    const r = document.createElement('div');
    r.className = 'pannello-riga';
    r.innerHTML =
      '<div class="ritrattino" style="background-color:' + colz + ';'
      + (riga.foto ? "background-image:url('" + riga.foto + "')" : '') + '">'
      + (riga.foto ? '' : mappaSalta(nome.charAt(0).toUpperCase())) + '</div>'
      + '<div class="dicitura"><b>' + mappaSalta(nome) + '</b>'
      + '<span>' + mappaSalta(scritta) + '</span></div>';
    if (!isNaN(lat) && !isNaN(lon)) {
      r.addEventListener('click', () => {
        carta.mappa.setView([lat, lon], Math.max(carta.mappa.getZoom(), 15));
      });
    }
    corpo.appendChild(r);
  });
}
