/**
 * Le foto delle entita': si caricano dal computer o dal telefono e restano sul
 * box, dentro l'archivio immagini di Home Assistant. Nella configurazione
 * finisce solo l'indirizzo.
 *
 * Due cose imparate a spese nostre:
 *  - il caricamento NON passa dal websocket: e' una POST a /api/image/upload con
 *    il gettone di chi sta guardando la pagina (`hass.auth.data.access_token`);
 *  - la foto va ritagliata quadrata PRIMA di mandarla: l'icona sulla mappa
 *    taglia comunque, e una foto verticale verrebbe mostrata schiacciata.
 */

/** ritaglia al centro il quadrato piu' grande che ci sta, e rimpicciolisce a 512 */
export function fotoQuadrata(file) {
  return new Promise((ok) => {
    const img = new Image();
    img.onload = () => {
      const lato = Math.min(img.width, img.height);
      const tela = document.createElement('canvas');
      tela.width = 512;
      tela.height = 512;
      tela.getContext('2d').drawImage(
        img,
        (img.width - lato) / 2, (img.height - lato) / 2, lato, lato,
        0, 0, 512, 512
      );
      tela.toBlob((b) => ok(b || file), 'image/jpeg', 0.9);
    };
    img.onerror = () => ok(file);   // se non si riesce a leggerla, si manda com'e'
    img.src = URL.createObjectURL(file);
  });
}

/** carica la foto e restituisce l'indirizzo con cui mostrarla */
export async function caricaFoto(hass, file) {
  const quadrata = await fotoQuadrata(file);
  const dati = new FormData();
  dati.append('file', quadrata, 'foto.jpg');
  const r = await fetch('/api/image/upload', {
    method: 'POST',
    body: dati,
    headers: { Authorization: 'Bearer ' + hass.auth.data.access_token },
  });
  if (!r.ok) throw new Error('caricamento non riuscito (' + r.status + ')');
  const j = await r.json();
  return '/api/image/serve/' + j.id + '/512x512';
}

/** toglie dal box una foto caricata da qui; se non e' nostra non si tocca */
export async function togliFoto(hass, indirizzo) {
  const m = /^\/api\/image\/serve\/([^/]+)/.exec(indirizzo || '');
  if (!m) return;
  try {
    await hass.callWS({ type: 'image/delete', image_id: m[1] });
  } catch (e) {
    /* magari e' gia' sparita, o la usa qualcun altro: pazienza */
  }
}
