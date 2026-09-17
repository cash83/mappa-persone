/**
 * mappa-persone - IL PORTONE.
 *
 * Questo file non cambia mai, ed e' apposta. Home Assistant serve i file delle
 * schede con un mese di validita' in cache (`Cache-Control: max-age=2678400`),
 * e l'elenco delle risorse Lovelace lo rilegge solo quando riparte: percio'
 * prima, per far arrivare una versione nuova al browser, bisognava cambiare il
 * `?v=` della risorsa e riavviare Home Assistant. Ogni volta.
 *
 * Adesso no. Il portone resta identico - puo' stare in cache quanto vuole - e
 * a ogni apertura della pagina fa una cosa sola: chiede `versione.js` dicendo
 * al browser di NON usare la cache, e con quel numero carica il resto. I pezzi
 * restano in cache come prima, ma il giorno che la versione cambia il loro
 * indirizzo cambia con lei e arrivano quelli nuovi, senza riavviare niente.
 *
 * Il lavoro vero sta in `avvio.js` e in `parti/`, un file per mestiere.
 */

const QUI = import.meta.url;

/** la versione che c'e' sul box ADESSO, non quella che il browser ricorda */
async function versione() {
  try {
    const r = await fetch(new URL('versione.js', QUI), { cache: 'no-store' });
    if (r.ok) {
      const scritta = (await r.text()).match(/'([^']+)'/);
      if (scritta) return scritta[1];
    }
  } catch (e) {
    /* senza rete si va avanti lo stesso: si carica quello che c'e' in cache,
       che e' meglio di una scheda che non compare */
  }
  return 'ultima';
}

await import(new URL('avvio.js?v=' + encodeURIComponent(await versione()), QUI).href);
