/** Due conti che servono un po' dappertutto, e niente altro. */

/** metri fra due punti [lat, lon] */
export function mappaDistanza(a, b) {
  const R = 6371000;
  const f1 = (a[0] * Math.PI) / 180;
  const f2 = (b[0] * Math.PI) / 180;
  const df = f2 - f1;
  const dl = ((b[1] - a[1]) * Math.PI) / 180;
  const x = Math.sin(df / 2) * Math.sin(df / 2) + Math.cos(f1) * Math.cos(f2) * Math.sin(dl / 2) * Math.sin(dl / 2);
  return 2 * R * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

/**
 * Le righe della scheda, sempre come oggetti. Nella configurazione una riga puo'
 * essere scritta come nome secco ('person.mamma') o come oggetto con dentro le
 * sue cose (foto, grandezza, trasparenza): qui diventano tutte oggetti, cosi'
 * chi le usa non deve saperlo.
 */
export function mappaRighe(config) {
  const e = (config && config.entities) || [];
  return e
    .map((x) => (typeof x === 'string' ? { entity: x } : Object.assign({}, x)))
    .filter((r) => r && r.entity);
}

/**
 * Il valore di una voce per questa persona: il suo se ce l'ha, se no quello di
 * partenza. Le diciotto voci della via e dei viaggi vivono qui dentro.
 */
export function mappaSua(riga, chiave, predefiniti) {
  const v = riga && riga[chiave];
  if (v === undefined || v === null || v === '') return predefiniti[chiave];
  return v;
}

/** solo i nomi delle entita', nell'ordine */
export function mappaElenco(config) {
  return mappaRighe(config).map((r) => r.entity);
}

/**
 * Il colore di una riga. Il selettore di Home Assistant non da' un colore vero
 * ma il NOME di un colore del tema ('red', 'pink'...): li' sotto c'e' una
 * variabile CSS, e a Leaflet una variabile non serve a niente perche' finisce
 * dentro un attributo dell'SVG. Quindi si legge il valore vero dall'elemento.
 */
export function mappaColore(valore, dentro, ripiego) {
  /* Anche il RIPIEGO va tradotto: se e' il nome di un colore del tema ('primary')
     e lo si restituisce cosi' com'e', finisce dentro l'attributo di stile come
     parola e il browser lo butta - il bordo restava del colore di prima. */
  const quale = valore || ripiego;
  if (!quale) return '';
  if (/^(#|rgb|hsl)/.test(quale)) return quale;
  try {
    const v = getComputedStyle(dentro).getPropertyValue('--' + quale + '-color').trim();
    if (v) return v;
  } catch (e) {
    /* niente da leggere: si prova col nome cosi' com'e' */
  }
  return quale;
}

/**
 * Una scritta che viene da fuori - il nome di una persona, una via, un comune -
 * non deve poter diventare codice quando finisce dentro dell'HTML. Si scappano
 * anche le virgolette: certe scritte finiscono dentro un attributo.
 */
export function mappaSalta(t) {
  return String(t === undefined || t === null ? '' : t)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * L'ora scritta come la legge la gente: 14:07. La lingua NON si impone: prima
 * c'era scritto 'it-IT' e un inglese si ritrovava l'orario all'italiana dentro
 * una scheda per il resto tutta in inglese. Senza, decide il browser di chi
 * guarda, che e' quello che fa ogni altra scheda di Home Assistant.
 */
export function mappaOra(quando) {
  return new Date(quando).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

/**
 * Sposta una linea di lato, di tanti pixel, perpendicolarmente al senso di
 * marcia. Serve ad affiancare andata e ritorno come le corsie di una strada:
 * ognuna alla destra del PROPRIO verso - si guida a destra, non a sinistra -
 * quindi finiscono su lati opposti e si vedono tutte e due. E' in pixel, quindi resta uguale a ogni ingrandimento:
 * per questo va rifatta quando si ingrandisce.
 */
export function mappaAffianca(mappa, punti, px) {
  if (!px || !punti || punti.length < 2) return punti;
  const p = punti.map((x) => mappa.latLngToLayerPoint(x));
  return p.map((q, i) => {
    const a = p[Math.max(0, i - 1)];
    const b = p[Math.min(p.length - 1, i + 1)];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const l = Math.sqrt(dx * dx + dy * dy) || 1;
    // Da che lato: il verso e' stato scelto guardando la mappa vera, non la
    // teoria. Se un giorno le due linee tornano a sembrare scambiate, e' qui
    // che si cambia il segno, e basta.
    const fuori = mappa.layerPointToLatLng({ x: q.x - (dy / l) * px, y: q.y + (dx / l) * px });
    return [fuori.lat, fuori.lng];
  });
}
