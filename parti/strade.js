import { mappaDistanza } from './utili.js';
import { MAPPA_VERSIONE } from './costanti.js';

/**
 * LA VIA SOTTO LA SCIA. E' lo schema che funzionava, rimesso com'era:
 *
 *  1. la giornata si spezza in VIAGGI sulle soste vere (fermi dentro tot metri
 *     per tot minuti), cosi' l'andata non viene attaccata al ritorno;
 *  2. dentro un viaggio, dove le letture sono VICINE (meno del "buco") la
 *     traccia si AGGANCIA alla via con `trace_route`, a pezzi da cento punti:
 *     la linea si appoggia sulla strada dove si e' passati davvero;
 *  3. solo i BUCHI piu' lunghi di quella misura si riempiono chiedendo il
 *     percorso fra quei due soli punti, con raggio 30;
 *  4. e quel percorso si BUTTA se risulta piu' lungo del vero oltre la
 *     percentuale detta, piu' 200 metri, o se non copre la traccia: li' si
 *     disegna la linea grezza. E' questo controllo che impedisce al calcolatore
 *     di far fare giri che nessuno ha fatto.
 *
 * Il mezzo cambia le regole (a piedi i sensi unici non esistono, in auto si') e
 * si riconosce dalla velocita', o lo si impone dalle impostazioni della persona.
 */

const MEMORIA = new Map();       // quello che si e' gia' chiesto in questa pagina
const DISPENSA = 'mappa-persone:viaggi';  // e quello di prima, nel browser
const TIENI = 60;                // quanti viaggi si conservano
const GIORNI = 3;                // per quanti giorni
const POSTO = 3000000;           // e in quanto spazio (caratteri, circa 3 MB)
const VALHALLA = 'https://valhalla1.openstreetmap.de';
const OSRM = 'https://router.project-osrm.org';
const PEZZO = 100;               // punti per richiesta di aggancio
const TAPPE = 10;                /* quante tappe accetta il server pubblico in una
                                    richiesta sola: dieci, cioe' NOVE tratte in un
                                    colpo. Misurato: oltre risponde
                                    "Exceeded max locations: 10". */
const SFOLTISCI = 25;            // metri: sotto questa distanza la lettura non aggiunge niente
const FERMO = 1;                 // km/h: sotto questa andatura e' il GPS che balla da fermo
const TELETRASPORTO = 200;       /* km/h: sopra questa andatura non c'e' piu' un
                                    viaggio, c'e' una lettura sbagliata */
const COSTI = {
  piedi: 'pedestrian',
  bici: 'bicycle',
  auto: 'auto',
  // l'autobus conosce corsie e piazzali riservati, dove l'auto non puo' entrare:
  // alle stazioni il profilo auto agganciava il punto alla strada piu' vicina e
  // il collegamento veniva storto
  bus: 'bus',
};
const INSIEME = 1;               /* un viaggio alla volta PER PERSONA: le persone
                                    vanno in parallelo, quindi le richieste si
                                    alternano fra l'una e l'altra e le due scie si
                                    riempiono insieme. Con due o quattro, chi ha
                                    tante posizioni si prendeva tutta la fila e la
                                    scia dell'altro arrivava alla fine. */
const RESPIRO = 400;             // ms fra una richiesta e l'altra: il servizio e' pubblico
const CODA = { quando: 0 };      // una richiesta alla volta, in fila

/**
 * LA DISPENSA. Il calcolatore pubblico ci da' circa UNA RICHIESTA AL SECONDO,
 * misurato: mandandogliene quattro insieme ci mette lo stesso tempo. Una
 * giornata sono una ventina di richieste, cioe' venti secondi buoni di attesa
 * ogni volta che si apre la scheda. Ma un viaggio FINITO non cambia piu': le
 * stesse posizioni danno la stessa via. Quindi si tiene da parte nel browser, e
 * riaprendo la scheda le scie ci sono gia': si chiede solo il viaggio in corso.
 *
 * Due regole imparate a spese nostre:
 *  - si conserva SOLO quello che e' venuto bene. Un ripiego nato da un rifiuto
 *    del calcolatore e' una linea dritta, e conservarla vuol dire tenersela per
 *    giorni (era la scia storta di mamma);
 *  - si legge una volta sola e si scrive una volta sola. Leggere e riscrivere a
 *    ogni viaggio costava piu' di quanto facesse risparmiare.
 */
let dispensa = null;
let daScrivere = 0;

