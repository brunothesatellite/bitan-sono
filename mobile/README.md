# bitan·sono — version web / mobile

Version **webapp** de *bitan·sono*, pensée pour un téléphone Android tenu en
**portrait**, avec le sonomètre **Bitan / SKU001** branché en **USB OTG**.

C'est la même mesure, le même protocole et les mêmes formules que
l'application de bureau ; seule l'interface change : quatre onglets
(**Direct**, **Maison**, **Mémoire**, **Réglages**), des graphes dessinés en
canvas, et une vue « météo de la maison ».

Rien n'est téléchargé depuis Internet : les polices sont celles du système,
les icônes et les sons sont générés et fournis avec le projet.

---

## 1. Ce que ça fait

| Écran | Contenu |
| --- | --- |
| **Direct** | valeur instantanée en gros, jauge 30–130 dB avec repères d'alarme, min/moyenne/max/Leq de la session, courbe d'évolution, dernières mesures |
| **Maison** | météo du moment (Soleil / Éclaircies / Nuageux / Orage), baromètre sonore, tendance, score cocon, mode sieste, L10/L50/L90, temps passé en zone rouge, conseil du moment |
| **Mémoire** | lecture du journal du sonomètre (jusqu'à 31 000 enregistrements), export CSV réimportable par l'application de bureau |
| **Réglages** | liaison, diagnostic, réglages de l'appareil (SLOW/FAST, pondération A/C, gamme, MAX), alarmes, zones de la Maison (3 seuils, 55/65/75 dB par défaut), thème, langue, écran allumé, aide OTG |

L'alarme sonore reprend la règle de la version bureau : il faut **3 mesures
consécutives** hors seuil pour déclencher, il faut revenir à **±2 dB** du seuil
pour réarmer, et le rappel sonne 2 s puis toutes les 10 s. Les côtés « trop
fort » et « trop faible » sont indépendants.

---

## 2. Essai sur un ordinateur

Depuis ce dossier :

```sh
python serve.py                 # http://<ip-locale>:8080/
python serve.py --port 8123     # autre port
```

`localhost` est considéré comme un **contexte sécurisé** par les navigateurs :
WebHID et WebUSB fonctionnent donc dans Chrome ou Edge de bureau, sans HTTPS.

Ouvrez la page, allez dans **Réglages → Liaison**, choisissez `Automatique`,
puis **Connecter**. Le panneau **Diagnostic** indique ce que votre navigateur
autorise. Sans appareil, choisissez **Démo (sans appareil)** : quatre ambiances
sont proposées et toute l'interface reste utilisable.

---

## 3. Déploiement sur un serveur

Copiez à la racine web **les seuls fichiers nécessaires** :

```
index.html   style.css   manifest.webmanifest   sw.js
app.js  analysis.js  alarm.js  device.js  i18n.js  protocol.js  transports.js
assets/      (icônes + sons d'alarme)
```

Les dossiers `tests/`, `tools/` et `docs/` ne servent qu'au développement et
n'ont rien à faire en ligne.

### HTTPS obligatoire

**C'est la contrainte structurante.** WebUSB et WebHID n'existent que dans un
*contexte sécurisé* : `https://`, ou `http://localhost`. Sur un téléphone, une
adresse `http://192.168.x.x` **ne donnera aucun accès à l'USB** — l'onglet
d'application s'affichera, mais « Connecter » échouera, et le bandeau
d'avertissement apparaîtra en haut de la page.

Trois solutions :

**a. Un reverse-proxy TLS** (recommandé en production). Exemple Caddy, qui
obtient et renouvelle le certificat tout seul :

```
sono.example.org {
    root * /var/www/bitan-sono
    file_server
}
```

Exemple nginx :

```nginx
server {
    listen 443 ssl http2;
    server_name sono.example.org;
    root /var/www/bitan-sono;
    index index.html;
    ssl_certificate     /etc/letsencrypt/live/sono.example.org/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/sono.example.org/privkey.pem;
}
```

**b. Un certificat maison** avec `mkcert`, pratique en réseau local :

```sh
mkcert -install
mkcert 192.168.1.20
python serve.py --port 8443 --tls --cert 192.168.1.20.pem --key 192.168.1.20-key.pem
```

Il faut ensuite installer l'autorité racine de `mkcert` sur le téléphone, sinon
le navigateur refusera le certificat.

**c. Un essai rapide en HTTP**, sans certificat : dans Chrome Android, ouvrez
`chrome://flags/#unsafely-treat-insecure-origin-as-secure`, ajoutez
`http://192.168.1.20:8080`, redémarrez le navigateur. À réserver au dépannage.

### Service worker

`sw.js` met la page en cache (réseau d'abord, cache en secours) : l'interface
se rouvre même sans réseau. Il n'a besoin d'aucune configuration, mais exige
lui aussi HTTPS pour être enregistré.

---

## 4. Brancher le sonomètre en OTG — l'état réel

C'est le point sur lequel il faut être honnête, parce que la réponse dépend du
navigateur, pas de cette application.

**Le sonomètre se présente comme un périphérique HID** (classe USB `0x03`,
`CH32V10x`, VID `64BD` / PID `74E3`). L'application propose donc trois chemins
d'accès direct, plus un relais :

| Liaison | Marche sur ordinateur | Marche sur Android | Remarque |
| --- | --- | --- | --- |
| `WebHID` | oui | **non** | API absente de Chrome pour Android à ce jour |
| `WebUSB` | oui | **parfois** | dépend de qui détient l'interface HID |
| `Passerelle native` | — | **oui** | l'APK de `../android`, qui force le noyau à lâcher l'interface |
| `Serveur distant` (relais) | oui | **oui, toujours** | le sonomètre reste branché au PC |
| `Démo` | oui | oui | aucune mesure réelle |

### Pourquoi WebHID ne suffit pas

WebHID est exactement l'API prévue pour ce genre d'appareil, et c'est la voie la
plus propre : aucune gestion d'interfaces, aucun risque de se battre avec le
noyau. Mais **Chrome pour Android ne l'implémente pas encore** (le support est
annoncé pour une version ultérieure). Sur Android, la page doit donc passer par
WebUSB.

### Pourquoi WebUSB peut refuser

Sous Linux et Android, l'interface HID est très souvent **déjà réclamée par le
pilote `usbhid` du noyau**. Un programme utilisateur ne peut pas la lui
arracher sans les privilèges root, et WebUSB ne peut pas demander au noyau de
libérer le pilote (l'ioctl `USBDEVFS_DISCONNECT_CLAIM` n'est pas exposé par
l'API). `adb` ne permet pas de contourner cela sur un téléphone non rooté.

Dans ce cas `claimInterface()` échoue, et l'application l'annonce sans
détour :

> Le téléphone refuse de prêter l'appareil au navigateur (interface HID déjà
> prise par le système). Utilisez la liaison « Serveur distant ».

Et, juste en dessous, le diagnostic affiche la **carte des interfaces** de
l'appareil, telle qu'elle a été lue :

```
IF 0.0 classe 0x03/0x00/0x00 HID · IN 0x81 interrupt, OUT 0x01 interrupt
```

C'est la pièce à recopier si vous ouvrez un rapport : elle dit exactement ce
que l'appareil expose. L'application essaie **toutes** les interfaces
utilisables, dans l'ordre — une interface HID complète d'abord, puis toute
autre interface libre — et ne se rabat sur le message d'échec que si aucune
n'a pu être prise.

### « Pourtant, une autre webapp USB marche sur mon téléphone »

C'est le cas, très déroutant, de la *ToneX Pedal Controller* fournie à part :
elle se connecte au pédalier IK Multimedia en USB OTG, sur Android, avec la
même API WebUSB. La différence n'est pas dans le code, elle est dans la
**classe USB du matériel** :

| | Pédalier ToneX | Sonomètre Bitan |
| --- | --- | --- |
| Classes annoncées | `0x02` (CDC) et `0x0A` (CDC Data) | `0x03` (HID) |
| Pilote du noyau qui s'en saisit | aucun sur l'interface de données | **`usbhid`** |
| `claimInterface()` | passe | refusé |

Le noyau Android n'attache aucun pilote aux interfaces CDC, qui restent donc
libres ; il attache `usbhid` aux interfaces HID. Même API, même geste, résultat
opposé : c'est le prix d'un appareil de classe HID.

La « bonne nouvelle » est mince mais réelle : certains appareils et certaines
versions d'Android laissent l'interface libre, et WebUSB fonctionne alors très
bien. Ça vaut la peine d'essayer, ça ne coûte que dix secondes, et le
diagnostic vous dira immédiatement où vous en êtes.

### La seule voie OTG fiable : l'APK de `../android`

Un navigateur ne peut pas déloger un pilote du noyau. Java, si : l'API Android
`claimInterface(iface, true)` est documentée « disconnect kernel driver if
necessary ». C'est exactement ce que fait l'application compagnon du dossier
`../android`, qui embarque cette webapp et ajoute l'accès USB natif. Voir son
`README.md` ; le transport correspondant est déjà celui qui s'appelle
**Passerelle native** ici.

### Le mode relais, qui marche partout

C'est la solution de repli garantie, et elle ne demande aucun privilège :

1. sur un ordinateur (Windows, Linux, Mac) du même réseau, lancez
   l'application de bureau `bitan-sono`, qui expose déjà un serveur WebSocket ;
2. branchez le sonomètre **sur l'ordinateur** ;
3. sur le téléphone, **Réglages → Liaison → Serveur distant**, saisissez
   l'adresse (`192.168.1.20:8765` par exemple) et appuyez sur **Connecter**.

Le téléphone affiche alors exactement la même chose qu'en OTG : la mesure est
transmise en direct, et les réglages passent aussi par le relais. C'est la
configuration conseillée pour une utilisation quotidienne : le téléphone sert
d'écran, l'ordinateur de pont USB.

Le relais n'a **pas besoin de HTTPS** : c'est justement son avantage. Une page
ouverte en `http://192.168.1.20:8080` peut très bien parler à un serveur
WebSocket `ws://192.168.1.20:8765`.

En revanche, si la page est servie en **HTTPS**, le navigateur refuse un
WebSocket en clair (contenu mixte) : il faut alors mettre le serveur de bureau
derrière un proxy TLS et saisir une adresse en **`wss://`**. Le champ
« Serveur distant » accepte les deux formes, avec ou sans chemin.

Si le serveur de bureau tourne sur la même machine que le serveur web, c'est
le proxy qui expose les deux : le site en HTTPS, et `/ws` en `wss://` vers le
port `8765`.

### Procédure OTG, pas à pas

1. adaptateur **USB-C OTG** (ou un câble OTG) entre le téléphone et le
   sonomètre ;
2. page ouverte en **HTTPS** ;
3. **Réglages → Diagnostic** : les lignes doivent indiquer
   `Contexte sécurisé : oui` et `WebUSB disponible : oui` ;
4. **Liaison → WebUSB (OTG)**, puis **Connecter** ;
5. le navigateur demande l'autorisation d'accéder à l'appareil : acceptez en
   choisissant `CH32V10x` ;
6. onglet **Direct**, puis **Démarrer**.

Un seul programme peut parler au sonomètre à la fois : fermez l'application de
bureau avant de le brancher sur le téléphone.

---

## 5. Tests

### Tests unitaires (Node ≥ 20)

```sh
npm test          # 68 tests
```

Ils couvrent le protocole (comparé trame par trame aux relevés d'un vrai
appareil), les formules de la vue Maison, la machine d'état des alarmes, la
session appareil (reprise après panne, journal, arrêt propre), les transports
(choix d'interface, repli WebUSB quand le noyau tient la HID, fermeture
garantie après un échec) et le contrat avec la coquille Android
(`tests/bridge.test.mjs`, sauté si le dossier `../android` est absent). Les
données de référence sont dans `tests/fixtures/device.json` : 12 rapports live,
21 trames d'historique, 98 enregistrements réels.

### Test d'interface (Playwright)

Il ouvre la page dans une fenêtre de téléphone (412 × 915, portrait), parcourt
les quatre onglets, se connecte en démo **depuis l'interface**, vérifie que la
valeur bouge, que les seuils déclenchent, que la météo et la sieste répondent,
que le journal se lit et s'exporte, que le thème et la langue survivent au
rechargement, qu'aucun libellé brut ne s'affiche (avant **et** après
connexion), qu'un refus d'interface produit bien la carte des interfaces, et
qu'aucune erreur JavaScript n'apparaît. Il en profite pour enregistrer les
captures de `docs/`.

```sh
# 1. le serveur de développement doit tourner
python serve.py --port 8123 --host 127.0.0.1

# 2. la bibliothèque Playwright doit être joignable
npm i -D playwright                       # ou : set BITAN_PLAYWRIGHT=C:\...\playwright
node --test tests/ui.spec.cjs

# 3. pour viser une autre adresse
set BITAN_UI_URL=https://sono.example.org/
```

### Vérifier le mode relais de bout en bout

Le test correspondant est **sauté** si aucun serveur de bureau n'est joignable.
Pour l'exécuter, lancez le serveur de bureau `bitan-sono` (ou, sans matériel,
`python scripts/serve.py --port 8765 --device sim` depuis la racine du projet)
puis :

