# -*- coding: utf-8 -*-
"""
Prepara la cartella `dist/` per HACS.

HACS scarica i file `.js` che trova in `dist/`, ma NON scende nelle sottocartelle:
quindi li' dentro i pezzi non possono stare in `parti/`, devono essere tutti
appiattiti uno accanto all'altro, e le importazioni vanno riscritte di
conseguenza (`./parti/utili.js` diventa `./utili.js`).

Alle importazioni si appiccica anche `?v=<versione>`, come fa `porta.py`: senza,
dopo un aggiornamento il browser continua a servire i pezzi vecchi presi dalla
cache, e sembra che la nuova versione non sia cambiata in niente.

Si lancia con `python costruisci.py`. La cartella `dist/` va messa sotto
controllo di versione: e' quella che la gente installa.

Il file d'ingresso in cima al deposito si chiama `sorgente.js` e NON
`mappa-persone.js`, e non e' un capriccio: HACS cerca il nome dichiarato in
`hacs.json` prima in cima al deposito e solo dopo dentro `dist/`, e si ferma
al primo che trova. Con un `mappa-persone.js` in cima scaricherebbe quello da
solo -- che pero' importa i pezzi da `parti/` -- e la scheda arriverebbe
spezzata a chi la installa.
"""
import io
import os
import re
import shutil

QUI = os.path.dirname(os.path.abspath(__file__))
DIST = os.path.join(QUI, 'dist')


def versione():
    s = io.open(os.path.join(QUI, 'parti', 'costanti.js'), encoding='utf-8').read()
    m = re.search(r"MAPPA_VERSIONE\s*=\s*'([^']+)'", s)
    if not m:
        raise SystemExit('non trovo la versione in parti/costanti.js')
    return m.group(1)


def appiattisci(testo, v):
    """`from './parti/x.js'` e `from './x.js'` diventano `from './x.js?v=...'`"""
    def cambia(m):
        return "from '%s./%s?v=%s'" % (m.group(1), m.group(3), v)
    return re.sub(r"from\s+'(\.{1,2})/(?:parti/)?([^'?]+\.js)'",
                  lambda m: "from '%s/%s?v=%s'" % (m.group(1), m.group(2), v), testo)


def main():
    v = versione()
    if os.path.isdir(DIST):
        shutil.rmtree(DIST)
    os.makedirs(DIST)

    fatti = []
    # IL PORTONE non porta dentro nessuna versione: e' l'unico file che il
    # browser puo' tenere in cache per sempre. Vedi sorgente.js.
    principale = io.open(os.path.join(QUI, 'sorgente.js'), encoding='utf-8').read()
    io.open(os.path.join(DIST, 'mappa-persone.js'), 'w', encoding='utf-8').write(principale)
    fatti.append('mappa-persone.js')

    # quello che il portone carica, con dentro i pezzi versionati
    avvio = io.open(os.path.join(QUI, 'avvio.js'), encoding='utf-8').read()
    io.open(os.path.join(DIST, 'avvio.js'), 'w', encoding='utf-8').write(appiattisci(avvio, v))
    fatti.append('avvio.js')

    # il foglietto che il portone legge senza cache a ogni apertura della pagina.
    # Si chiama .js perche' HACS scarica solo i .js che trova in dist/.
    io.open(os.path.join(DIST, 'versione.js'), 'w', encoding='utf-8').write(
        u"/* la versione viva della scheda: la legge il portone, vedi sorgente.js */\n"
        u"export const MAPPA_V = '%s';\n" % v)
    fatti.append('versione.js')

    for nome in sorted(os.listdir(os.path.join(QUI, 'parti'))):
        if not nome.endswith('.js'):
            continue
        s = io.open(os.path.join(QUI, 'parti', nome), encoding='utf-8').read()
        io.open(os.path.join(DIST, nome), 'w', encoding='utf-8').write(appiattisci(s, v))
        fatti.append(nome)

    # Leaflet: la scheda se lo carica da sola dalla stessa cartella
    for f in ('leaflet.js', 'leaflet.css'):
        da = os.path.join(QUI, 'leaflet', f)
        if os.path.isfile(da):
            shutil.copy(da, os.path.join(DIST, f))
            fatti.append(f)

    print('dist pronta, versione %s, %d file:' % (v, len(fatti)))
    for f in fatti:
        print('   ', f)


if __name__ == '__main__':
    main()