function apri() {
  if (dispensa) return dispensa;
  try {
    // le due dispense sbagliate di ieri sera: si buttano, occupavano e basta
    localStorage.removeItem('mappa-persone:vie');
    localStorage.removeItem('mappa-persone:vie2');
    dispensa = JSON.parse(localStorage.getItem(DISPENSA) || '{}');
  } catch (e) {
    dispensa = {};
  }
  return dispensa;
}

function scrivi() {
  clearTimeout(daScrivere);
  daScrivere = 0;
  try {
    const d = apri();
    const scade = Date.now() - GIORNI * 24 * 3600 * 1000;
    const buone = Object.keys(d)
      .filter((k) => d[k].q > scade)
      .sort((a, b) => d[b].q - d[a].q)
      .slice(0, TIENI);
    // dal piu' recente, finche' c'e' posto: la dispensa del browser non e' grande
    const tieni = {};
    let quanto = 0;
    for (const k of buone) {
      const testo = JSON.stringify(d[k]);
      if (quanto + testo.length > POSTO) break;
      quanto += testo.length;
      tieni[k] = d[k];
    }
    dispensa = tieni;
    localStorage.setItem(DISPENSA, JSON.stringify(tieni));
  } catch (e) {
    /* dispensa piena o negata dal browser: pazienza, si ricalcola */
  }
}

function salva() {
  clearTimeout(daScrivere);
  daScrivere = setTimeout(scrivi, 1500);
}

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => { if (daScrivere) scrivi(); });
}

function ricordo(chiave) {
  const v = apri()[chiave];
  return v && v.p && v.p.length > 1 ? { p: v.p, da: v.da, a: v.a } : null;
}

function ricorda(chiave, pezzo) {
  apri()[chiave] = {
    q: Date.now(),
    da: pezzo.da,
    a: pezzo.a,
    // sei decimali: e' la precisione con cui il calcolatore manda la polilinea,
    // quindi quello che si ritrova in dispensa e' identico a quello di prima
    p: pezzo.p.map((c) => [+c[0].toFixed(6), +c[1].toFixed(6)]),
  };
  salva();
}

/**
 * UNA RICHIESTA ALLA VOLTA, CON RESPIRO. Il calcolatore e' un servizio pubblico
 * e gratuito: mandandogli otto richieste insieme comincia a rifiutarle, e qui
 * dentro un rifiuto vuol dire linea dritta invece della via. Quindi si fa la
 * fila, quattro decimi di secondo l'una dall'altra, e se una viene rifiutata si
 * riprova una volta dopo un secondo.
 */
async function chiedi(url, opzioni) {
  for (let prova = 0; prova < 2; prova++) {
    const passa = Date.now() - CODA.quando;
    if (passa < RESPIRO) await new Promise((r) => setTimeout(r, RESPIRO - passa));
    CODA.quando = Date.now();
    const r = await fetch(url, opzioni);
    if (r.ok) return r;
    if (r.status !== 429 && r.status < 500) throw new Error(url.split('/')[2] + ' ha risposto ' + r.status);
    await new Promise((r2) => setTimeout(r2, 1000));
  }
  throw new Error(url.split('/')[2] + ' non risponde');
}

/* ------------------------------------------------------------------ conti */

function lunghezza(g) {
  let l = 0;
  for (let i = 1; i < g.length; i++) l += mappaDistanza(g[i - 1], g[i]);
  return l;
}

/** polilinea compressa a sei decimali, come la manda Valhalla */
function decomprimi(testo) {
  const fuori = [];
  let i = 0;
  let lat = 0;
  let lon = 0;
  while (i < testo.length) {
    let risultato = 1;
    let spostamento = 0;
    let b;
    do {
      b = testo.charCodeAt(i++) - 63 - 1;
      risultato += b << spostamento;
      spostamento += 5;
    } while (b >= 0x1f);
    lat += risultato & 1 ? ~(risultato >> 1) : risultato >> 1;
    risultato = 1;
    spostamento = 0;
    do {
      b = testo.charCodeAt(i++) - 63 - 1;
      risultato += b << spostamento;
      spostamento += 5;
    } while (b >= 0x1f);
    lon += risultato & 1 ? ~(risultato >> 1) : risultato >> 1;
    fuori.push([lat / 1e6, lon / 1e6]);
  }
  return fuori;
}

/* --------------------------------------------------- viaggi, mezzo, letture */

/**
 * Spezza la giornata in VIAGGI, e il metro e' l'orario. Fermi a lungo NELLO
 * STESSO POSTO vuol dire viaggio finito. Fermi a lungo ma lontano vuol dire che
 * il telefono ha tardato a mandare la posizione: e' sempre lo stesso viaggio, e
 * quel buco lo riempie la via.
 */
