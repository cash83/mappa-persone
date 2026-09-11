import {
  MAPPA_AGGANCIO, MAPPA_DIM, MAPPA_OPACITA, MAPPA_ORE, MAPPA_SFONDI, MAPPA_SFONDO,
  MAPPA_MUCCHIO_OPACITA, MAPPA_SFONDO_CART, MAPPA_SUE, MAPPA_VERSIONE, MAPPA_ZOOM,
} from './costanti.js?v=3.0.5';
import { mappaRighe, mappaSua } from './utili.js?v=3.0.5';
import { caricaFoto, togliFoto } from './foto.js?v=3.0.5';
import { parla } from './lingue.js?v=3.0.5';

/**
 * La finestra delle impostazioni.
 *
 * IL DIFETTO CHE HA BLOCCATO LA PAGINA, da non rifare mai: se si ricostruiscono
 * le righe a ogni `hass`, i selettori delle entita' rinascono, rimandano
 * `value-changed`, che fa ripartire tutto - e la pagina si inchioda. Quindi la
 * struttura si rifa' SOLO quando cambia l'elenco delle entita'; per tutto il
 * resto si aggiornano i valori sugli elementi che ci sono gia'.
 *
 * Altra trappola: in `data` ci vanno SOLO i valori veri. Se ci finiscono dentro
 * i testi di aiuto, l'editor se li salva in configurazione.
 */

const FILTRO = [{ domain: 'person' }, { domain: 'device_tracker' }, { domain: 'zone' }];

/** le cose di una persona: chi e', quanto grande, quanto si vede */
const SCHEMA_RIGA = [
  { name: 'entity', selector: { entity: { filter: FILTRO } } },
  { name: 'colore', selector: { ui_color: {} } },
  { name: 'dim', selector: { number: { min: 16, max: 96, step: 2, mode: 'slider' } } },
  { name: 'opacita', selector: { number: { min: 10, max: 100, step: 5, mode: 'slider' } } },
];

/* Una zona: una foto caricata a mano, che riempie tutto il cerchio del raggio
   vero, oppure la sua icona, che invece resta piccola in mezzo. `Grandezza` vale
   solo per l'icona. */
const SCHEMA_ZONA = [
  { name: 'entity', selector: { entity: { domain: ['zone'] } } },
  { name: 'mostra', selector: { boolean: {} } },
  { name: 'nome', selector: { text: {} } },
  { name: 'icona', selector: { icon: {} } },
  { name: 'colore', selector: { ui_color: {} } },
  { name: 'dim', selector: { number: { min: 16, max: 96, step: 2, mode: 'slider' } } },
  { name: 'opacita', selector: { number: { min: 10, max: 100, step: 5, mode: 'slider' } } },
];

/**
 * LA VIA E I VIAGGI: le quattordici voci che stanno DENTRO ogni persona. Ognuno
 * ha il suo telefono e il suo modo di mandare le posizioni, quindi ognuno le
 * sue. Si salva solo quello che si cambia davvero: chi non tocca niente non si
 * porta dietro quattordici numeri copiati.
 */
