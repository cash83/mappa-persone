# -*- coding: utf-8 -*-
"""
Porta la scheda sul box.

Un solo comando: `python porta.py`.

Cosa fa, e perche':
 - legge la versione da parti/costanti.js;
 - copia tutti i .js in /config/www/community/mappa-persone/ APPENDENDO ?v=<versione>
   a ogni import. Senza questo il browser rinfresca solo il file principale (quello
   ha il ?v= nella risorsa Lovelace) e continua a usare i pezzi vecchi tenuti in
   cache: si cambia una cosa in parti/ e non succede niente;
 - dice l'indirizzo da mettere nella risorsa Lovelace.
Leaflet si copia una volta sola: se e' gia' la' non si tocca.
"""
import io
import os
import re
import shutil

QUI = os.path.dirname(os.path.abspath(__file__))
BOX = r'\\192.168.50.165\config\www\community\mappa-persone'


def versione():
    s = io.open(os.path.join(QUI, 'parti', 'costanti.js'), encoding='utf-8').read()
    return re.search(r"MAPPA_VERSIONE = '([^']+)'", s).group(1)


def timbra(testo, v):
    """a ogni import nostro si attacca la versione, cosi' il browser lo rilegge"""
    return re.sub(r"(from '\./[^']+\.js)'", r"\1?v=" + v + "'", testo)


def controlla(testo, nome):
    """Due controlli che hanno gia' salvato la giornata.

    1. gli accenti inversi devono essere in numero pari: uno dispari vuol dire
       un template literal aperto e mai chiuso;
    2. dentro il TESTO di un template literal non ci deve stare nessun accento
       inverso, nemmeno a coppie: due accenti dentro un commento (per esempio
       intorno a una parola) chiudono e riaprono la stringa, il codice in mezzo
       diventa istruzioni e il file si spacca. Il controllo sul numero pari
       lasciava passare proprio quel caso.
    """
    quanti = testo.count(chr(96))
    if quanti % 2:
        raise SystemExit('%s ha %d accenti inversi, dispari: template literal aperto'
                         % (nome, quanti))
    # nel foglio di stile il testo e' UN template literal solo: gli unici due
    # accenti inversi ammessi sono quelli che lo aprono e lo chiudono
    if nome.replace(chr(92), '/').endswith('stile.js') and quanti > 2:
        raise SystemExit(
            '%s ha %d accenti inversi: dentro il testo dello stile non ci vanno, '
            'nemmeno nei commenti. Toglili.' % (nome, quanti))


def porta():
    v = versione()
    if not os.path.isdir(BOX):
        os.makedirs(BOX)
    fatti = []
    for cartella, dentro, files in os.walk(QUI):
        # si POTANO le cartelle da saltare, se no os.walk ci scende comunque
        dentro[:] = [d for d in dentro if d not in ('backup', '__pycache__')]
        if os.path.basename(cartella) in ('backup', '__pycache__'):
            continue
        for f in files:
            if not f.endswith('.js') or f.startswith('leaflet'):
                continue
            dentro = os.path.join(cartella, f)
            relativo = os.path.relpath(dentro, QUI)
            fuori = os.path.join(BOX, relativo)
            if not os.path.isdir(os.path.dirname(fuori)):
                os.makedirs(os.path.dirname(fuori))
            testo = io.open(dentro, encoding='utf-8').read()
            controlla(testo, relativo)
            io.open(fuori, 'w', encoding='utf-8').write(timbra(testo, v))
            fatti.append(relativo.replace('\\', '/'))

    # Leaflet: le copie locali, una volta sola
    for f in ('leaflet.js', 'leaflet.css'):
        la = os.path.join(BOX, f)
        if not os.path.isfile(la):
            shutil.copy(r'\\192.168.50.165\config\www\community\amazon-corriere-card\%s' % f, la)
            fatti.append(f + ' (copiato da amazon-corriere-card)')

    print('versione %s, portati %d file:' % (v, len(fatti)))
    for f in sorted(fatti):
        print('   ', f)
    print()
    print('risorsa Lovelace: /local/community/mappa-persone/mappa-persone.js?v=%s' % v)


if __name__ == '__main__':
    porta()