function viaggi(punti, fermoM, pausaMin) {
  if (punti.length < 2) return [];
  const pausa = Math.max(1, pausaMin) * 60000;
  /* Il minimo era sessanta, e voleva dire che scrivendo cinquanta ne valevano
     sessanta lo stesso: l'impostazione diceva una bugia. Un minimo pero' serve,
     se no con zero non si raggruppa piu' niente e ogni respiro del GPS diventa
     un viaggio. Venticinque metri e' il ballo di un telefono fermo con una
     presa decente: sotto quella misura non c'e' niente da distinguere. */
  const raggio = Math.max(25, fermoM);
  /* Ogni posizione si porta il numero del POSTO dove si e' fermi: -1 vuol dire
     che si stava andando. Non basta sapere "qui e' fermo": due soste in due
     posti diversi, una dopo l'altra, sono due cose diverse. Prima avevano tutte
     e due lo stesso cartellino "fermo", finivano nello stesso pezzo, e per
     unirle si tirava una riga da un posto all'altro attraverso i campi. */
  const posto = new Array(punti.length).fill(-1);
  let quale = 0;
  let i = 0;
  while (i < punti.length) {
    let j = i + 1;
    while (j < punti.length && mappaDistanza(punti[i], punti[j]) <= raggio) j++;
    if (j - i > 1 && (punti[j - 1][2] || 0) - (punti[i][2] || 0) >= pausa) {
      for (let k = i; k < j; k++) posto[k] = quale;
      quale += 1;
      i = j;
    } else {
      i++;
    }
  }
  /* Si restituiscono TUTTI i blocchi, anche quelli fermi. Quelli fermi non si
     mandano al calcolatore - non c'e' via da agganciare, e' uno che sta li' - ma
     si disegnano lo stesso con le posizioni vere: buttarle via lasciava un pezzo
     mancante.

     ATTENZIONE, e' qui che nasceva la striscia fuori strada. Il pezzo di strada
     fra l'ultima posizione del viaggio e la prima della sosta finiva DENTRO TUTTI
     E DUE i blocchi: il viaggio lo faceva calcolare e lo appoggiava sulla via, la
     sosta lo ridisegnava dritto per i campi, e sopra la strada buona restava una
     riga storta. Adesso ogni tratto sta in UN blocco solo: il viaggio arriva fino
     alla prima posizione della sosta, e la sosta comincia da li'. */
  const fuori = [];
  let corsa = [punti[0]];
  for (let k = 1; k < punti.length; k++) {
    if (posto[k] === posto[k - 1]) {
      corsa.push(punti[k]);
      continue;
    }
    const eraFermo = posto[k - 1] >= 0;
    const oraFermo = posto[k] >= 0;
    if (eraFermo && oraFermo) {
      /* Da un posto a un altro senza niente in mezzo: il telefono non ha mandato
         nessuna posizione per la strada, ma lo spostamento c'e' stato. Non e'
         piu' sosta: e' un viaggio di due punti, e la via fra quei due la chiede
         il calcolatore come per ogni altro buco. */
      if (corsa.length > 1) fuori.push({ punti: corsa, fermo: true });
      fuori.push({ punti: [punti[k - 1], punti[k]], fermo: false });
      corsa = [punti[k]];
    } else if (eraFermo) {
      // finita la sosta: il viaggio parte dall'ultima posizione della sosta
      if (corsa.length > 1) fuori.push({ punti: corsa, fermo: true });
      corsa = [punti[k - 1], punti[k]];
    } else {
      // finito il viaggio: arriva fino alla prima posizione della sosta, e la
      // sosta comincia da li'. Nessun tratto disegnato due volte.
      corsa.push(punti[k]);
      fuori.push({ punti: corsa, fermo: false });
      corsa = [punti[k]];
    }
  }
  if (corsa.length > 1) fuori.push({ punti: corsa, fermo: posto[punti.length - 1] >= 0 });

  /* ULTIMA SETACCIATA, ed e' quella che toglie la ragnatela dentro le soste.
     Fra una sosta e l'altra restano dei bloccheitti "in movimento" di due o tre
     posizioni: il telefono che si sveglia, manda una lettura sballata di trenta
     metri e si riaddormenta. Per il calcolatore erano viaggi a tutti gli
     effetti, li appoggiava sulla via piu' vicina, e sulla mappa comparivano
     pezzi di strada che nessuno ha fatto - senza che il cursore della sosta li
     potesse spegnere, perche' viaggi non sono soste.
     Il metro ce l'avevamo gia' e si chiama fermo_m, "sotto questo spostamento
     non e' un viaggio": se il blocco non si allontana MAI piu' di tanto da dove
     e' partito, non ha portato da nessuna parte ed e' sosta. Si guarda la
     distanza massima dal punto di partenza, non quella fra il primo e l'ultimo:
     un giro vero che parte da casa e ci torna finisce vicino a dove e'
     cominciato, ma in mezzo si e' allontanato di chilometri. */
  const centro = (g) => [
    g.reduce((t, x) => t + x[0], 0) / g.length,
    g.reduce((t, x) => t + x[1], 0) / g.length,
  ];
  fuori.forEach((b, i) => {
    if (b.fermo) return;
    const g = b.punti;
    let lontano = 0;
    for (let n = 1; n < g.length; n++) {
      const q = mappaDistanza(g[0], g[n]);
      if (q > lontano) lontano = q;
    }
    if (lontano < raggio) {
      b.fermo = true;
      return;
    }
    /* SECONDA SETACCIATA: il blocco che ESCE E TORNA. Ogni tanto il telefono si
       sveglia e manda una posizione buttata li' a un centinaio di metri, poi
       quella dopo e' di nuovo dov'era. Per la prima setacciata quello e' un
       viaggio - si e' allontanato abbastanza - e il calcolatore ci costruisce
       sopra un pezzo di strada che nessuno ha percorso.
       Si riconosce da tre cose insieme: finisce dov'era cominciato, la sosta
       prima e la sosta dopo sono lo stesso posto (i due mucchi si toccano, cioe'
       i centri distano meno di due raggi), e in mezzo non e' andato lontano.
       Quest'ultima e' la condizione che salva i giri veri: mamma parte da casa,
       fa dieci chilometri e torna a casa, e anche lei finisce dov'era partita -
       ma in mezzo si e' allontanata di chilometri, non di cento metri. */
    const prima = i > 0 && fuori[i - 1].fermo ? centro(fuori[i - 1].punti) : null;
    const dopo = i + 1 < fuori.length && fuori[i + 1].fermo ? centro(fuori[i + 1].punti) : null;
    if (!prima || !dopo) return;
    if (lontano >= raggio * 3) return;
    if (mappaDistanza(g[0], g[g.length - 1]) >= raggio) return;
    if (mappaDistanza(prima, dopo) >= raggio * 2) return;
    b.fermo = true;
  });
  return fuori;
}

