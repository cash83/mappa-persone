import { MAPPA_BASE, MAPPA_SFONDI, MAPPA_SFONDO, MAPPA_ZOOM } from './costanti.js?v=3.3.18';

/**
 * LA GESTIONE DELLA MAPPA. Qui dentro sta tutto e solo quello che riguarda la
 * carta: caricare Leaflet, gli sfondi col tasto in alto a destra, la misura in
 * pixel, l'inquadratura, e i livelli che si riusano invece di rifarli.
 * Chi c'e' sopra la mappa non lo sa e non lo deve sapere: quello e' `entita.js`.
 */

let mappaFoglio = null;

/**
 * L'INQUADRATURA RICORDATA. Cambiando una qualsiasi impostazione, Home Assistant
 * non aggiorna la scheda: la RICREA da zero. Senza questa memoria la mappa
 * tornava ogni volta sulle persone, e chi stava guardando un incrocio a mezzo
 * paese di distanza doveva ritrovarselo da capo a ogni cursore mosso. Sta fuori
 * dalla classe apposta: deve sopravvivere alla scheda.
 */
const VISTA = new Map();
// si lascia raggiungibile da fuori: serve per capire, quando la mappa non resta
// dove la si e' messa, se la memoria e' stata scritta o no
if (typeof window !== 'undefined') window.__mappaVista = VISTA;

/** Leaflet dal box, non da internet: una volta sola per tutta la pagina */
export async function caricaLeaflet() {
  if (window.L && window.L.map) return window.L;
  if (!window.__mappaPersoneLeaflet) {
    window.__mappaPersoneLeaflet = new Promise((ok, no) => {
      const s = document.createElement('script');
      s.src = MAPPA_BASE + 'leaflet.js';
      s.onload = () => ok(window.L);
      s.onerror = () => no(new Error('leaflet.js non caricato'));
      document.head.appendChild(s);
    });
  }
  return window.__mappaPersoneLeaflet;
}

/** il foglio di stile di Leaflet, come testo da infilare nello shadow DOM */
export async function foglioLeaflet() {
  if (mappaFoglio === null) {
    const r = await fetch(MAPPA_BASE + 'leaflet.css');
    mappaFoglio = await r.text();
  }
  return mappaFoglio;
}