const schemaSue = (D) => [
  { name: 'via', selector: { boolean: {} } },
  { name: 'profilo', selector: { select: { mode: 'dropdown', options: [
    { value: 'automatico', label: D.profilo.automatico },
    { value: 'piedi', label: D.profilo.piedi },
    { value: 'bici', label: D.profilo.bici },
    { value: 'auto', label: D.profilo.auto },
    { value: 'bus', label: D.profilo.bus },
  ] } } },
  { name: 'via_salto', selector: { number: { min: 50, max: 1000, step: 10, mode: 'slider' } } },
  { name: 'via_giro', selector: { number: { min: 110, max: 500, step: 10, mode: 'slider' } } },
  { name: 'usa_indirizzo', selector: { boolean: {} } },
  { name: 'fermo_m', selector: { number: { min: 0, max: 500, step: 10, mode: 'slider' } } },
  { name: 'pausa_min', selector: { number: { min: 2, max: 120, step: 1, mode: 'slider' } } },
  { name: 'andata_ritorno', selector: { boolean: {} } },
  { name: 'scosto', selector: { number: { min: 0, max: 50, step: 1, mode: 'slider' } } },
  { name: 'spessore', selector: { number: { min: 1, max: 12, step: 1, mode: 'slider' } } },
  { name: 'alone', selector: { boolean: {} } },
  { name: 'frecce', selector: { boolean: {} } },
  { name: 'frecce_colore', selector: { ui_color: {} } },
  { name: 'pallini', selector: { boolean: {} } },
  { name: 'pallini_dim', selector: { number: { min: 2, max: 14, step: 1, mode: 'slider' } } },
  { name: 'passo_pallini', selector: { number: { min: 0, max: 200, step: 5, mode: 'slider' } } },
  { name: 'sosta_linea', selector: { number: { min: 0, max: 300, step: 5, mode: 'slider' } } },
  { name: 'sfuma', selector: { boolean: {} } },
];

const SCHEMA_AGGIUNGI = [{ name: 'nuova', selector: { entity: { filter: FILTRO } } }];

const scelteSfondo = (D) => MAPPA_SFONDI.map(
  (x) => ({ value: x.chiave, label: (D.sfondi && D.sfondi[x.chiave]) || x.nome })
);

/* la mappina del cartellino e' quella di Google: ha solo queste due */
const scelteCartellino = (D) => scelteSfondo(D)
  .filter((x) => x.value === 'stradale' || x.value === 'satellite');

const schemaGenerale = (D) => [
  { name: 'sfondo', selector: { select: { mode: 'dropdown', options: scelteSfondo(D) } } },
  { name: 'sfondo_cartellino', selector: { select: { mode: 'dropdown', options: scelteCartellino(D) } } },
  { name: 'ingrandimento', selector: { number: { min: 3, max: 19, step: 1, mode: 'slider' } } },
  { name: 'ore', selector: { number: { min: 0, max: 72, step: 1, mode: 'slider' } } },
  { name: 'gruppo_opacita', selector: { number: { min: 10, max: 100, step: 5, mode: 'slider' } } },
  { name: 'aggancio', selector: { select: { mode: 'dropdown', options: [
    { value: 'no', label: D.aggancio.no },
    { value: 'valhalla', label: D.aggancio.valhalla },
    { value: 'osrm', label: D.aggancio.osrm },
  ] } } },
];





const STILE = `
  .mappa-editor { display: flex; flex-direction: column; gap: 10px; }
  .mappa-editor .versione {
    text-align: right;
    font-size: 11px;
    opacity: .55;
    padding: 2px 2px 0;
    user-select: text;
  }
  .mappa-editor .dentro { padding: 4px 12px 12px; display: flex; flex-direction: column; gap: 8px; }
  .mappa-editor .foto { display: flex; align-items: center; gap: 12px; }
  .mappa-editor .anteprima {
    width: 56px;
    height: 56px;
    border-radius: 50%;
    background: var(--secondary-background-color);
    background-size: cover;
    background-position: center;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--secondary-text-color);
    flex: 0 0 auto;
  }
  .mappa-editor .foto button {
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    color: var(--primary-color);
    font: inherit;
  }
  .mappa-editor .foto .togli { color: var(--error-color, #db4437); }
  .mappa-editor .riga.preso { opacity: .6; }
  .mappa-editor .maniglia {
    display: flex;
    align-items: center;
    cursor: grab;
    touch-action: none;
    color: var(--secondary-text-color);
    padding: 0 2px 0 4px;
  }
  .mappa-editor .maniglia:active { cursor: grabbing; }
  .mappa-editor .maniglia svg { width: 20px; height: 20px; fill: currentColor; }
  .mappa-editor .via {
    background: none;
    border: none;
    cursor: pointer;
    font-size: 20px;
    line-height: 1;
    padding: 0 4px;
    color: var(--secondary-text-color);
  }
  .mappa-editor .via:hover { color: var(--error-color, #db4437); }
.mappa-editor .titolo {
  margin: 14px 0 2px;
  font-weight: 600;
  font-size: 15px;
  color: var(--primary-text-color);
}
.mappa-editor .titolo:first-child { margin-top: 0; }
`;