/**
 * Che mezzo era, letto dalla velocita'. Si guardano SOLO i tratti lunghi almeno
 * 150 m: quelli corti sono le manovre sotto casa, dove anche un'auto va a passo
 * d'uomo. Poi si prende l'ottantesimo per cento, che scarta la lettura assurda.
 */
function mezzo(punti) {
  const vel = [];
  for (let i = 1; i < punti.length; i++) {
    const m = mappaDistanza(punti[i - 1], punti[i]);
    const sec = ((punti[i][2] || 0) - (punti[i - 1][2] || 0)) / 1000;
    if (m < 150 || sec < 3) continue;
    const kmh = (m / sec) * 3.6;
    if (kmh < 130) vel.push(kmh);
  }

  let v = null;
  if (vel.length) {
    vel.sort((a, b) => a - b);
    v = vel[Math.min(vel.length - 1, Math.floor(vel.length * 0.8))];
  } else {
    /*
     * Nessun tratto lungo abbastanza: succede nei giri corti dentro il paese.
     * Prima qui si rispondeva "a piedi", e a piedi il calcolatore puo' passare
     * per i vicoli e i passaggi pedonali: la scia tagliava in mezzo all'isolato
     * invece di girargli intorno. Meglio guardare la media di tutto il viaggio.
     */
    let m = 0;
    for (let i = 1; i < punti.length; i++) m += mappaDistanza(punti[i - 1], punti[i]);
    const sec = ((punti[punti.length - 1][2] || 0) - (punti[0][2] || 0)) / 1000;
    if (m > 0 && sec > 5) v = (m / sec) * 3.6;
  }

  // se non si capisce proprio, si sceglie l'auto: e' la piu' prudente, perche'
  // non le e' permesso passare dove passa solo la gente a piedi
  if (v === null) return 'auto';
  if (v <= 7) return 'pedestrian';
  if (v <= 25) return 'bicycle';
  return 'auto';
}

