import {
  MAPPA_AGGANCIO, MAPPA_ORE, MAPPA_RILEGGI, MAPPA_SFONDO, MAPPA_SUE, MAPPA_ZOOM,
} from './costanti.js?v=3.0.7';
import { MAPPA_STILE } from './stile.js?v=3.0.7';
import { Carta, caricaLeaflet, foglioLeaflet } from './carta.js?v=3.0.7';
import { disegnaEntita, firmaEntita, leggiStoria, posizioniAdesso } from './entita.js?v=3.0.7';
import { agganciaStrade } from './strade.js?v=3.0.7';
import { mappaElenco, mappaRighe, mappaSua } from './utili.js?v=3.0.7';

/**
 * LA SCHEDA. Tiene insieme i due pezzi e parla con Home Assistant: riceve la
 * configurazione e `hass`, decide QUANDO ridisegnare, e lascia il COME alla
 * carta e alle entita'.
 *
 * Le trappole gia' pagate, da non rifare mai:
 *  - `hass` puo' arrivare PRIMA di `setConfig` (nell'anteprima succede sempre):
 *    senza guardia ogni assegnazione lancia e la finestra non si apre piu';
 *  - si ridisegna solo se cambia la firma delle entita' della mappa;
 *  - `invalidateSize` solo a misura cambiata, se no la scheda trema all'infinito.
 */
/**
 * La scheda sta dentro la finestra delle impostazioni? Serve saperlo perche' in
 * quel momento di schede ce ne sono DUE: quella vera dietro e l'anteprima. Se si
 * scambiano la memoria dell'inquadratura si danno fastidio a vicenda: sposti
 * l'anteprima, quella dietro si riquadra sulle persone e scrive la sua posizione
 * nella memoria comune, e appena l'anteprima si rifa' ci finisce sopra. Da fuori
 * sembra che la mappa "torni in cima" da sola a ogni lettera che scrivi.
 */
function inAnteprima(chi) {
  let n = chi;
  for (let giro = 0; n && giro < 30; giro++) {
    if (n.tagName === 'HUI-DIALOG-EDIT-CARD' || n.tagName === 'HUI-CARD-PREVIEW') return true;
    n = n.parentNode || (n.getRootNode && n.getRootNode().host);
    if (n === document) return false;
  }
  return false;
}

/**
 * Le misure della via di ogni persona, in una riga sola. Servono a capire CHI e'
 * cambiato quando si tocca un cursore: si rifa' la scia solo a quella persona e
 * SUBITO, senza aspettare che qualcuno ricarichi la pagina. Prima si cambiava
 * un numero e non succedeva niente, e sembrava che il cursore fosse rotto.
 */
function firmaVie(config) {
  const f = {};
  mappaRighe(config).forEach((r) => {
    f[r.entity] = ['via', 'profilo', 'via_salto', 'via_giro', 'fermo_m', 'pausa_min', 'sosta_linea']
      .map((k) => mappaSua(r, k, MAPPA_SUE)).join('|');
  });
  return f;
}