export class MappaPersoneEditor extends HTMLElement {
  setConfig(config) {
    this._config = Object.assign(
      {
        entities: [], ore: MAPPA_ORE, sfondo: MAPPA_SFONDO,
        sfondo_cartellino: MAPPA_SFONDO_CART, ingrandimento: MAPPA_ZOOM,
        aggancio: MAPPA_AGGANCIO,
      },
      config || {}
    );
    this._disegna();
  }

  set hass(hass) {
    // la prima volta si rifa' la struttura: senza `hass` le caselle non sanno
    // nemmeno come si chiama la persona. Una volta sola, non a ogni stato.
    const primo = !this._hass;
    this._hass = hass;
    if (primo && this._config) {
      this._chiave = null;
      this._disegna();
    } else {
      this._valori();
    }
  }

  /** la struttura si rifa' solo se cambia l'elenco: vedi il commento in cima */
  _disegna() {
    const D = parla(this._hass);
    const chiave = mappaRighe(this._config).map((r) => r.entity).join(',');
    if (this._chiave === chiave && this._corpo) {
      this._valori();
      return;
    }
    this._chiave = chiave;
    this.innerHTML = '';

    const stile = document.createElement('style');
    stile.textContent = STILE;
    this.appendChild(stile);

    const corpo = document.createElement('div');
    corpo.className = 'mappa-editor';
    this.appendChild(corpo);
    this._corpo = corpo;
    this._forme = [];
    this._sue = [];
    this._foto = [];

    /* Due gruppi separati: prima chi si muove, poi i posti fermi. Sono due
       cose diverse e hanno voci diverse, mescolate non si capiva niente. */
    const righe = mappaRighe(this._config);
    const gruppi = [
      { titolo: D.gruppoPersone, quali: righe
        .map((r, i) => ({ r: r, i: i }))
        .filter((x) => x.r.entity.indexOf('zone.') !== 0) },
      { titolo: D.gruppoZone, quali: righe
        .map((r, i) => ({ r: r, i: i }))
        .filter((x) => x.r.entity.indexOf('zone.') === 0) },
    ];
    gruppi.forEach((g) => {
      if (!g.quali.length) return;
      const titolo = document.createElement('div');
      titolo.className = 'titolo';
      titolo.textContent = g.titolo;
      corpo.appendChild(titolo);
      g.quali.forEach((x) => this._riga(corpo, x.r, x.i));
    });

    // aggiungi
    const piu = document.createElement('ha-form');
    piu.schema = SCHEMA_AGGIUNGI;
    piu.hass = this._hass;
    piu.computeLabel = (v) => D.etichette[v.name] || v.name;
    piu.data = {};
    piu.addEventListener('value-changed', (ev) => {
      ev.stopPropagation();
      const chi = (ev.detail.value || {}).nuova;
      if (!chi) return;
      const ent = mappaRighe(this._config);
      if (ent.some((r) => r.entity === chi)) return;
      ent.push({ entity: chi });
      this._manda(Object.assign({}, this._config, { entities: ent }));
    });
    corpo.appendChild(piu);

    // le impostazioni di tutta la mappa
    const gen = document.createElement('ha-form');
    gen.schema = schemaGenerale(D);
    gen.hass = this._hass;
    gen.computeLabel = (v) => D.etichette[v.name] || v.name;
    gen.computeHelper = (v) => D.aiuti[v.name] || '';
    gen.addEventListener('value-changed', (ev) => {
      ev.stopPropagation();
      const v = ev.detail.value || {};
      this._manda(Object.assign({}, this._config, {
        sfondo: v.sfondo || MAPPA_SFONDO,
        sfondo_cartellino: v.sfondo_cartellino || MAPPA_SFONDO_CART,
        ingrandimento: Number(v.ingrandimento) || MAPPA_ZOOM,
        gruppo_opacita: v.gruppo_opacita === undefined || v.gruppo_opacita === null
          || v.gruppo_opacita === '' ? MAPPA_MUCCHIO_OPACITA : Number(v.gruppo_opacita),
        aggancio: v.aggancio || MAPPA_AGGANCIO,
        ore: v.ore === undefined || v.ore === null || v.ore === '' ? MAPPA_ORE : v.ore,
      }));
    });
    this._generale = gen;
    // tutte insieme in una casella che si apre, come le persone: cosi' la
    // finestra resta corta e si vede subito chi c'e' sulla mappa
    const casella = document.createElement('ha-expansion-panel');
    casella.outlined = true;
    casella.header = D.boxMappa;
    casella.secondary = D.boxMappaSotto;
    const dentro = document.createElement('div');
    dentro.className = 'dentro';
    dentro.appendChild(gen);
    casella.appendChild(dentro);
    corpo.appendChild(casella);

    /* La versione, in fondo e in piccolo. Serve a una cosa sola ma importante:
       capire in un colpo d'occhio se il browser sta usando l'ultima scheda
       portata sul box o una vecchia rimasta in cache. */
    const firma = document.createElement('div');
    firma.className = 'versione';
    firma.textContent = 'mappa-persone ' + MAPPA_VERSIONE;
    corpo.appendChild(firma);

    this._valori();
  }