/**
 * LE GEMELLE. Ogni tanto il telefono manda DUE posizioni con lo stesso secondo,
 * lontane fra loro centinaia di metri: una delle due e' presa male. Nell'ordine
 * in cui arrivano possono anche essere invertite, e allora la scia fa un salto
 * avanti e uno indietro. Quel salto e' un buco per il calcolatore, che prova a
 * riempirlo con una strada, e quando la strada e' troppo lunga viene scartata e
 * resta una riga dritta in mezzo alle case.
 * Quale delle due si butta lo dice la lettura SUCCESSIVA: si tiene quella piu'
 * vicina a dove si e' andati davvero dopo.
 */
function gemelle(punti) {
  const fuori = [];
  let i = 0;
  while (i < punti.length) {
    const p = punti[i];
    const q = punti[i + 1];
    const dopo = punti[i + 2];
    const doppia = q && dopo
      && Math.abs((q[2] || 0) - (p[2] || 0)) < 2000
      && mappaDistanza(p, q) > 15;
    if (!doppia) {
      fuori.push(p);
      i += 1;
      continue;
    }
    fuori.push(mappaDistanza(q, dopo) < mappaDistanza(p, dopo) ? q : p);
    i += 2;
  }
  return fuori;
}

/**
 * GLI SBALZI. Ogni tanto il telefono spara UNA lettura a centinaia di metri e
 * quella dopo torna dov'era: fra le due ci sarebbero trecento all'ora. La scia
 * ci va dietro, il calcolatore cerca una strada per arrivarci e ne sceglie una
 * sbagliata - la circonvallazione invece della via del paese.
 * Si butta solo la lettura che, tolta di mezzo, rimette il pezzo dentro il
 * possibile: se il salto resta impossibile anche senza di lei, allora non e'
 * uno sbalzo ma un buco vero, e quella lettura e' l'unica cosa che abbiamo.
 */
function sbalzi(punti) {
  if (punti.length < 3) return punti;
  const andatura = (a, b) => {
    const sec = Math.max(0.5, ((b[2] || 0) - (a[2] || 0)) / 1000);
    return (mappaDistanza(a, b) / sec) * 3.6;
  };
  const fuori = [punti[0]];
  for (let i = 1; i < punti.length - 1; i++) {
    const a = fuori[fuori.length - 1];
    const b = punti[i];
    const c = punti[i + 1];
    if (Math.max(andatura(a, b), andatura(b, c)) > TELETRASPORTO
      && andatura(a, c) <= TELETRASPORTO) continue;
    fuori.push(b);
  }
  fuori.push(punti[punti.length - 1]);
  return fuori;
}

/** una lettura ogni venticinque metri, e niente di quello che manda da fermo */
function sfoltisci(grezzi) {
  const punti = grezzi.length > 2 ? sbalzi(gemelle(grezzi)) : grezzi;
  const fuori = [punti[0]];
  for (let i = 1; i < punti.length; i++) {
    const u = fuori[fuori.length - 1];
    const m = mappaDistanza(u, punti[i]);
    if (m < SFOLTISCI) continue;
    const sec = Math.max(1, ((punti[i][2] || 0) - (u[2] || 0)) / 1000);
    if ((m / sec) * 3.6 < FERMO) continue;
    fuori.push(punti[i]);
  }
  const ultimo = punti[punti.length - 1];
  if (fuori[fuori.length - 1] !== ultimo) fuori.push(ultimo);
  return fuori;
}

/* -------------------------------------------------------- le due richieste */

/** la traccia agganciata alla via, a pezzi da cento punti */
async function aggancia(punti, profilo) {
  const fuori = [];
  for (let i = 0; i < punti.length - 1; i += PEZZO - 1) {
    const fetta = punti.slice(i, i + PEZZO);
    if (fetta.length < 2) break;
    const r = await chiedi(VALHALLA + '/trace_route', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        shape: fetta.map((p) => ({
          lat: p[0],
          lon: p[1],
          radius: Math.round(Math.min(50, Math.max(15, p[3] || 20))),
        })),
        costing: profilo,
        shape_match: 'map_snap',
      }),
    });
    const j = await r.json();
    (j.trip && j.trip.legs ? j.trip.legs : []).forEach((l) => {
      decomprimi(l.shape).forEach((c) => fuori.push(c));
    });
  }
  return fuori.length > 1 ? fuori : null;
}

