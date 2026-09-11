import { mappaDistanza } from './utili.js?v=3.1.1';

/**
 * IL CARTELLINO che si apre toccando una persona: foto, nome, dove sta e da
 * quanto, e due tasti per aprire i dettagli e una mappina di Google.
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
export function laVia(hass, ent) {
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
export function laCitta(hass, ent) {
  const nome = sensoreIndirizzo(hass, ent);
  const s = nome && hass.states[nome];
  if (!s) return '';
  const a = s.attributes || {};
  const citta = attributo(a, 'locality') || attributo(a, 'sublocality') || attributo(a, 'city');
  if (citta) return citta;
  const pezzi = (s.state || '').split(',');
  return pezzi.length > 1 ? pezzi[1].trim() : '';
}

function daQuanto(quando) {
  const sec = Math.max(0, (Date.now() - new Date(quando).getTime()) / 1000);
  if (sec < 90) return 'adesso';
  const min = Math.round(sec / 60);
  if (min < 60) return min + ' minuti fa';
  const ore = Math.round(min / 60);
  if (ore < 48) return ore + ' ore fa';
  return Math.round(ore / 24) + ' giorni fa';
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
  // il valore lungo (una citta' con tre parole) si accorcia coi puntini invece
  // di andare a capo: il cartellino deve restare basso
  return '<div class="rg"><span>' + nome + '</span><b title="' + valore + '">' + valore + '</b></div>';
}

/**
 * Costruisce il cartellino. Torna un elemento con dentro gia' i suoi tasti:
 * i dettagli e la mappina si aprono e si chiudono senza rifare niente.
 */
export function cartellino(hass, ent, st, col, cambiato, spazio, sfondo) {
  const lat = Number(st.attributes.latitude);
  const lon = Number(st.attributes.longitude);
  const nome = st.attributes.friendly_name || ent;
  const foto = st.attributes.entity_picture;
  const dove = st.state === 'home' ? 'A casa' : st.state === 'not_home' ? 'Fuori' : st.state;
  const prec = st.attributes.gps_accuracy;

  const box = document.createElement('div');
  box.className = 'cartellino';
  box.innerHTML =
    '<div class="capo">' +
    '  <div class="ritratto" style="background-color:' + col + ';' +
    (foto ? "background-image:url('" + foto + "')" : '') + '">' + (foto ? '' : nome.charAt(0).toUpperCase()) + '</div>' +
    '  <div><div class="nome">' + nome + '</div>' +
    '  <div class="sotto">' + dove + ' &middot; ' + daQuanto(st.last_changed) + '</div></div>' +
    '</div>' +
    '<div class="tasti"><button class="det">Dettagli</button><button class="map">Maps</button></div>' +
    '<div class="dettagli" hidden>' +
    riga('Via', laVia(hass, ent)) +
    riga('Citta', laCitta(hass, ent)) +
    riga('Precisione', isNaN(Number(prec)) ? '' : Math.round(prec) + ' m') +
    riga('Da casa', daCasa(hass, st)) +
    riga('Rilevato da', rilevatoDa(hass, st)) +
    riga('Coordinate', lat.toFixed(5) + ', ' + lon.toFixed(5)) +
    '</div>' +
    '<div class="mappina" hidden><div class="telaio"></div></div>' +
    '<a class="fuori" target="_blank" rel="noopener"' +
    ' href="https://www.google.com/maps/search/?api=1&query=' + lat + ',' + lon + '">Apri in Google Maps &#8599;</a>';

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
    det.textContent = dettagli.hidden ? 'Dettagli' : 'Chiudi dettagli';
    if (!dettagli.hidden && !mappina.hidden) {
      mappina.hidden = true;
      map.textContent = 'Maps';
    }
    avvisa();
  });

  /**
   * La mappina di Google: `t=m` e' la carta stradale, `t=k` la foto dal
   * satellite. Non serve nessuna chiave. Per cambiare al volo c'e' gia' il
   * quadratino di Google in basso a sinistra, quindi qui non si mettono tasti:
   * da quale delle due si parte lo dice l'impostazione della scheda.
   */
  // La mappina prende l'altezza che avanza nella scheda: cosi' il cartellino ci
  // sta dentro tutto e non c'e' niente da far scorrere. Su una scheda bassa la
  // mappina si accorcia, non sparisce.
  // sotto una certa misura Google nasconde il suo quadratino in basso a
  // sinistra, quello per passare da stradale a satellite: non si scende
  telaio.style.height = Math.max(170, Math.min(210, (spazio || 400) - 190)) + 'px';

  const mostra = (tipo) => {
    telaio.innerHTML = '';
    const q = document.createElement('iframe');
    q.loading = 'lazy';
    q.src = 'https://maps.google.com/maps?q=' + lat + ',' + lon + '&t=' + tipo + '&z=17&output=embed';
    telaio.appendChild(q);
  };

  map.addEventListener('click', () => {
    mappina.hidden = !mappina.hidden;
    map.textContent = mappina.hidden ? 'Maps' : 'Chiudi Maps';
    if (!mappina.hidden && !dettagli.hidden) {
      dettagli.hidden = true;
      det.textContent = 'Dettagli';
    }
    // si costruisce solo la prima volta che la si apre
    if (!mappina.hidden && !telaio.firstChild) mostra(sfondo === 'stradale' ? 'm' : 'k');
    avvisa();
  });
  return box;
}
