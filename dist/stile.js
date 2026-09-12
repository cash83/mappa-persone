import { MAPPA_ICONA_CENTRA, MAPPA_ICONA_STRATI } from './costanti.js?v=3.1.3';

/**
 * Il vestito della scheda. Va messo NELLO shadow DOM insieme a quello di
 * Leaflet: il CSS di document.head non attraversa lo shadow, e senza il suo
 * foglio i tasselli restano in position:static, cioe' mappa vuota.
 */
export const MAPPA_STILE = `
  :host { display: block; height: 100%; min-height: 400px; }
  ha-card {
    height: 100%;
    min-height: 400px;
    overflow: hidden;
    padding: 0;
  }
  .carta { width: 100%; height: 100%; min-height: 400px; }

  /* la punta del senso di marcia: un triangolino fatto coi bordi, cosi' non
     serve nessuna immagine e prende il colore della persona */
  .freccia { width: 20px; height: 20px; }
  .freccia svg { width: 20px; height: 20px; display: block; }
  .freccia path {
    fill: #fff;
    stroke: rgba(0, 0, 0, .75);
    stroke-width: 1.4;
    stroke-linejoin: round;
    filter: drop-shadow(0 1px 1.5px rgba(0, 0, 0, .45));
  }

  /* il pallino di chi sta nello stesso posto, col numero di quanti sono */
  .gruppo {
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    background: var(--primary-color, #03a9f4);
    color: var(--text-primary-color, #fff);
    border: 2px solid var(--card-background-color, #fff);
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.4);
    font-weight: 600;
    font-size: 15px;
    cursor: pointer;
  }

  /* il nome della zona: scritto DENTRO il suo cerchio, senza riquadro */
  .leaflet-tooltip.nome-zona {
    /* Il riquadro di Leaflet sparisce: la pillola scura e' la SCRITTA STESSA
       (vedi .pillola), cosi' si stringe e si allarga insieme al testo. Tenendo
       il fondo qui, con la misura fissa, sulle zone piccole la pillola restava
       larga uguale e usciva dal cerchio. */
    background: none;
    border: none;
    box-shadow: none;
    text-shadow: none;
    padding: 0;
    white-space: nowrap;
  }

  .leaflet-tooltip.nome-zona .pillola {
    display: inline-block;
    background: rgba(0, 0, 0, .72);
    border-radius: 999px;
    /* misurati in em: crescono e calano insieme al corpo della scritta */
    padding: .24em .85em;
    color: #fff;
    font-family: var(--paper-font-body1_-_font-family, sans-serif);
    font-weight: 700;
    line-height: 1.25;
  }
  .leaflet-tooltip.nome-zona::before { display: none; }

  /* la foto di una zona: filo bianco sottile, non l'anello grosso e colorato
     delle persone - li' il colore serve a dire di chi e' la scia, qui no */
  .segno.segno-foto {
    /* il colore lo mette chi disegna: bianco se non se n'e' scelto uno */
    border: 2px solid rgba(255, 255, 255, .95);
    box-shadow: 0 1px 6px rgba(0, 0, 0, .45);
  }

  /* la zona senza foto: solo la sua icona, nel colore della zona */
  .segno-zona {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    font: 700 18px/1 var(--paper-font-body1_-_font-family, sans-serif);
    filter: drop-shadow(0 1px 2px rgba(255, 255, 255, .9));
  }
  /* toccando una scia il browser le disegna intorno il suo riquadro di
     selezione, che sulla mappa sembra un rettangolo comparso dal nulla */
  .leaflet-interactive:focus,
  .leaflet-container svg path:focus { outline: none; }

  /* il tasto degli sfondi, in alto a destra */
  .leaflet-control-layers {
    background: var(--card-background-color, #fff);
    color: var(--primary-text-color, #212121);
    border: none;
    border-radius: 8px;
    box-shadow: 0 2px 6px rgba(0, 0, 0, .35);
  }
  /* Il tasto va centrato con flex, non con un margine: Leaflet, quando il
     browser dice di avere il tocco, aggiunge la classe leaflet-touch e porta
     il tasto da 36 a 44 pixel. Con un margine fisso l'icona restava schiacciata
     in alto a sinistra. Le due regole insieme perche' quella col tocco vince. */
  .leaflet-control-layers-toggle,
  .leaflet-touch .leaflet-control-layers-toggle {
    width: 40px;
    height: 40px;
    background-image: none !important;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .leaflet-control-layers-toggle::after {
    content: '';
    display: block;
    width: 22px;
    height: 22px;
    margin: 0;
    background-color: var(--primary-text-color, #212121);
    -webkit-mask-image: ${MAPPA_ICONA_STRATI};
    mask-image: ${MAPPA_ICONA_STRATI};
    -webkit-mask-size: contain;
    mask-size: contain;
    -webkit-mask-repeat: no-repeat;
    mask-repeat: no-repeat;
  }
  .leaflet-control-layers-expanded {
    padding: 8px 12px 8px 8px;
    font: 400 14px/1.6 var(--paper-font-body1_-_font-family, sans-serif);
  }
  .leaflet-control-layers-expanded .leaflet-control-layers-toggle { display: none; }
  .leaflet-control-layers-selector { margin-right: 6px; accent-color: var(--primary-color, #2196f3); }

  /* il mirino sotto i tasti dell'ingrandimento: torna sulle entita' */
  .mappa-mirino { margin-top: 8px !important; }
  .mappa-mirino a {
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .mappa-mirino a::after {
    content: '';
    display: block;
    width: 18px;
    height: 18px;
    background-color: currentColor;
    -webkit-mask-image: ${MAPPA_ICONA_CENTRA};
    mask-image: ${MAPPA_ICONA_CENTRA};
    -webkit-mask-size: contain;
    mask-size: contain;
    -webkit-mask-repeat: no-repeat;
    mask-repeat: no-repeat;
  }

  /* il cartellino che si apre toccando una persona */
  .mappa-cart .leaflet-popup-content-wrapper {
    background: var(--card-background-color, #fff);
    color: var(--primary-text-color, #212121);
    border-radius: 12px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, .4);
  }
  .mappa-cart .leaflet-popup-tip { background: var(--card-background-color, #fff); }
  .mappa-cart .leaflet-popup-content { margin: 10px 12px; font: 400 13px/1.35 var(--paper-font-body1_-_font-family, sans-serif); }
  .mappa-cart a.leaflet-popup-close-button { color: var(--secondary-text-color, #727272); }
  .cartellino .capo { display: flex; align-items: center; gap: 10px; }
  .cartellino .ritratto {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    background-size: cover;
    background-position: center;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #fff;
    font-weight: 600;
    flex: 0 0 auto;
  }
  .cartellino .nome { font-weight: 600; font-size: 14px; }
  .cartellino .sotto { color: var(--secondary-text-color, #727272); font-size: 12px; }
  .cartellino .tasti { display: flex; gap: 6px; margin: 8px 0 0; }
  .cartellino .tasti button {
    flex: 1;
    padding: 5px 6px;
    white-space: nowrap;
    border: 1px solid var(--divider-color, #e0e0e0);
    border-radius: 8px;
    background: none;
    color: var(--primary-color, #2196f3);
    font: inherit;
    cursor: pointer;
  }
  .cartellino .dettagli { margin-top: 8px; }
  .cartellino .rg {
    display: flex;
    justify-content: space-between;
    gap: 10px;
    padding: 2px 0;
    border-top: 1px solid var(--divider-color, #e0e0e0);
  }
  .cartellino .rg span { color: var(--secondary-text-color, #727272); }
  .cartellino .rg b { text-align: right; max-width: 62%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .cartellino .mappina { margin-top: 8px; }
  .cartellino .telaio { border-radius: 8px; overflow: hidden; }
  .cartellino .telaio { height: 120px; }
  .cartellino .telaio iframe { width: 100%; height: 100%; border: 0; display: block; }
  /* quando il cartellino e' piu' alto della scheda, Leaflet lo fa scorrere:
     via il bordo che ci mette di suo, che sembra un errore */
  .mappa-cart .leaflet-popup-scrolled { border-bottom: none; border-top: none; }
  .cartellino .fuori { display: block; margin-top: 8px; color: var(--primary-color, #2196f3); text-decoration: none; }

  /* l'icona con la foto della persona */
  .segno {
    width: 100%;
    height: 100%;
    border-radius: 50%;
    /* il colore lo mette chi disegna: e' quello della persona o della zona */
    border: 3px solid #fff;
    /* niente filo bianco intorno: il colore scelto deve essere il cerchio piu'
       esterno, se no sopra il colore restava sempre un anello bianco */
    box-shadow: 0 1px 4px rgba(0, 0, 0, .5);
    background-size: cover;
    background-position: center;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #fff;
    font: 600 14px/1 var(--paper-font-body1_-_font-family, sans-serif);
    box-sizing: border-box;
  }
`;