  /** una riga: la casella che si apre, con foto, grandezza e trasparenza */
  _riga(corpo, riga, i) {
    const D = parla(this._hass);
    const zona = riga.entity.indexOf('zone.') === 0;
    const st = this._hass && this._hass.states[riga.entity];
    const casella = document.createElement('ha-expansion-panel');
    casella.outlined = true;
    casella.header = (riga.nome || '').trim()
      || (st && st.attributes.friendly_name) || riga.entity;
    casella.secondary = zona ? D.boxZona : D.boxPersona;

    this._maniglia(casella);

    const via = document.createElement('button');
    via.className = 'via';
    via.setAttribute('slot', 'icons');
    via.title = D.togliDallaMappa;
    via.textContent = '×';
    via.addEventListener('click', (ev) => {
      ev.stopPropagation();   // se no apre e chiude la casella
      const ent = mappaRighe(this._config);
      ent.splice(i, 1);
      this._manda(Object.assign({}, this._config, { entities: ent }));
    });
    casella.appendChild(via);

    const dentro = document.createElement('div');
    dentro.className = 'dentro';

    dentro.appendChild(this._foto1(riga, i));

    const f = document.createElement('ha-form');
    f.schema = zona ? SCHEMA_ZONA : SCHEMA_RIGA;
    f.hass = this._hass;
    f.computeLabel = (v) => D.etichette[v.name] || v.name;
    f.computeHelper = (v) => D.aiuti[v.name] || '';
    f.addEventListener('value-changed', (ev) => {
      ev.stopPropagation();
      const v = ev.detail.value || {};
      const ent = mappaRighe(this._config);
      const nuova = Object.assign({}, ent[i]);
      Object.keys(v).forEach((k) => {
        if (v[k] === undefined || v[k] === null || v[k] === '') delete nuova[k];
        else nuova[k] = v[k];
      });
      if (!nuova.entity) return;
      if (JSON.stringify(nuova) === JSON.stringify(ent[i])) return;

      /* IL NOME SI ASPETTA. Salvando a ogni lettera, Home Assistant ridisegna
         tutta la finestra delle impostazioni a ogni tasto: si torna in cima, si
         perde di vista la zona che si sta modificando e non si capisce piu'
         niente. Si aspetta mezzo secondo dopo l'ultima lettera. Intanto il nome
         scritto resta quello TUO, se no `_valori` lo riscriverebbe. */
      const soloNome = Object.keys(Object.assign({}, nuova, ent[i]))
        .every((k) => k === 'nome' || nuova[k] === ent[i][k]);
      if (soloNome) {
        /* MENTRE SCRIVI NON SI SALVA NIENTE. A ogni salvataggio Home Assistant
           ricostruisce tutta la finestra delle impostazioni: si torna in cima e
           si perde di vista la riga. Prima aspettavo mezzo secondo, ma chi
           scrive piano fa pause piu' lunghe e il salvataggio partiva lo stesso.
           Adesso si salva quando esci dalla casella (vedi `focusout` piu' sotto)
           o dopo tre secondi buoni di fermo. */
        this._nomi = this._nomi || {};
        this._nomi[i] = nuova.nome || '';
        this._sospeso = { i: i, riga: nuova };
        clearTimeout(this._scrivendo);
        this._scrivendo = setTimeout(() => this._scriviNome(), 3000);
        return;
      }

      ent[i] = nuova;
      this._manda(Object.assign({}, this._config, { entities: ent }));
    });
    // uscendo da una casella di questa riga, il nome in sospeso si salva
    f.addEventListener('focusout', () => setTimeout(() => this._scriviNome(), 60));
    this._forme[i] = f;
    dentro.appendChild(f);

    if (!zona) {
      // le sue quattordici voci: chiuse, di solito non si aprono
      const sue = document.createElement('ha-expansion-panel');
      sue.outlined = true;
      sue.header = D.boxVia;
      sue.secondary = D.boxViaSotto;
      const dentroSue = document.createElement('div');
      dentroSue.className = 'dentro';
      const fs = document.createElement('ha-form');
      fs.schema = schemaSue(D);
      fs.hass = this._hass;
      fs.computeLabel = (v) => D.etichette[v.name] || v.name;
      fs.computeHelper = (v) => D.aiuti[v.name] || '';
      fs.addEventListener('value-changed', (ev) => {
        ev.stopPropagation();
        this._cambiaSue(i, ev.detail.value || {});
      });
      this._sue[i] = fs;
      dentroSue.appendChild(fs);
      sue.appendChild(dentroSue);
      dentro.appendChild(sue);
    }

    casella.appendChild(dentro);

    // ogni riga dentro un involucro suo: e' quello che si sposta trascinando
    const invol = document.createElement('div');
    invol.className = 'riga';
    invol.dataset.posto = i;
    invol.appendChild(casella);
    corpo.appendChild(invol);
  }