```sh
set BITAN_RELAY_URL=http://192.168.1.20:8765/
node --test tests/ui.spec.cjs
```

Il remplace la démo par le relais dans l'interface, attend que trois mesures
arrivent du serveur, vérifie que la valeur affichée est plausible, puis
déconnecte.

Le navigateur utilisé est `msedge` (canal système, pas de téléchargement de
Chromium). Adaptez `channel` dans `tests/ui.spec.cjs` si vous préférez Firefox
ou Chromium.

### Régénérer les données de référence

```sh
python tools/capture_fixtures.py
```

**Fermez tout autre programme** qui pourrait tenir le sonomètre (application de
bureau comprise), sinon l'ouverture échoue.

### Régénérer les icônes

```sh
python tools/make_icons.py
```

Les PNG sont écrits en Python pur (zlib + struct), sans Pillow.

---

## 6. Structure

```
index.html            les quatre onglets, tout le squelette de l'interface
style.css             thème sombre par défaut, thème clair, mise en page portrait
app.js                contrôleur de l'interface : câblage, rendu, i18n, réglages
protocol.js           le protocole HID (lecture d'un point, historique, réglages)
device.js             la session appareil : boucle de mesure, reprise, journal
transports.js         WebHID, WebUSB, relais WebSocket, passerelle native, simulation
analysis.js           zones et météo, statistiques, tendance, score cocon, sieste, dosimètre
alarm.js              machine d'état des alarmes (pure, testable)
i18n.js               textes français et anglais
sw.js                 cache hors ligne
serve.py              serveur de développement (HTTP ou HTTPS)
tests/                tests unitaires, test d'interface, relevés de référence
tools/                capture des relevés, génération des icônes
assets/               icônes (SVG + PNG) et sons d'alarme
docs/                 captures d'écran produites par le test d'interface
```