export class MappaPersone extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._storia = {};   // posizioni passate, per entita
    this._strade = {};   // le stesse, agganciate alle vie, se richiesto
    this._letta = 0;     // quando si e' letto lo storico l'ultima volta
  }

  static getConfigElement() {
    return document.createElement('mappa-persone-editor');
  }

  static getStubConfig(hass) {
    const chi = Object.keys((hass && hass.states) || {}).filter((e) => e.indexOf('person.') === 0);
    return { entities: chi.slice(0, 1) };
  }

  setConfig(config) {
    const prima = this._config;
    this._config = Object.assign({ entities: [], ore: MAPPA_ORE, sfondo: MAPPA_SFONDO, ingrandimento: MAPPA_ZOOM, aggancio: MAPPA_AGGANCIO }, config || {});
    // se cambiano le entita' o le ore, lo storico che si ha in mano non vale piu'
    const diverso =
      !prima ||
      prima.ore !== this._config.ore ||
      prima.aggancio !== this._config.aggancio ||
      mappaElenco(prima).join(',') !== mappaElenco(this._config).join(',');
    let rifare = false;
    if (diverso) {
      this._storia = {};
      this._strade = {};
      this._letta = 0;
    } else if (prima) {
      // toccata una misura della via a UNA persona: si butta solo la sua scia
      const p = firmaVie(prima);
      const o = firmaVie(this._config);
      Object.keys(o).forEach((e) => {
        if (o[e] === p[e]) return;
        delete this._strade[e];
        rifare = true;
      });
    }
    if (!this.shadowRoot.firstChild) this._nasci();
    else {
      this._dipingi();
      if (diverso) this._storico();
      else if (rifare) this._aggancia();
    }
  }

  getCardSize() {
    return 8;
  }

  getGridOptions() {
    /* Quanto e' alta la scheda lo decide SOLO la linguetta Layout di Home
       Assistant, trascinando la maniglia. Qui si dice la misura di partenza e i
       minimi, e basta. */
    return { columns: 'full', min_columns: 6, rows: 8, min_rows: 4 };
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._config) return;   // hass puo' arrivare prima di setConfig
    const firma = firmaEntita(hass, this._config);
    if (firma === this._firma) return;   // in casa e' cambiato altro, non roba nostra
    this._firma = firma;
    if (!this._letta) this._storico();
    else this._adesso();
    this._dipingi();
  }

  connectedCallback() {
    if (this._carta) setTimeout(() => this._carta.rimisura(), 60);
    this._sveglia = setInterval(() => this._storico(), MAPPA_RILEGGI * 60000);
  }

  disconnectedCallback() {
    if (this._occhio) this._occhio.disconnect();
    this._occhio = null;
    clearInterval(this._sveglia);
  }

  async _nasci() {
    const stile = document.createElement('style');
    stile.textContent = (await foglioLeaflet()) + MAPPA_STILE;
    const L = await caricaLeaflet();

    const scheda = document.createElement('ha-card');
    const dentro = document.createElement('div');
    dentro.className = 'carta';
    scheda.appendChild(dentro);
    this.shadowRoot.innerHTML = '';
    this.shadowRoot.appendChild(stile);
    this.shadowRoot.appendChild(scheda);
    this._scheda = scheda;

    this._carta = new Carta(
      L, dentro, () => this._centra(), this._config.sfondo, () => this._dipingi(),
      () => (inAnteprima(this)
        ? ':anteprima'
        : mappaElenco(this._config).join(','))
    );
    /* Adesso la scheda E' attaccata alla pagina: si sa se e' l'anteprima o
       quella vera, quindi la memoria dell'inquadratura si legge ORA, prima di
       disegnare. Leggendola dentro il costruttore si finiva sulla memoria
       sbagliata e la mappa saltava sulle persone a ogni lettera scritta. */
    this._carta.riprendi();
    this._occhio = new ResizeObserver(() => this._carta.rimisura());
    this._occhio.observe(dentro);
    [60, 300, 900].forEach((t) => setTimeout(() => this._carta.rimisura(), t));

    this._dipingi();
    this._storico();
  }

  /**
   * LA POSIZIONE APPENA ARRIVATA, SUBITO IN ELENCO. Lo storico si rilegge ogni
   * cinque minuti, e in mezzo la faccia si spostava ma il pallino non compariva:
   * si vedeva la persona muoversi su una scia ferma. Qui la posizione nuova si
   * aggiunge da sola, appena Home Assistant la annuncia.
   * Le strade non si richiedono per questo: la scia agganciata si rifa' al
   * prossimo giro dei cinque minuti, se no ogni lettura sarebbe una richiesta.
   */
  _adesso() {
    mappaRighe(this._config).forEach((r) => {
      if (r.entity.indexOf('zone.') === 0) return;
      const elenco = this._storia[r.entity];
      if (!elenco) return;
      const st = this._hass.states[r.entity];
      if (!st) return;
      const la = Number(st.attributes.latitude);
      const lo = Number(st.attributes.longitude);
      if (isNaN(la) || isNaN(lo)) return;
      const quando = new Date(st.last_updated || st.last_changed).getTime();
      if (isNaN(quando)) return;
      const u = elenco[elenco.length - 1];
      // niente doppioni e niente roba piu' vecchia di quella che c'e' gia'
      if (u && (quando <= u[2] || (u[0] === la && u[1] === lo))) return;
      elenco.push([la, lo, quando, Number(st.attributes.gps_accuracy), 0]);
    });
  }

  /** lo storico, una richiesta alla volta e senza rimartellare se va male */
  async _storico() {
    const ore = Number(this._config && this._config.ore) || 0;
    if (!this._hass || !ore || this._leggendo) return;
    this._leggendo = true;
    try {
      this._storia = await leggiStoria(this._hass, mappaRighe(this._config), ore);
      this._letta = Date.now();
      this._dipingi();
      this._aggancia();
    } catch (e) {
      this._letta = Date.now();
      console.warn('[mappa-persone] storico non letto:', e);
    }
    this._leggendo = false;
  }

  /**
   * L'ingrandimento di partenza. L'altezza non si tocca: quella la comanda la
   * linguetta Layout di Home Assistant, come per ogni altra scheda.
   */
  _misure() {
    const z = Number(this._config.ingrandimento) || MAPPA_ZOOM;
    if (z !== this._carta.ingrandimento) {
      // cambiando l'ingrandimento la mappa si riquadra SUBITO, se no si muove il
      // cursore e non succede niente finche' qualcuno non si sposta
      this._carta.ingrandimento = z;
      this._carta.mosso = false;
      this._carta.inquadra();
    }
  }

  /**
   * L'aggancio alle strade, se e' stato chiesto. Si manda la traccia com'e' al
   * motore e si disegna quello che risponde, uno alla volta cosi' la mappa si
   * riempie mano a mano. Se non risponde resta la linea che unisce i punti.
   */
  async _aggancia() {
    const motore = this._config && this._config.aggancio;
    if (motore !== 'valhalla' && motore !== 'osrm') {
      if (Object.keys(this._strade).length) {
        this._strade = {};
        this._dipingi();
      }
      return;
    }
    /* ogni persona ha le sue misure: il buco oltre il quale si calcola la via,
       quanto puo' allungare il percorso, cosa considera una sosta, con che
       mezzo. Stanno dentro la sua casella, sotto "La via e i viaggi". */
    /* tutte le persone insieme, non una dopo l'altra: prima la seconda doveva
       aspettare che finisse la prima, e la sua scia arrivava con minuti di
       ritardo */
    await Promise.all(mappaRighe(this._config).map(async (riga) => {
      const ent = riga.entity;
      if (!this._storia[ent]) return;
      if (!mappaSua(riga, 'via', MAPPA_SUE)) {
        if (this._strade[ent]) {
          delete this._strade[ent];
          this._dipingi();
        }
        return;
      }
      // ogni viaggio compare appena e' pronto, senza aspettare gli altri
      const geo = await agganciaStrade(this._storia[ent], {
        motore: motore,
        profilo: mappaSua(riga, 'profilo', MAPPA_SUE),
        salto: Number(mappaSua(riga, 'via_salto', MAPPA_SUE)),
        giro: Number(mappaSua(riga, 'via_giro', MAPPA_SUE)),
        fermo: Number(mappaSua(riga, 'fermo_m', MAPPA_SUE)),
        pausa: Number(mappaSua(riga, 'pausa_min', MAPPA_SUE)),
        sostaLinea: Number(mappaSua(riga, 'sosta_linea', MAPPA_SUE)),
      }, (finora) => {
        this._strade[ent] = finora;
        this._dipingi();
      });
      if (geo) {
        this._strade[ent] = geo;
        this._dipingi();
      }
    }));
  }

  /** il mirino: riprende a seguirle dopo che la mappa e' stata spostata a mano */
  _centra() {
    if (!this._carta || !this._hass || !this._config) return;
    this._carta.centra(posizioniAdesso(this._hass, this._config));
  }

  _dipingi() {
    if (!this._carta || !this._hass || !this._config) return;
    this._misure();
    if (this._config.sfondo !== this._sfondoScritto) {
      this._sfondoScritto = this._config.sfondo;
      this._carta.sfondo(this._config.sfondo);
    }
    disegnaEntita(this._carta, this._hass, this._config, this._storia, this._strade);
    // si inquadra su DOVE SONO ADESSO, non su tutto il tragitto: ricaricando la
    // pagina si vede il vivo, e l'ingrandimento predefinito comanda per davvero.
    // La scia resta disegnata: per vederla tutta si allarga a mano.
    this._carta.inquadra(posizioniAdesso(this._hass, this._config));
    setTimeout(() => this._carta.rimisura(), 30);
  }
}
