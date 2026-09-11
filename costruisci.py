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
    principale = io.open(os.path.join(QUI, 'mappa-persone.js'), encoding='utf-8').read()
    io.open(os.path.join(DIST, 'mappa-persone.js'), 'w', encoding='utf-8').write(
        appiattisci(principale, v))
    fatti.append('mappa-persone.js')

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