  /**
   * La maniglia per cambiare l'ordine. Si prende la riga e la si porta su o giu':
   * l'ordine conta, perche' il colore di serie e la corsia dipendono da quello.
   *
   * TRAPPOLA GIA' PAGATA: il `pointerup` non arriva alla maniglia, perche' a dito
   * fermo il puntatore sta sopra un altro elemento. Va ascoltato su `window` e
   * in fase di CATTURA, se no il trascinamento non finisce mai.
   */
  _maniglia(casella) {
    const m = document.createElement('div');
    m.className = 'maniglia';
    m.setAttribute('slot', 'leading-icon');
    m.title = 'Trascina per cambiare posizione';
    m.innerHTML =
      '<svg viewBox="0 0 24 24"><path d="M7 19V17H9V19H7M11 19V17H13V19H11M15 19V17H17V19H15'
      + 'M7 15V13H9V15H7M11 15V13H13V15H11M15 15V13H17V15H15M7 11V9H9V11H7M11 11V9H13V11H11'
      + 'M15 11V9H17V11H15M7 7V5H9V7H7M11 7V5H13V7H11M15 7V5H17V7H15Z"/></svg>';

    m.addEventListener('pointerdown', (giu) => {
      giu.preventDefault();
      giu.stopPropagation();   // se no la casella si apre mentre trascini
      const preso = m.closest('.riga');
      if (!preso) return;
      preso.classList.add('preso');

      const muovi = (ev) => {
        const righe = Array.from(this._corpo.querySelectorAll('.riga'));
        for (const altra of righe) {
          if (altra === preso) continue;
          const r = altra.getBoundingClientRect();
          const meta = r.top + r.height / 2;
          if (ev.clientY < meta && altra.compareDocumentPosition(preso) & Node.DOCUMENT_POSITION_FOLLOWING) {
            this._corpo.insertBefore(preso, altra);
            return;
          }
          if (ev.clientY > meta && altra.compareDocumentPosition(preso) & Node.DOCUMENT_POSITION_PRECEDING) {
            this._corpo.insertBefore(preso, altra.nextSibling);
            return;
          }
        }
      };

      const molla = () => {
        window.removeEventListener('pointermove', muovi, true);
        window.removeEventListener('pointerup', molla, true);
        window.removeEventListener('pointercancel', molla, true);
        preso.classList.remove('preso');
        const ordine = Array.from(this._corpo.querySelectorAll('.riga')).map((x) => Number(x.dataset.posto));
        const vecchie = mappaRighe(this._config);
        const nuove = ordine.map((k) => vecchie[k]).filter(Boolean);
        if (JSON.stringify(nuove) === JSON.stringify(vecchie)) return;
        this._manda(Object.assign({}, this._config, { entities: nuove }));
      };

      window.addEventListener('pointermove', muovi, true);
      window.addEventListener('pointerup', molla, true);
      window.addEventListener('pointercancel', molla, true);
    });

    casella.appendChild(m);
  }

