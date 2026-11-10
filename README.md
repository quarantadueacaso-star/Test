# Corsa Cosmica

Una corsa infinita in 3D che si gioca nel browser, anche da smartphone e anche senza connessione.

Bip, un piccolo robot, corre su una pista aliena e non sa fermarsi: tu devi tenerlo in gara il più a lungo possibile. La velocità cresce, il cielo cambia (tramonto, notte, alba, giorno) e gli ostacoli si fanno più fitti.

## Come si apre

Apri **`index.html`** con un browser qualsiasi (Chrome, Safari, Firefox, Edge). È un unico file: non serve installare nulla e non serve internet.

Per giocarci dal telefono puoi copiare `index.html` sul dispositivo e aprirlo, oppure pubblicare il repository con GitHub Pages (Settings → Pages) e aprire l'indirizzo che ti viene dato.

## Come si gioca

| Ostacolo | Cosa fare | Tastiera | Telefono |
| --- | --- | --- | --- |
| Cristalli rosa | Salta | ↑, W o Spazio | Scorri in su (o tocco veloce) |
| Portali azzurri | Scivola sotto | ↓ o S | Scorri in giù |
| Monoliti arancioni | Cambia corsia | ← → oppure A D | Scorri di lato |

- Le sfere d'oro valgono 10 punti l'una; ogni metro percorso vale 1 punto.
- In aria, scorrere in giù fa atterrare subito e scivolare.
- P o Esc mettono in pausa, M spegne e riaccende l'audio.
- Il record resta salvato nel browser.

## Com'è fatto

```
index.html          il gioco pronto all'uso (file unico, generato)
src/index.html      pagina e stile
src/game.js         codice del gioco
vendor/three.min.js three.js r160 (licenza MIT, vedi vendor/THREE-LICENSE)
build.mjs           unisce i tre file qui sopra in index.html
```

Per modificare il gioco lavora sui file in `src/` (si può aprire direttamente anche `src/index.html`), poi rigenera il file unico:

```
node build.mjs
```

Grafica, suoni e musica sono generati dal codice: non ci sono immagini né file audio.
