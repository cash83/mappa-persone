import { mappaDistanza, mappaSalta } from './utili.js?v=3.3.55';
import { parla } from './lingue.js?v=3.3.55';
import { MAPPA_SFONDI, MAPPA_SFONDO } from './costanti.js?v=3.3.55';

/**
 * IL CARTELLINO che si apre toccando una persona: foto, nome, dove sta e da
 * quanto, e due tasti per aprire i dettagli e una mappina del posto.
 *
 * Il sensore dell'indirizzo si chiama come il TELEFONO, non come la persona:
 * `person.papa` e' seguito da `device_tracker.fold_8_papa`, e il sensore e'
 * `sensor.fold_8_papa_geocoded_location`. Cercarlo dal nome della persona
 * funziona solo per chi ha il telefono chiamato come se'.
 */

export function sensoreIndirizzo(hass, ent) {
  const st = hass.states[ent];
  const nomi = [];
  const fonte = st && st.attributes && st.attributes.source;
  if (fonte && fonte.indexOf('.') > 0) nomi.push(fonte.split('.')[1]);
  nomi.push(ent.split('.')[1]);
  for (const n of nomi) {
    const s = 'sensor.' + n + '_geocoded_location';
    if (hass.states[s]) return s;
  }
  return null;
}

/** cerca un attributo per pezzo di nome, che l'app companion cambia le maiuscole */
function attributo(attr, pezzo) {
  const k = Object.keys(attr || {}).find((x) => x.toLowerCase().replace(/[ _]/g, '').indexOf(pezzo) === 0);
  return k ? attr[k] : '';
}

/** la via dove si trova adesso, dal sensore dell'indirizzo */
function laVia(hass, ent) {
  const nome = sensoreIndirizzo(hass, ent);
  const s = nome && hass.states[nome];
  if (!s) return '';
  const a = s.attributes || {};
  const via = attributo(a, 'thoroughfare');
  const civico = attributo(a, 'subthoroughfare');
  if (via) return civico ? via + ' ' + civico : via;
  // niente attributi: si prende quello che c'e' scritto, tagliato al primo pezzo
  return (s.state || '').split(',')[0];
}

/** il paese o la citta', dallo stesso sensore dell'indirizzo */
function laCitta(hass, ent) {
  const nome = sensoreIndirizzo(hass, ent);
  const s = nome && hass.states[nome];
  if (!s) return '';
  const a = s.attributes || {};
  const citta = attributo(a, 'locality') || attributo(a, 'sublocality') || attributo(a, 'city');
  if (citta) return citta;
  const pezzi = (s.state || '').split(',');
  return pezzi.length > 1 ? pezzi[1].trim() : '';
}

function daQuanto(quando, D) {
  const sec = Math.max(0, (Date.now() - new Date(quando).getTime()) / 1000);
  if (sec < 90) return D.cart.adesso;
  const min = Math.round(sec / 60);
  if (min < 60) return D.cart.minuti(min);
  const ore = Math.round(min / 60);
  if (ore < 48) return D.cart.ore(ore);
  return D.cart.giorni(Math.round(ore / 24));
}

function daCasa(hass, st) {
  const casa = hass.states['zone.home'];
  if (!casa || isNaN(Number(casa.attributes.latitude))) return '';
  const m = mappaDistanza(
    [Number(st.attributes.latitude), Number(st.attributes.longitude)],
    [Number(casa.attributes.latitude), Number(casa.attributes.longitude)]
  );
  return m < 1000 ? Math.round(m) + ' m' : (m / 1000).toFixed(1) + ' km';
}

function rilevatoDa(hass, st) {
  const fonte = st.attributes.source;
  if (!fonte) return '';
  const s = hass.states[fonte];
  return (s && s.attributes.friendly_name) || fonte;
}

function riga(nome, valore) {
  if (!valore) return '';
  /* Il valore lungo (un comune di tre parole) si accorcia coi puntini invece di
     andare a capo: il cartellino deve restare basso.
     Il valore arriva da fuori - il nome che uno ha dato a una persona, la via
     che risponde il geocodificatore - e finisce dentro dell'HTML e dentro un
     attributo: va scappato tutte e due le volte, se no un apostrofo spacca il
     cartellino e una parentesi angolare ci infila dentro quello che vuole. */
  const v = mappaSalta(valore);
  return '<div class="rg"><span>' + mappaSalta(nome) + '</span><b title="' + v + '">' + v + '</b></div>';
}

/**
 * Costruisce il cartellino. Torna un elemento con dentro gia' i suoi tasti:
 * i dettagli e la mappina si aprono e si chiudono senza rifare niente.
 */
