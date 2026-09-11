/**
 * I numeri e i nomi fissi. Stanno tutti qui: se una cosa si cambia una volta
 * ogni tanto, si cambia in questo file e basta.
 */

export const MAPPA_VERSIONE = '3.1.1';

/** dove sono i file sul box: serve per caricare Leaflet da noi, non da internet */
export const MAPPA_BASE = '/local/community/mappa-persone/';

/** un colore per ognuno, nell'ordine in cui sono stati messi nella scheda */

export const MAPPA_DIM = 40;        // quanto grande l'icona di una persona, in pixel
export const MAPPA_OPACITA = 100;   // quanto si vede: 100 pieno, 20 quasi trasparente
export const MAPPA_AGGANCIO = 'no';   // 'no', 'valhalla' o 'osrm'

/**
 * LA VIA E I VIAGGI: le quattordici voci che stanno dentro ogni persona, coi
 * valori messi a punto sul campo. Ognuno ha il suo telefono e il suo modo di
 * mandare le posizioni, quindi ognuno le sue.
 */
/* I VALORI DI PARTENZA, rifatti l'11/09/2026 su quello che abbiamo misurato:
    - fermo_m da 50 a 100. A cinquanta, un telefono fermo in casa produceva
      dieci "viaggi" al giorno che non portavano da nessuna parte, e per giunta
      il numero non era nemmeno vero: sotto i sessanta non scendeva mai.
    - via_giro da 130 a 200. E' il valore piu' BASSO che, sui viaggi veri di
      questi giorni, non lascia nemmeno una riga dritta: a centottanta il buco
      da 681 metri di Mattia veniva ancora scartato, e la sua strada vera ne
      misura 1455. Sotto non si guadagna niente e si perdono percorsi giusti.
    - usa_indirizzo da acceso a spento. Il sensore dell'indirizzo non dice dove
      sei, dice quale indirizzo ha trovato il geocodificatore, e qui rispondeva
      con due sole coordinate fisse a sessantaquattro metri l'una dall'altra.
      Chi lo vuole lo accende: e' una fonte in piu', non una posizione in piu'.
    - sosta_linea da 25 a 0. Dentro una sosta le posizioni ballano, e unirle
      con una linea fa una ragnatela. I pallini ci sono lo stesso. */
export const MAPPA_SUE = {
  via: true,                 // fai seguire la via alla scia
  profilo: 'automatico',     // automatico, piedi, bici, auto
  via_salto: 160,            // m: buco oltre il quale si calcola la via
  via_giro: 200,             // %: si scarta il percorso piu' lungo del vero di tanto
  usa_indirizzo: false,      // usa anche il sensore dell'indirizzo
  fermo_m: 100,              // m: sotto questo spostamento non e' un viaggio
  pausa_min: 5,              // min: sosta che chiude un viaggio
  andata_ritorno: true,      // distingui andata e ritorno
  scosto: 8,                 // px: distanza fra le due
  spessore: 4,               // px: la linea
  alone: true,               // l'alone della precisione dichiarata dal telefono
  frecce: true,              // le punte del senso di marcia sulla scia
  frecce_colore: '',         // vuoto = bianche, se no il colore scelto
  pallini: true,             // segna le posizioni registrate
  pallini_dim: 9,            // px
  passo_pallini: 0,          // m: 0 = tutti
  sosta_linea: 0,            // m: la linea dentro le soste. 0 = niente linea
  sfuma: true,               // sbiadisci il piu' vecchio
};
export const MAPPA_ZOOM = 16;
/* Il colore di chi non ne ha scelto uno: quello principale del tema, uguale per
   tutti. La tavolozza a rotazione dava colori a caso in base alla posizione in
   elenco, e riordinando le righe cambiavano da soli. */
export const MAPPA_PRINCIPALE = 'primary';
/* Il colore di una zona a cui non ne hai dato uno: il grigio delle scritte
   secondarie, cioe' "nessun colore". Col colore principale sembrava che una
   scelta fosse stata fatta, e non era vero. */
export const MAPPA_ZONA_SPENTA = 'secondary-text';
/* Quanto devono essere vicine due icone sullo schermo per diventare un pallino
   solo. Quaranta pixel, la stessa misura della mappa di Home Assistant. */
export const MAPPA_MUCCHIO = 40;
// quanto si vede il pallino del gruppo: 100 = pieno, 10 = quasi trasparente
export const MAPPA_MUCCHIO_OPACITA = 100;       // quanto si sta stretti sulle persone
export const MAPPA_ORE = 12;        // quante ore indietro, se non si dice altro
export const MAPPA_RILEGGI = 5;     // ogni quanti minuti si rilegge lo storico
/* Letture piu' vicine di cosi' (m) non si tengono. A ZERO si tengono tutte, ed
   e' quello che fa la scheda mappa di serie: un pallino per ogni posizione
   registrata. A cinque ne sparivano quasi due su tre, e messa accanto a quella
   di serie la nostra sembrava avere dei buchi. Per diradare c'e' gia' il
   cursore "un pallino ogni tot metri", che e' di ognuno e si vede. */
export const MAPPA_VICINO = 0;