/**
 * GLI STESSI PERCORSI, MA IN UNA RICHIESTA SOLA. Quando i buchi sono uno in fila
 * all'altro (con papa' che manda una posizione ogni mezzo chilometro sono quasi
 * tutti cosi'), invece di chiedere N volte il percorso fra due punti si manda una
 * richiesta con N+1 tappe e si riceve una tratta per ogni coppia.
 *
 * Non cambia NIENTE di quello che si chiede: verificato tratta per tratta contro
 * le richieste singole, stesso numero di punti, stessa lunghezza al metro, scarto
 * zero. Ogni tappa e' `type: 'break'`, che e' quello che sono gia' i due capi di
 * una richiesta a due punti. Cambia solo quanti giri di rete si fanno: da nove a
 * uno.
 *
 * Il `radius: 30` conta e resta: senza, lo stesso tratto veniva tre volte piu'
 * lungo del vero, perche' il calcolatore partiva dalla strada sbagliata.
 */
async function rotte(punti, profilo) {
  const r = await chiedi(VALHALLA + '/route', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      locations: punti.map((p) => ({ lat: p[0], lon: p[1], radius: 30, type: 'break' })),
      costing: profilo,
      directions_options: { units: 'kilometers' },
    }),
  });
  const j = await r.json();
  if (!j.trip || !j.trip.legs) return null;
  return j.trip.legs.map((l) => {
    const g = decomprimi(l.shape);
    return g.length > 1 ? g : null;
  });
}

/** il ripiego: OSRM, che pero' conosce solo l'automobile e accetta pochi punti */
async function osrm(punti) {
  const fuori = [];
  for (let i = 0; i < punti.length - 1; i += 9) {
    const fetta = punti.slice(i, i + 10);
    if (fetta.length < 2) break;
    const dove = fetta.map((p) => p[1].toFixed(6) + ',' + p[0].toFixed(6)).join(';');
    const r = await chiedi(OSRM + '/match/v1/driving/' + dove + '?geometries=geojson&overview=full');
    const j = await r.json();
    (j.matchings || []).forEach((m) => {
      ((m.geometry && m.geometry.coordinates) || []).forEach((c) => fuori.push([c[1], c[0]]));
    });
  }
  return fuori.length > 1 ? fuori : null;
}

/**
 * IL CONTROLLO CHE SALVA TUTTO: la via ricostruita deve COPRIRE la traccia, non
 * solo essere corta. Tre cose: non troppo lunga, ed e' li' che si beccano i giri
 * inventati; non troppo corta, che l'aggancio a volte restituisce un moncone; e
 * i due capi vicini ai capi veri.
 */
function copre(g, punti, giro) {
  if (!g || g.length < 2) return false;
  const grezza = lunghezza(punti.map((p) => [p[0], p[1]]));
  const lunga = lunghezza(g);
  if (lunga > grezza * (giro / 100) + 200) return false;
  if (lunga < grezza * 0.6) return false;
  if (mappaDistanza(g[0], punti[0]) > 150) return false;
  if (mappaDistanza(g[g.length - 1], punti[punti.length - 1]) > 150) return false;
  return true;
}

/* --------------------------------------------------------------- il lavoro */

function attacca(linea, pezzo) {
  pezzo.forEach((c) => {
    const u = linea[linea.length - 1];
    if (!u || u[0] !== c[0] || u[1] !== c[1]) linea.push(c);
  });
}

/**
 * LA CARTA D'IDENTITA' DI UN VIAGGIO. Se e' la stessa, la via e' la stessa: le
 * impostazioni con cui si chiede, quante posizioni ha, quando comincia e quando
 * finisce, e da dove parte. Un viaggio finito ieri ha sempre la stessa carta,
 * quindi si ritrova in dispensa; quello in corso ne prende una nuova a ogni
 * posizione che arriva, quindi si richiede, ed e' giusto cosi'.
 */
function chiaveViaggio(blocco, o) {
  const g = blocco.punti;
  /* Dentro la chiave ci va anche la VERSIONE della scheda. Un viaggio finito non
     cambia piu', vero, ma il MODO DI DISEGNARLO si'. La chiave si calcola sulle
     letture GREZZE, prima di qualunque pulizia: quindi correggendo la pulizia la
     chiave resta identica, la scia sbagliata viene ripescata dalla dispensa tale
     e quale, e sembra che la correzione non sia servita a niente. E' successo
     davvero, due volte. Col numero di versione dentro, il primo giro dopo un
     aggiornamento si ricalcola e poi si torna a pescare come sempre. */
  return [
    MAPPA_VERSIONE, o.motore, o.profilo, o.salto, o.giro, o.fermo, o.pausa,
    g.length, g[0][2] || 0, g[g.length - 1][2] || 0,
    g[0][0].toFixed(5), g[0][1].toFixed(5),
  ].join(':');
}