export function cartellino(hass, ent, st, col, cambiato, spazio, sfondo) {
  const D = parla(hass);
  const lat = Number(st.attributes.latitude);
  const lon = Number(st.attributes.longitude);
  const nome = st.attributes.friendly_name || ent;
  const foto = st.attributes.entity_picture;
  const dove = st.state === 'home' ? D.cart.aCasa : st.state === 'not_home' ? D.cart.fuori : st.state;
  const prec = st.attributes.gps_accuracy;

  const box = document.createElement('div');
  box.className = 'cartellino';
  box.innerHTML =
    '<div class="capo">' +
    '  <div class="ritratto" style="background-color:' + col + ';' +
    (foto ? "background-image:url('" + encodeURI(foto) + "')" : '') + '">' + (foto ? '' : mappaSalta(nome.charAt(0).toUpperCase())) + '</div>' +
    '  <div><div class="nome">' + mappaSalta(nome) + '</div>' +
    '  <div class="sotto">' + mappaSalta(dove) + ' &middot; ' + daQuanto(st.last_changed, D) + '</div></div>' +
    '</div>' +
    '<div class="tasti"><button class="det">' + mappaSalta(D.cart.dettagli) + '</button>'
    + '<button class="map">' + mappaSalta(D.cart.maps) + '</button></div>' +
    '<div class="dettagli" hidden>' +
    riga(D.cart.via, laVia(hass, ent)) +
    riga(D.cart.citta, laCitta(hass, ent)) +
    riga(D.cart.precisione, isNaN(Number(prec)) ? '' : Math.round(prec) + ' m') +
    riga(D.cart.daCasa, daCasa(hass, st)) +
    riga(D.cart.rilevatoDa, rilevatoDa(hass, st)) +
    riga(D.cart.coordinate, lat.toFixed(5) + ', ' + lon.toFixed(5)) +
    '</div>' +
    '<div class="mappina" hidden><div class="telaio"></div></div>' +
    '<a class="fuori" target="_blank" rel="noopener"' +
    ' href="https://www.google.com/maps/search/?api=1&query=' + lat + ',' + lon + '">'
    + mappaSalta(D.cart.apriMaps) + ' &#8599;</a>';

  const det = box.querySelector('.det');
  const map = box.querySelector('.map');
  const dettagli = box.querySelector('.dettagli');
  const mappina = box.querySelector('.mappina');

  const telaio = box.querySelector('.telaio');
  const avvisa = () => { if (cambiato) cambiato(); };

  // uno per volta: aprendo i dettagli si chiude la mappina e viceversa, se no
  // il cartellino diventa piu' alto della scheda
  det.addEventListener('click', () => {
    dettagli.hidden = !dettagli.hidden;
    det.textContent = dettagli.hidden ? D.cart.dettagli : D.cart.chiudiDettagli;
    if (!dettagli.hidden && !mappina.hidden) {
      mappina.hidden = true;
      map.textContent = D.cart.maps;
    }
    avvisa();
  });

  /**
   * LA MAPPINA E' LA STESSA MAPPA GRANDE, IN PICCOLO. Prima era una pagina di
   * Google incorporata con l'indirizzo vecchio `output=embed`, quello senza
   * chiave: funziona, ma non e' la porta che Google chiede di usare, e su una
   * scheda che altri installano non ci si appoggia a una porta di servizio.
   * Adesso e' un Leaflet con lo STESSO sfondo scelto per la mappa grande - gli
   * stessi tasselli Esri, gia' in cache perche' la mappa li ha scaricati -,
   * nessuna chiave, nessun termine nuovo, stessa attribuzione. Il collegamento
   * "Apri in Google Maps" qui sotto resta: e' un semplice link, e da' i nomi
   * dei locali che una foto dal satellite non sa.
   */
  // La mappina prende l'altezza che avanza nella scheda: cosi' il cartellino ci
  // sta dentro tutto e non c'e' niente da far scorrere. Su una scheda bassa la
  // mappina si accorcia, non sparisce.
  telaio.style.height = Math.max(150, Math.min(210, (spazio || 400) - 190)) + 'px';

  const mostra = () => {
    const L = window.L;
    telaio.innerHTML = '';
    if (!L || !L.map) return;
    const scelto = MAPPA_SFONDI.find((s) => s.chiave === sfondo) || MAPPA_SFONDI.find((s) => s.chiave === MAPPA_SFONDO) || MAPPA_SFONDI[0];
    /* Lo zoom ci vuole tutto: tasti +/- (sul computer non c'e' altro modo
       visibile), rotella, doppio clic e due dita. La rotella non fa scorrere la
       pagina perche' il cartellino di Leaflet ferma gia' lo scorrimento. */
    const piccola = L.map(telaio, {
      zoomControl: true,
      attributionControl: true,
      scrollWheelZoom: true,
      doubleClickZoom: true,
      touchZoom: true,
    });
    piccola.attributionControl.setPrefix(false);
    L.tileLayer(scelto.url, scelto.opzioni).addTo(piccola);
    if (scelto.sopra) L.tileLayer(scelto.sopra, scelto.opzioni).addTo(piccola);
    L.circleMarker([lat, lon], {
      radius: 7, color: '#fff', weight: 2, fillColor: col, fillOpacity: 1,
    }).addTo(piccola);
    piccola.setView([lat, lon], 17);
    // il riquadro era nascosto fino a un attimo fa: Leaflet deve rimisurarlo
    setTimeout(() => piccola.invalidateSize(), 0);
  };

  map.addEventListener('click', () => {
    mappina.hidden = !mappina.hidden;
    map.textContent = mappina.hidden ? D.cart.maps : D.cart.chiudiMaps;
    if (!mappina.hidden && !dettagli.hidden) {
      dettagli.hidden = true;
      det.textContent = D.cart.dettagli;
    }
    // si costruisce solo la prima volta che la si apre
    if (!mappina.hidden && !telaio.firstChild) mostra();
    avvisa();
  });
  return box;
}
