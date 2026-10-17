# bitan·sono

Application compagnon moderne et open-source pour le **sonomètre Bitan / SKU001**
(interface USB HID, VID `0x64BD` / PID `0x74E3`) — réimplémentation complète de
l'ancien logiciel Windows « SoundLab ».

Le logiciel d'origine est une application .NET/WPF compilée dont les sources ne
sont pas publiées. Ce projet a été développé par **rétro-ingénierie** (décompilation
de `SoundLevel.exe` / `SoundLevelProtocol.dll` et observation du trafic USB) afin
d'assurer l'**interopérabilité** avec l'appareil — et non de redistribuer le
logiciel propriétaire. La totalité du code de ce dépôt est original (licence MIT) ;
seuls l'icône et les deux sons d'alarme proviennent de l'installation d'origine.

---

## Aperçu

| Temps réel | Maison | Import / Historique |
|---|---|---|
| Jauge SPL, voyants FAST/SLOW, MAX, pondération A/C, seuils d'alarme, graphique et tableau en direct | Météo de la maison : baromètre 4 zones, LAeq 1 s / 1 min, dosimètre zone rouge, L10/L50/L90 et conseils bienveillants | Lecture de la mémoire de l'appareil, courbe d'analyse, export Excel/CSV |

- Interface web moderne (dark/light) affichée dans une **fenêtre native**
  (pywebview / WebView2) — ou dans un simple navigateur.
- **Acquisition temps réel** : valeur SPL, mode (FAST/SLOW), pondération (A/C),
  gamme, indicateur MAX, pile faible, alarmes visuelles et sonores.