/** un viaggio solo: fermo si tira una riga, se no si aggancia alla via */
async function pezzoDaBlocco(blocco, o) {
  const gamba = blocco.punti;
  if (gamba.length < 2) return null;

  /* Fermo: nessuna via da agganciare, e le sue letture ballano di qualche metro
     in tutte le direzioni. Disegnarle tutte lascia un ricamo di linee che non
     c'entrano niente, quindi si tira una riga dal primo all'ultimo punto: la
     scia resta continua, il ricamo sparisce, e le posizioni vere si vedono lo
     stesso perche' i pallini ci sono tutti. */
  if (blocco.fermo) {
    // a zero la sosta non si disegna proprio: restano i pallini, che sono le
    // posizioni vere, senza i fili che le uniscono
    if (o.sostaLinea === 0) return null;
    const a = gamba[0];
    const b = gamba[gamba.length - 1];
    /* Una sosta e' un posto, non un percorso, e al calcolatore non si manda:
       tornerebbero decine di "nessun percorso trovato", la fila si intasa e le
       scie degli altri arrivano minuti dopo. Si disegnano le posizioni vere,
       tenute una ogni venticinque metri: chi e' stato davvero fermo si riduce a
       un puntino, e chi in quella sosta ha fatto due passi si vede dove li ha
       fatti. Nessuna riga dritta che taglia l'isolato. */
    /* Quanto fitta si disegna la sosta lo decide la persona: un telefono fermo
       manda posizioni che ballano di decine di metri, e unite tutte fanno una
       ragnatela. Alzando la misura si tengono meno posizioni; molto in alto
       resta una riga sola dal primo all'ultimo punto. */
    const passo = Number(o.sostaLinea) > 0 ? Number(o.sostaLinea) : SFOLTISCI;
    const radi = [gamba[0]];
    for (let i = 1; i < gamba.length; i++) {
      if (mappaDistanza(radi[radi.length - 1], gamba[i]) >= passo) radi.push(gamba[i]);
    }
    if (radi[radi.length - 1] !== b) radi.push(b);
    return {
      p: radi.map((p) => [p[0], p[1]]),
      da: a[2] || 0,
      a: b[2] || 0,
      fermo: true,
    };
  }

  const usati = sfoltisci(gamba);
  if (usati.length < 2) return null;
  const profilo = o.profilo === 'automatico' ? mezzo(usati) : (COSTI[o.profilo] || 'auto');

  /* Prima si GUARDA la traccia e si segna cosa serve, poi si CHIEDE. I tratti
     dove le letture sono vicine si agganciano alla via; dove il telefono ha
     saltato un pezzo si chiede il percorso fra quei due punti. Le misure sono le
     stesse di sempre, non si tocca una soglia: cambia solo che i buchi uno in
     fila all'altro si chiedono in una richiesta sola invece che uno per uno. */
  const fare = [];
  let corsa = [usati[0]];
  /* Un ripiego nasce da due cose diverse. O il calcolatore ha RISPOSTO e la sua
     via e' stata scartata perche' troppo lunga: quella e' una decisione delle
     impostazioni, domani sarebbe uguale. Oppure non ha risposto affatto: quello
     e' un guasto di passaggio, e un viaggio che ne contiene uno NON si mette in
     dispensa, se no la linea dritta resta li' per giorni. */
  let guasto = false;
  for (let i = 1; i < usati.length; i++) {
    const d = mappaDistanza(usati[i - 1], usati[i]);
    if (d > o.salto) {
      if (corsa.length > 1) fare.push({ tipo: 'corsa', punti: corsa });
      fare.push({ tipo: 'buco', a: usati[i - 1], b: usati[i], d: d });
      corsa = [usati[i]];
    } else {
      corsa.push(usati[i]);
    }
  }
  if (corsa.length > 1) fare.push({ tipo: 'corsa', punti: corsa });

  /* I buchi che si toccano - la fine di uno e' l'inizio del prossimo - stanno
     uno accanto all'altro nell'elenco: si mettono insieme, nove per volta. */
  const mucchi = [];
  let k = 0;
  while (k < fare.length) {
    if (fare[k].tipo !== 'buco') { k += 1; continue; }
    let quanti = 1;
    while (quanti < TAPPE - 1 && fare[k + quanti] && fare[k + quanti].tipo === 'buco') quanti += 1;
    mucchi.push({ da: k, quanti: quanti });
    k += quanti;
  }

  for (const mucchio of mucchi) {
    const primo = fare[mucchio.da];
    const tappe = [primo.a];
    for (let n = 0; n < mucchio.quanti; n++) tappe.push(fare[mucchio.da + n].b);
    let g = null;
    try {
      g = await rotte(tappe, profilo);
    } catch (e) {
      g = null;
    }
    if (g) {
      for (let n = 0; n < mucchio.quanti; n++) {
        fare[mucchio.da + n].via = g[n] || null;
        if (!g[n]) guasto = true;
      }
    } else {
      // il mucchio non e' passato: si torna a chiederli uno per uno, cosi' un
      // rifiuto solo non porta via nove tratte insieme
      for (let n = 0; n < mucchio.quanti; n++) {
        const b = fare[mucchio.da + n];
        try {
          const uno = await rotte([b.a, b.b], profilo);
          b.via = uno ? uno[0] : null;
        } catch (e2) {
          b.via = null;
        }
        if (!b.via) guasto = true;
      }
    }
  }

  const linea = [];
  for (const pezzo of fare) {
    if (pezzo.tipo === 'buco') {
      // lo stesso freno di sempre: un percorso piu' lungo del vero oltre la
      // percentuale detta piu' duecento metri si butta e resta la linea grezza
      const limite = pezzo.d * (o.giro / 100) + 200;
      attacca(linea, pezzo.via && lunghezza(pezzo.via) <= limite
        ? pezzo.via
        : [[pezzo.a[0], pezzo.a[1]], [pezzo.b[0], pezzo.b[1]]]);
      continue;
    }
    const grezzi = pezzo.punti.map((q) => [q[0], q[1]]);
    let g = null;
    try {
      g = o.motore === 'osrm' ? await osrm(pezzo.punti) : await aggancia(pezzo.punti, profilo);
    } catch (e) {
      g = null;
      guasto = true;
    }
    attacca(linea, copre(g, pezzo.punti, o.giro) ? g : grezzi);
  }

  if (linea.length < 2) return null;
  return {
    p: linea,
    da: gamba[0][2] || 0,
    a: gamba[gamba.length - 1][2] || 0,
    guasto: guasto,
  };
}

