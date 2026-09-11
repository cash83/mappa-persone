# -*- coding: utf-8 -*-
"""
Porta la scheda sul box.

Un solo comando: `python porta.py`.

Da quando la scheda si installa da HACS, questo copione mette sul box ESATTAMENTE
quello che ci metterebbe HACS: i file appiattiti di `dist/`, tutti uno accanto
all'altro dentro `www/community/mappa-persone/`, senza sottocartelle. Cosi' la
prova in casa e l'installazione della gente sono lo stesso identico impianto, e
la risorsa Lovelace di HACS (`/hacsfiles/mappa-persone/mappa-persone.js`) continua
a funzionare senza toccare niente.

Cosa fa, in ordine:
 - ricontrolla gli accenti inversi in tutti i pezzi (due trappole gia' pagate);
 - rifa' `dist/` con `costruisci.py`, che appiattisce gli import e ci appiccica
   `?v=<versione>` (senza, il browser continua a servire i pezzi vecchi);
 - svuota la cartella sul box e ci copia dentro `dist/`;
 - toglie le sottocartelle rimaste dalle installazioni vecchie (`parti/`, `dist/`).
"""
import io
import os
import shutil

import costruisci

QUI = os.path.dirname(os.path.abspath(__file__))
BOX = r'\\192.168.50.165\config\www\community\mappa-persone'


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
    for cartella in (QUI, os.path.join(QUI, 'parti')):
        for f in sorted(os.listdir(cartella)):
            if f.endswith('.js'):
                dentro = os.path.join(cartella, f)
                controlla(io.open(dentro, encoding='utf-8').read(),
                          os.path.relpath(dentro, QUI))

    costruisci.main()
    dist = os.path.join(QUI, 'dist')

    if not os.path.isdir(BOX):
        os.makedirs(BOX)

    # le sottocartelle delle installazioni vecchie: da HACS in poi non esistono piu'
    for vecchia in ('parti', 'dist'):
        la = os.path.join(BOX, vecchia)
        if os.path.isdir(la):
            shutil.rmtree(la)
            print('tolta la vecchia cartella %s/' % vecchia)

    fatti = []
    for f in sorted(os.listdir(dist)):
        shutil.copy(os.path.join(dist, f), os.path.join(BOX, f))
        fatti.append(f)

    print()
    print('portati %d file sul box:' % len(fatti))
    for f in fatti:
        print('   ', f)
    print()
    print('risorsa Lovelace (quella che scrive HACS):')
    print('   /hacsfiles/mappa-persone/mappa-persone.js')


if __name__ == '__main__':
    porta()