/**
 * Gli sfondi. `maxNativeZoom` e' fin dove esistono davvero i tasselli,
 * `maxZoom` fin dove si puo' ingrandire: mettendo solo il primo, oltre quel
 * punto la mappa diventa bianca.
 */
export const MAPPA_SFONDO = 'stradale';        // lo sfondo della mappa grande
export const MAPPA_SFONDO_CART = 'satellite';  // e quello della mappina nel cartellino

export const MAPPA_SFONDI = [
  {
    /*
     * Stradale: i tasselli di Esri, gli stessi di cui usiamo gia' il satellite e
     * la mappa scura. NON quelli di tile.openstreetmap.org, e nemmeno CARTO.
     *
     * PERCHE'. I server di OpenStreetMap sono di volontari, e la loro regola
     * d'uso chiede che chi li interroga si faccia riconoscere. Home Assistant
     * pero' manda a ogni pagina `Referrer-Policy: no-referrer`, e dal browser
     * una scheda non puo' mettere ne' un Referer ne' uno User-Agent suo: sono
     * intestazioni che il browser non lascia toccare. Quindi le richieste
     * arrivano la' anonime, e prima o poi tornano indietro tutte con un 403 e
     * il cartello "App is not following the tile usage policy": la mappa si
     * riempie di quadrati gialli e neri. Non e' un guasto di passaggio ne' una
     * cosa che si aggiusta da qui: e' la regola, ed e' giusta.
     *
     * E CARTO? Provato, e bocciato in mezz'ora: i suoi tasselli liberi adesso
     * arrivano con la scritta API KEY REQUIRED stampata sopra, ripetuta su
     * tutta la mappa. Una chiave non la si puo' mettere in una scheda che
     * scarica chiunque, quindi Esri: nessuna chiave, nessuna intestazione, e
     * qui rispondono da mesi.
     */
    chiave: 'stradale',
    nome: 'Stradale',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
    opzioni: { maxNativeZoom: 19, maxZoom: 20, attribution: '&copy; Esri' },
  },
  {
    // Scuro: NON Carto. Quei tasselli adesso vogliono una chiave e sopra la
    // mappa compare la scritta API KEY REQUIRED. Questi sono di Esri, lo stesso
    // di cui usiamo il satellite, e non chiedono niente. Le scritte stanno in
    // un secondo strato (`sopra`) da mettere sopra il fondo.
    chiave: 'scuro',
    nome: 'Scuro',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
    sopra: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}',
    opzioni: { maxNativeZoom: 16, maxZoom: 20, attribution: '&copy; Esri' },
  },
  {
    chiave: 'satellite',
    nome: 'Satellite',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    opzioni: { maxNativeZoom: 19, maxZoom: 20, attribution: '&copy; Esri' },
  },
  {
    /*
     * La versione umanitaria della carta: piu' contrasto, nomi e sentieri piu'
     * marcati, verde piu' acceso. Sta pero' su server di volontari come quelli
     * di OpenStreetMap, con la stessa regola d'uso: se un giorno tornano dei
     * 403 al posto dei tasselli, la causa e' quella e non un guasto. Resta
     * perche' e' una scelta, non il fondo di serie.
     */
    chiave: 'vie',
    nome: 'Vie e nomi',
    url: 'https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png',
    opzioni: {
      subdomains: 'ab',
      maxNativeZoom: 19,
      maxZoom: 20,
      attribution: '&copy; OpenStreetMap, tasselli Humanitarian OSM Team',
    },
  },
  {
    // OpenTopoMap: quella con le curve di livello marroni, l'ombra dei rilievi e
    // i sentieri numerati. Niente chiave, ma arriva solo fino allo zoom 17.
    chiave: 'topografico',
    nome: 'Topografico',
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    opzioni: {
      subdomains: 'abc',
      maxNativeZoom: 17,
      maxZoom: 20,
      attribution: '&copy; OpenStreetMap, SRTM | &copy; OpenTopoMap (CC-BY-SA)',
    },
  },
];

/**
 * L'icona del tasto degli sfondi. Leaflet la sua se la prende da un'immagine
 * (layers.png) con un indirizzo relativo che dentro lo shadow DOM non si
 * risolve: viene fuori un tasto vuoto. Quindi si disegna con una maschera CSS.
 */
/** il mirino del tasto "torna sulle entita", lo stesso che usa Home Assistant */
export const MAPPA_ICONA_CENTRA =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E"
  + "%3Cpath d='M5 15H3v4c0 1.1.9 2 2 2h4v-2H5v-4M5 5h4V3H5c-1.1 0-2 .9-2 2v4h2V5m14-2h-4v2h4v4h2V5"
  + "c0-1.1-.9-2-2-2m0 16h-4v2h4c1.1 0 2-.9 2-2v-4h-2v4M12 9c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 "
  + "3-3-1.34-3-3-3Z'/%3E%3C/svg%3E\")";

export const MAPPA_ICONA_STRATI =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E"
  + "%3Cpath d='M12 16L19.36 10.27L21 9L12 2L3 9L4.63 10.27M12 18.54L4.62 12.81L3 14.07"
  + "L12 21.07L21 14.07L19.37 12.8L12 18.54Z'/%3E%3C/svg%3E\")";