/**
 * Le vie di questa persona: un elenco di pezzi, uno per viaggio.
 * `o` sono le sue impostazioni: { motore, profilo, salto, giro, fermo, pausa }.
 *
 * I viaggi si fanno uno per volta (vedi INSIEME), e appena uno e' pronto si
 * chiama `quandoPronto` con quello che c'e' finora: cosi' la mappa si riempie
 * mano a mano invece di restare grezza finche' non e' finito tutto.
 */
export async function agganciaStrade(punti, o, quandoPronto) {
  if (!punti || punti.length < 2) return null;
  if (o.motore !== 'valhalla' && o.motore !== 'osrm') return null;
  const chiave = [
    o.motore, o.profilo, o.salto, o.giro, o.fermo, o.pausa, punti.length,
    punti[0][0].toFixed(5), punti[0][1].toFixed(5),
    punti[punti.length - 1][0].toFixed(5), punti[punti.length - 1][1].toFixed(5),
  ].join(':');
  if (MEMORIA.has(chiave)) return MEMORIA.get(chiave);

  const blocchi = viaggi(punti, o.fermo, o.pausa);
  const risultati = new Array(blocchi.length).fill(null);
  let prossimo = 0;

  const lavora = async () => {
    while (prossimo < blocchi.length) {
      const i = prossimo;
      prossimo += 1;
      /* Le soste non si chiedono a nessuno, si disegnano qui: non serve
         tenerle da parte. Si conservano i viaggi veri, e solo se sono venuti
         bene. */
      const k = blocchi[i].fermo ? null : chiaveViaggio(blocchi[i], o);
      const gia = k && ricordo(k);
      if (gia) {
        risultati[i] = gia;
      } else {
        try {
          risultati[i] = await pezzoDaBlocco(blocchi[i], o);
          if (k && risultati[i] && !risultati[i].guasto) ricorda(k, risultati[i]);
        } catch (e) {
          console.warn('[mappa-persone] aggancio non riuscito:', e);
        }
      }
      if (quandoPronto) quandoPronto(risultati.filter(Boolean));
    }
  };

  const mani = [];
  for (let k = 0; k < Math.min(INSIEME, blocchi.length); k++) mani.push(lavora());
  await Promise.all(mani);

  const pezzi = risultati.filter(Boolean);
  const fuori = pezzi.length ? pezzi : null;
  MEMORIA.set(chiave, fuori);
  return fuori;
}