  /** il riquadro della foto: anteprima, carica, togli */
  _foto1(riga, i) {
    const box = document.createElement('div');
    box.className = 'foto';

    const anteprima = document.createElement('div');
    anteprima.className = 'anteprima';
    box.appendChild(anteprima);

    const prendi = document.createElement('button');
    prendi.className = 'prendi';
    box.appendChild(prendi);

    const togli = document.createElement('button');
    togli.className = 'togli';
    togli.textContent = parla(this._hass).togli;
    box.appendChild(togli);

    const scelta = document.createElement('input');
    scelta.type = 'file';
    scelta.accept = 'image/*';
    scelta.hidden = true;
    box.appendChild(scelta);

    prendi.addEventListener('click', () => scelta.click());
    scelta.addEventListener('change', async () => {
      const file = scelta.files && scelta.files[0];
      scelta.value = '';
      if (!file || !this._hass) return;
      prendi.textContent = 'Sto caricando...';
      try {
        const indirizzo = await caricaFoto(this._hass, file);
        const ent = mappaRighe(this._config);
        ent[i] = Object.assign({}, ent[i], { foto: indirizzo });
        this._manda(Object.assign({}, this._config, { entities: ent }));
      } catch (e) {
        console.warn('[mappa-persone] foto non caricata:', e);
        prendi.textContent = 'Non ci sono riuscito';
      }
    });

    togli.addEventListener('click', async () => {
      const ent = mappaRighe(this._config);
      const vecchia = ent[i] && ent[i].foto;
      delete ent[i].foto;
      this._manda(Object.assign({}, this._config, { entities: ent }));
      if (vecchia && this._hass) await togliFoto(this._hass, vecchia);
    });

    this._foto[i] = { anteprima: anteprima, prendi: prendi, togli: togli };
    return box;
  }

  /**
   * Scrive nella persona SOLO le voci diverse da quelle di partenza: chi non
   * tocca niente non si porta dietro quattordici numeri copiati.
   */
  _cambiaSue(i, valori) {
    const ent = mappaRighe(this._config);
    const nuova = Object.assign({}, ent[i]);
    schemaSue(parla(this._hass)).forEach((v) => {
      const suo = valori[v.name];
      if (suo === undefined || suo === null || suo === '' || suo === MAPPA_SUE[v.name]) delete nuova[v.name];
      else nuova[v.name] = suo;
    });
    if (JSON.stringify(nuova) === JSON.stringify(ent[i])) return;
    ent[i] = nuova;
    this._manda(Object.assign({}, this._config, { entities: ent }));
  }

