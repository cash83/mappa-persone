/**
 * mappa-persone - una mappa, e le entita' che ci metti dentro.
 *
 * Questo file non fa niente: mette insieme i pezzi e li presenta a Home
 * Assistant. Il lavoro sta in `parti/`, un file per mestiere:
 *
 *   parti/costanti.js  i numeri e i nomi fissi (colori, ore, sfondi, icona)
 *   parti/utili.js     due conti che servono dappertutto
 *   parti/stile.js     il vestito della scheda
 *   parti/carta.js     LA MAPPA: Leaflet, sfondi, misura, inquadratura, livelli
 *   parti/entita.js    LE ENTITA': dove sono adesso, lo storico, il disegno
 *   parti/scheda.js    la scheda: tiene insieme i due e parla con Home Assistant
 *   parti/editor.js    la finestra delle impostazioni
 */

import { MAPPA_VERSIONE } from './costanti.js?v=3.1.3';
import { MappaPersone } from './scheda.js?v=3.1.3';
import { MappaPersoneEditor } from './editor.js?v=3.1.3';
import { parla } from './lingue.js?v=3.1.3';

customElements.define('mappa-persone', MappaPersone);
customElements.define('mappa-persone-editor', MappaPersoneEditor);

window.customCards = window.customCards || [];
/* Il nome nella scelta delle schede si decide QUI, prima che Home Assistant
   parli: non c'e' ancora nessun `hass` da cui sapere la lingua. Si guarda la
   lingua della pagina, che e' quella scelta dall'utente, e si ripiega sul
   browser. */
const LINGUA = parla({
  language: (typeof document !== 'undefined' && document.documentElement.lang)
    || (typeof navigator !== 'undefined' && navigator.language) || 'en',
});

window.customCards.push({
  type: 'mappa-persone',
  name: LINGUA.nomeCarta,
  description: LINGUA.descrizioneCarta,
  preview: true,
  documentationURL: 'https://github.com/cash83/mappa-persone',
});

console.info(
  '%c mappa-persone %c ' + MAPPA_VERSIONE + ' ',
  'background:#2196f3;color:#fff;border-radius:3px 0 0 3px',
  'background:#333;color:#fff;border-radius:0 3px 3px 0'
);