export class Carta {
  /**
   * @param L Leaflet
   * @param dentro il div che la contiene
   * @param suCentra cosa fare quando si tocca il mirino (torna sulle entita')
   * @param sfondo quale sfondo mostrare all'apertura
   */
  constructor(L, dentro, suCentra, sfondo, alloZoom, chiave, D) {
    this.L = L;
    this.D = D || {};
    this.dentro = dentro;
    this.liv = {};            // livelli riusati per chiave
    this.mosso = false;       // l'utente l'ha spostata: da qui non si inquadra piu'
    this.mucchioAperto = null;   // quale gruppo di icone e' aperto a ventaglio
    this._nostro = false;     // il movimento in corso e' nostro
    this._misura = { l: 0, a: 0 };
    this.ingrandimento = MAPPA_ZOOM;   // fin dove si puo' stringere

    this.mappa = L.map(dentro, {
      zoomControl: true,
      attributionControl: true,
      fadeAnimation: false,   // se no i tasselli restano trasparenti
    }).setView([46.5, 11.35], 13);

    /* Tre piani nostri, sotto quello delle persone (che sta a 600). Le zone sono
       lo SFONDO: la foto della zona sta sotto il suo nome, e tutti e due stanno
       sotto le facce e il pallino del gruppo, che sono la roba che si guarda. */
    /* L'ORDINE, dal basso: la foto della zona, poi le scie e i pallini, poi il
       nome della zona, e sopra a tutto le facce (600, di Leaflet).
       I pallini DEVONO stare sopra la foto della zona. Sono le posizioni vere, e
       dentro casa ce ne sono sempre parecchie: con la foto sopra sparivano, e
       non c'era verso ne' di vederle ne' di toccarle. Il nome della zona invece
       resta sopra i pallini, se no una scia fitta lo rendeva illeggibile.
       E la zona non intercetta il tocco: e' disegno, non un bottone. Non basta
       spegnerlo sul piano, perche' Leaflet lo riaccende sul singolo segno
       (`.leaflet-marker-icon.leaflet-interactive`): si spegne anche li', con
       `interactive: false` sul segno della zona. */
    const piano = (nome, z, tocco) => {
      const el = this.mappa.createPane(nome);
      el.style.zIndex = z;
      if (!tocco) el.style.pointerEvents = 'none';
      return el;
    };
    piano('zone', 450, false);
    piano('scie', 455, true);
    /* i pallini su un piano loro, SOPRA tutte le scie: con piu' persone la scia
       di chi viene disegnato dopo copriva i pallini di chi c'era prima. Il tocco
       resta acceso, perche' il pallino apre l'ora. */
    piano('pallini', 457, true);
    // le frecce sopra TUTTE le scie, se no la linea di chi e' disegnato dopo le copriva
    piano('frecce', 458, false);
    piano('nomiZone', 465, false);

    /* La chiave della memoria e' una FUNZIONE, non un testo fisso: al momento in
       cui la carta nasce la scheda potrebbe non essere ancora attaccata alla
       pagina, e allora non si sa nemmeno se e' l'anteprima della finestra delle
       impostazioni o quella vera sulla plancia. Chiedendola quando serve, la
       risposta e' sempre giusta. */
    this.chiave = typeof chiave === 'function' ? chiave : () => (chiave || 'una');

    this._sfondi(sfondo);
    this._mirino(suCentra);

    // Appena la sposti a mano, la mappa smette di riquadrare da sola. Attenzione:
    // anche l'inquadratura NOSTRA fa scattare 'zoomstart', e senza la guardia la
    // mappa si crederebbe spostata dall'utente subito dopo essersi inquadrata da
    // sola: poi arriva lo storico e non riquadra piu' niente.
    const mano = () => { if (!this._nostro) this.mosso = true; };
    this.mappa.on('dragstart', mano);
    this.mappa.on('zoomstart', mano);

    /* I nomi che compaiono passandoci sopra a volte restano appesi: col dito il
       "sei uscito" non arriva mai. Appena si tocca la mappa si chiudono tutti.
       Quelli SEMPRE ACCESI - il nome delle zone - si lasciano stare. */
    const chiudiNomi = () => {
      this.mappa.eachLayer((l) => {
        const t = l.getTooltip && l.getTooltip();
        if (t && !t.options.permanent) l.closeTooltip();
      });
    };
    this.mappa.on('dragstart', chiudiNomi);
    this.mappa.on('zoomstart', chiudiNomi);
    this.mappa.on('click', chiudiNomi);

    // toccando la mappa fuori dal gruppo, il ventaglio si richiude
    this.mappa.on('click', () => {
      if (!this.mucchioAperto) return;
      this.mucchioAperto = null;
      if (alloZoom) alloZoom();
    });
    this.mappa.on('moveend', () => this._ricorda());
    // lo scostamento fra andata e ritorno e' in pixel: a ogni ingrandimento va
    // rifatto, se no le due linee si allontanano o si sovrappongono
    this.alloZoom = alloZoom || null;
    if (alloZoom) this.mappa.on('zoomend', () => alloZoom());
  }

  /** dove siamo adesso, per ritrovarlo quando la scheda viene ricreata */
  _ricorda() {
    const c = this.mappa.getCenter();
    VISTA.set(this.chiave(), {
      lat: c.lat, lon: c.lng, zoom: this.mappa.getZoom(), mosso: this.mosso,
    });
  }

  /**
   * Si riparte da dove si era rimasti. Va chiamata quando la scheda e' gia'
   * attaccata alla pagina: e' li' che la chiave diventa affidabile. Se l'utente
   * l'aveva spostata a mano, la mappa non si riquadra piu' da sola.
   */
  riprendi() {
    const vista = VISTA.get(this.chiave());
    if (!vista || isNaN(vista.lat)) return false;
    this._nostro = true;
    this.mappa.setView([vista.lat, vista.lon], vista.zoom, { animate: false });
    setTimeout(() => { this._nostro = false; }, 0);
    this.mosso = vista.mosso;
    return true;
  }

  /** stradale e satellite, col tasto in alto a destra */
  _sfondi(scelto) {
    const scelte = {};
    this.strati = {};
    /* Il tasto in alto a destra scriveva i nomi in italiano anche in inglese:
       le traduzioni c'erano gia' ma le usava solo la finestra delle
       impostazioni. Siccome l'etichetta e' anche quello che Leaflet rimanda
       indietro quando uno la sceglie, si tiene una tabella etichetta -> chiave:
       tradurre senza quella avrebbe rotto il riconoscimento. */
    const daEtichetta = {};
    MAPPA_SFONDI.forEach((s) => {
      const fondo = this.L.tileLayer(s.url, s.opzioni);
      // certi sfondi hanno le scritte in un secondo strato da mettere sopra
      const strato = s.sopra
        ? this.L.layerGroup([fondo, this.L.tileLayer(s.sopra, s.opzioni)])
        : fondo;
      const etichetta = (this.D.sfondi && this.D.sfondi[s.chiave]) || s.nome;
      scelte[etichetta] = strato;
      daEtichetta[etichetta] = s.chiave;
      this.strati[s.chiave] = strato;
    });
    this.L.control.layers(scelte, null, { position: 'topright' }).addTo(this.mappa);
    // scegliendolo col tasto, quello che comanda e' l'ultimo tocco dell'utente
    this.mappa.on('baselayerchange', (ev) => {
      const c = daEtichetta[ev.name];
      if (c) this._sfondoOra = c;
    });
    this.sfondo(scelto);
  }