  /** manda il nome tenuto da parte: si chiama uscendo dalla casella */
  _scriviNome() {
    clearTimeout(this._scrivendo);
    const q = this._sospeso;
    this._sospeso = null;
    if (!q) return;
    const tutte = mappaRighe(this._config);
    if (!tutte[q.i]) return;
    if (JSON.stringify(tutte[q.i]) === JSON.stringify(q.riga)) return;
    tutte[q.i] = q.riga;
    this._manda(Object.assign({}, this._config, { entities: tutte }));
  }

  _manda(nuovo) {
    this._nomi = {};
    this._config = nuovo;
    this.dispatchEvent(new CustomEvent('config-changed', {
      detail: { config: nuovo },
      bubbles: true,
      composed: true,
    }));
    this._disegna();
  }

  /** i valori: si aggiornano sugli elementi che ci sono gia' */
  _valori() {
    if (!this._corpo || !this._hass) return;
    const D = parla(this._hass);
    mappaRighe(this._config).forEach((riga, i) => {
      const st = this._hass.states[riga.entity];
      const ui = this._foto && this._foto[i];
      if (ui) {
        const quale = riga.foto || (st && st.attributes.entity_picture);
        ui.anteprima.style.backgroundImage = quale ? 'url(' + quale + ')' : '';
        ui.anteprima.textContent = quale ? '' : '?';
        ui.prendi.textContent = riga.foto ? D.cambiaFoto : D.caricaFoto;
        ui.togli.hidden = !riga.foto;
      }
      const f = this._forme && this._forme[i];
      if (!f) return;
      const dati = {
        entity: riga.entity,
        nome: (this._nomi && this._nomi[i] !== undefined)
          ? this._nomi[i] : (riga.nome || ''),
        icona: riga.icona || '',
        colore: riga.colore || '',
        dim: riga.dim === undefined ? MAPPA_DIM : riga.dim,
        opacita: riga.opacita === undefined ? MAPPA_OPACITA : riga.opacita,
      };
      if (JSON.stringify(dati) !== JSON.stringify(f.data)) f.data = dati;
      f.hass = this._hass;

      // nelle sue voci si mostra quello che vale ADESSO per questa persona: il
      // suo se ce l'ha, se no quello di partenza
      const fs = this._sue && this._sue[i];
      if (fs) {
        const suoi = {};
        schemaSue(parla(this._hass)).forEach((v) => { suoi[v.name] = mappaSua(riga, v.name, MAPPA_SUE); });
        if (JSON.stringify(suoi) !== JSON.stringify(fs.data)) fs.data = suoi;
        fs.hass = this._hass;
      }
    });

    if (this._generale) {
      const ore = this._config.ore;
      const dati = {
        sfondo: this._config.sfondo || MAPPA_SFONDO,
        sfondo_cartellino: this._config.sfondo_cartellino || MAPPA_SFONDO_CART,
        ingrandimento: Number(this._config.ingrandimento) || MAPPA_ZOOM,
        gruppo_opacita: this._config.gruppo_opacita === undefined
          || this._config.gruppo_opacita === null || this._config.gruppo_opacita === ''
          ? MAPPA_MUCCHIO_OPACITA : Number(this._config.gruppo_opacita),
        aggancio: this._config.aggancio || MAPPA_AGGANCIO,
        ore: ore === undefined || ore === null || ore === '' ? MAPPA_ORE : ore,
      };
      if (JSON.stringify(dati) !== JSON.stringify(this._generale.data)) this._generale.data = dati;
      this._generale.hass = this._hass;
    }
  }
}