La coquille Android qui embarque cette webapp et donne l'accès USB natif vit
dans le dossier voisin `../android/`.

---

## 7. Notes de protocole

* Sur le bus, seuls les **8 octets utiles** circulent : l'identifiant de rapport
  `0` n'est pas transmis. En WebHID on envoie donc `sendReport(0, 8 octets)` et
  on écoute `inputreport` ; en WebUSB, `transferOut` / `transferIn` sur
  l'endpoint d'interruption.
* L'arrondi reproduit celui de Python (arrondi **au pair**, et non celui de
  JavaScript) : les valeurs d'historique sont des multiples de `0,05`, donc les
  demis sont exacts.
* L'historique s'arrête au premier `0xFF` ; les 12 octets de bourrage final sont
  ignorés.
* Les dates sont validées comme `datetime()` de Python : `pythonDate()` refuse
  une date impossible là où l'objet `Date` de JavaScript déborderait
  silencieusement.

---

## 8. Vie privée

Aucune donnée ne quitte l'appareil. Pas de compte, pas de statistiques
d'envoi, aucun appel réseau en dehors du relais que vous configurez
explicitement. Les préférences sont stockées dans le `localStorage` du
navigateur ; le dosimètre ne conserve qu'un compteur de secondes par jour.

---

## 9. Licence

MIT, comme le reste du projet. Le code est original ; aucun fichier du logiciel
propriétaire d'origine n'est redistribué. Le protocole a été rétro-conçu par
observation du matériel, à des fins d'interopérabilité.