- **Historique** : téléchargement des enregistrements stockés dans le sonomètre.
- **Export / import** : XLSX, CSV et `.xls` hérités (compatible avec les fichiers
  produits par l'ancien logiciel).
- **Réglages appareil** : gamme de mesure (5 plages), FAST/SLOW, A/C, MAX.
- **Statistiques** : minimum, maximum, moyenne, Leq, percentiles L10 / L50 / L90.
- **Vue Maison** : ambiance du moment, baromètre sonore (LAeq 1 s / 1 min, 4 zones),
  météo de la maison (soleil, éclaircies, nuageux, orage selon la zone),
  temps passé au-dessus de 75 dB dans la journée et conseil familial contextuel.
- Fonctionne **sans matériel** grâce à un simulateur intégré.

## Installation (développement)

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe run.py
```

Python 3.10+ requis. Sous Windows, `pywinusb` fournit l'accès HID sans DLL externe.

## Utilisation

```powershell
python run.py                 # fenêtre native (repli navigateur si indisponible)
python run.py --no-gui        # ouvre l'interface dans le navigateur par défaut
python run.py --sim           # force le simulateur
python run.py --device real   # exige le sonomètre physique
python run.py --scan          # liste les périphériques HID et quitte
python run.py --port 8080     # port fixe du serveur local
```

⚠️ Le sonomètre ne peut être ouvert que par un seul programme à la fois :
fermez l'ancien logiciel « SoundLab » avant de lancer bitan·sono.

### Si le sonomètre ne répond plus

Si l'appareil cesse de répondre en cours de mesure (autre logiciel qui s'en
empare, mise en veille USB, débranchement), l'application ne se fige pas :

1. elle tente **automatiquement de rouvrir** le périphérique (la pastille
   d'état affiche « Reconnexion… ») et reprend la mesure dès qu'il répond ;
2. si l'appareil reste injoignable, la mesure s'arrête **proprement** avec un
   message explicite et le bouton repasse sur « Démarrer » ;
3. une fois l'appareil de nouveau libre, il suffit de relancer la mesure.

Si la **fenêtre native** ne parvient pas à s'afficher (pilote WebView2 lent ou
verrouillé), l'application ouvre automatiquement l'interface dans le navigateur
au bout de 30 s : le serveur local est indépendant de la fenêtre.

## Construire l'exécutable

```powershell
pyinstaller build.spec --noconfirm
# résultat : dist\bitan-sono.exe (autonome, sans Python installé)
```

## Tests

```powershell
.\.venv\Scripts\python.exe -m pytest -q          # protocole + import/export
.\.venv\Scripts\python.exe scripts\smoke.py      # de bout en bout (simulateur)
.\.venv\Scripts\python.exe scripts\smoke.py --device real
.\.venv\Scripts\python.exe scripts\probe_device.py   # validation matérielle
```

---

## Protocole USB HID (documentation)

Tout provient de la rétro-ingénierie ; le format a été **vérifié sur le matériel
réel**. L'appareil expose une collection *vendor defined* (usage page `0xFF00`)
avec des rapports de **9 octets** (1 identifiant de rapport + 8 données).

### Trames sortantes (hôte → appareil)

| Commande | Octet 1 | Description |
|---|---|---|
| `READ_POINT` | `0xB3` | Demande une mesure temps réel |
| `HANDSHAKE_HISTORY` | `0xB5` | Handshake avant lecture de la mémoire |
| `READ_HISTORY` | `0xC4` | Demande l'enregistrement suivant |
| `WRITE_SETTINGS` | `0x56` | Applique la configuration (octet 2 = drapeaux) |

L'ancien logiciel construisait des trames de 65 octets complétées par `0x23` ;
la bibliothèque HID n'en transmettait que les 9 premiers. bitan·sono reproduit
les deux formes (`legacy_frame=True`) mais émet par défaut la trame minimale.

### Trames entrantes (appareil → hôte)

**Mesure temps réel** — réponse à `READ_POINT` :

```
[0x00] [valHi] [valLo] [flags] [..]
value = int16 big-endian signé / 10        → dB
```

Bits de `flags` :

| Bit | Masque | Signification |
|---|---|---|
| 7 | `0x80` | Pile faible |
| 6 | `0x40` | FAST (sinon SLOW) |
| 5 | `0x20` | MAX armé |
| 4 | `0x10` | Pondération C (sinon A) |
| 0-3 | `0x0F` | Gamme 0…4 |

Gammes : `0`→30-130, `1`→30-80, `2`→50-100, `3`→60-110, `4`→80-130 dB.

**Historique** — flux d'octets (8 octets par trame, identifiant retiré) :

```
en-tête (8 octets) + intervalle (1 octet) + groupes de 3 octets …
en-tête : [0xFD, flags, ss, mm, hh, jj, MM, AA]   (champs BCD, année +2000)
groupe  : [a, b, c] → deux valeurs 12 bits : ((a<<4)|(b>>4))/20  et  ((b&0xF)<<8|c)/20
0xFD en tête de groupe → nouvel en-tête (nouvelle date/heure/pondération/intervalle)
0xFF                  → fin du journal
```

**Accusés** : réglages acceptés → octet 1 = `0xC4` ; handshake historique → `0xEF`.

### Remarque

L'écriture des réglages et la lecture de l'historique ont été validés contre
l'appareil : `FAST/C/gamme 3/MAX` est relu à l'identique après écriture.

---

## Spécifications de l'appareil (manuel)

| Paramètre | Valeur |
|---|---|
| Source d'étalonnage | 94 dB à 1 kHz |
| Plage de mesure | Pondération A : 30–130 dB · Pondération C : 35–130 dB |
| Précision | ±1,5 dB · Résolution 0,1 dB |
| Réponse en fréquence | 31,5 Hz – 8 500 Hz |
| Pondération temporelle | RAPIDE (8 mesures/s) · LENTE (1 mesure/s) |
| Batterie | Li-ion 3,7 V / 1 000 mAh · autonomie 8 h · charge 1,5 h |
| Capacité de stockage | 31 000 enregistrements |
| Microphone | condensateur 1/2 pouce |
| Environnement | 0–50 °C · 10–80 % HR |
| Dimensions / masse | 160 × 56 × 31 mm · ~126 g |

Le mode **RAPIDE** échantillonne 8 fois par seconde côté appareil ; l'intervalle
d'acquisition de l'application (réglable, 1 s par défaut) détermine la cadence
d'affichage et d'enregistrement.

## Architecture

```
run.py                 point d'entrée (serveur + fenêtre native)
slm/
  protocol.py          protocole HID (construction des trames, analyse)
  usb.py               transport HID (pywinusb, repli hidapi) + hot-plug
  device.py            session : temps réel, réglages, historique
  store.py             stockage des mesures + statistiques (Leq)
  export.py            export/import CSV, XLSX, XLS
  sim.py               simulateur (fichier de développement sans matériel)
  config.py            préférences persistées
  server.py            API REST + WebSocket (pont UI ↔ appareil)
web/                   interface (HTML/CSS/JS, ECharts)
  index.html app.js style.css vendor/echarts.min.js assets/
tests/                 tests unitaires
scripts/               serve.py, smoke.py, probe_device.py, probe_settings.py
build.spec             configuration PyInstaller
```

Le back-end Python reste indépendant de l'interface : il est utilisable seul
(WebSocket/REST documentés dans `slm/server.py`).

## Licence

MIT — voir [LICENSE](LICENSE). Le protocole USB a été documenté par
rétro-ingénierie d'interopérabilité ; tout le code est une implémentation
originale.

### Composants tiers

| Composant | Licence | Usage |
|---|---|---|
| [ECharts](https://echarts.apache.org/) 5.5.1 (`web/vendor/`) | Apache-2.0 | graphiques, vendu localement pour le hors-ligne |
| FastAPI, uvicorn, Starlette, pydantic, anyio | MIT / BSD | backend (dépendances pip, non vendues) |
| openpyxl (MIT), xlrd (BSD), pywebview (BSD), pywinusb (BSD), pythonnet (MIT), websockets (BSD) | MIT / BSD | dépendances pip, non vendues |

Les sons d'alarme (`web/assets/*.wav`) et l'icône (`web/assets/app.ico`) sont
des créations originales du projet (MIT). Aucun fichier de l'application
d'origine n'est redistribué.