  /** mette lo sfondo chiesto, se non c'e' gia' */
  sfondo(chiave) {
    if (!this.strati) return;
    const k = this.strati[chiave] ? chiave : MAPPA_SFONDO;
    if (this._sfondoOra === k) return;
    Object.keys(this.strati).forEach((x) => {
      if (x !== k && this.mappa.hasLayer(this.strati[x])) this.mappa.removeLayer(this.strati[x]);
    });
    if (!this.mappa.hasLayer(this.strati[k])) this.strati[k].addTo(this.mappa);
    this._sfondoOra = k;
  }

  /**
   * Il mirino sotto i tasti dell'ingrandimento, come sulla mappa di Home
   * Assistant: riporta l'inquadratura sulle entita'. Si costruisce a mano un
   * controllo di Leaflet, e la classe `leaflet-bar` gli da' lo stesso vestito
   * dei tasti + e -.
   */
  _mirino(suCentra) {
    if (!suCentra) return;
    const L = this.L;
    const Mirino = L.Control.extend({
      onAdd: () => {
        const box = L.DomUtil.create('div', 'leaflet-bar mappa-mirino');
        const a = L.DomUtil.create('a', '', box);
        a.href = '#';
        a.title = this.D.mirino || 'Torna sulle entita';
        a.setAttribute('role', 'button');
        L.DomEvent.on(a, 'click', (ev) => {
          L.DomEvent.stop(ev);   // se no la pagina salta in cima per via dell'href
          suCentra();
        });
        L.DomEvent.disableClickPropagation(box);
        return box;
      },
    });
    new Mirino({ position: 'topleft' }).addTo(this.mappa);
  }

  /** torna a inquadrare quello che le si da', anche se l'utente aveva spostato */
  centra(punti) {
    this.mosso = false;
    this.inquadra(punti);
  }

  /** Leaflet va avvisato quando cambia la misura, ma SOLO se e' cambiata davvero */
  rimisura() {
    const l = this.dentro.clientWidth;
    const a = this.dentro.clientHeight;
    if (!l || !a) return;
    const suo = this.mappa.getSize();
    if (l === this._misura.l && a === this._misura.a && suo.x === l && suo.y === a) return;
    this._misura = { l: l, a: a };
    this.mappa.invalidateSize({ animate: false });
    this.inquadra();   // adesso che la misura c'e', l'inquadratura ha senso
  }

  /**
   * Inquadra i punti che le sono stati dati. Solo con una misura vera in pixel:
   * su una mappa larga zero (succede nell'anteprima della finestra di modifica)
   * fitBounds calcola lo zoom che fa entrare il mondo intero, e si vede il
   * planisfero vuoto.
   */
  inquadra(punti) {
    if (punti) this._punti = punti;
    const p = this._punti;
    if (!p || !p.length || this.mosso) return;
    if (!this.dentro.clientWidth || !this.dentro.clientHeight) return;
    // `ingrandimento` e' il limite: inquadrando non si stringe oltre. Senza,
    // due persone ferme a venti metri l'una dall'altra fanno saltare la mappa
    // addosso alle case e non si capisce piu' dove si e'.
    const z = Number(this.ingrandimento) || MAPPA_ZOOM;
    this._nostro = true;
    if (p.length === 1) this.mappa.setView(p[0], z, { animate: false });
    else this.mappa.fitBounds(this.L.latLngBounds(p).pad(0.5), { animate: false, maxZoom: z });
    setTimeout(() => { this._nostro = false; }, 0);
  }

  /** il livello di questa chiave: si crea una volta sola e poi si aggiorna */
  usa(chiave, fai) {
    if (this.liv[chiave]) return this.liv[chiave];
    const l = fai();
    this.liv[chiave] = l;
    l.addTo(this.mappa);
    return l;
  }

  /** via tutti i livelli che non compaiono piu' nell'elenco dei vivi */
  butta(vivi) {
    Object.keys(this.liv).forEach((k) => {
      if (vivi.indexOf(k) < 0) {
        // prima si chiude quello che ci sta appeso, se no non si chiude piu'
        const l = this.liv[k];
        if (l.closeTooltip) l.closeTooltip();
        if (l.closePopup) l.closePopup();
        this.mappa.removeLayer(l);
        delete this.liv[k];
      }
    });
  }
}
