# bitan·sono — coquille Android (APK à installer soi-même)

Application Android qui embarque la webapp de `../mobile` **et** donne au
téléphone un vrai accès USB au sonomètre, ce que le navigateur ne peut pas
faire.

Aucune dépendance : ni AndroidX, ni Material, ni Kotlin. Juste le framework
Android. L'APK pèse 0,7 Mo.

---

## 1. Pourquoi cette APK existe

Sur le téléphone, la webapp se heurte à un mur :

| | Ce qui se passe |
| --- | --- |
| WebHID | absent de Chrome/Edge pour Android (prévu bien plus tard) |
| WebUSB | `claimInterface()` **refusé** : le noyau tient déjà l'interface |

Le sonomètre Bitan/SKU001 déclare **une seule interface USB, de classe HID
(`0x03`)**. Sous Android, le pilote `usbhid` du noyau s'en saisit, et l'API
WebUSB n'a pas d'option pour le lui arracher. C'est vérifiable côté Windows :
le nœud PnP est `USB\VID_64BD&PID_74E3&REV_0100`, sans suffixe `MI_`, et ses
identifiants de compatibilité se limitent à `Class_03`.

En Java, en revanche, l'API existe :

```java
connection.claimInterface(iface, /* force = */ true);
```

`true` signifie, mot pour mot dans la documentation Android, *« disconnect
kernel driver if necessary »*. Le noyau lâche l'interface, l'application la
prend. C'est toute la raison d'être de cette APK : **c'est le seul chemin OTG
direct qui reste**.

---

## 2. Comment ça marche

```
MainActivity ── charge https://appassets.local/index.html
   │                    │
   │                    ├─ les fichiers sont servis depuis les assets de
   │                    │  l'APK, interceptés en mémoire (shouldInterceptRequest)
   │                    │  → origine https : modules ES, localStorage et
   │                    │    contexte sécurisé fonctionnent comme en ligne
   │                    │
   │                    └─ un <script src="/bridge.js"> est injecté dans <head>
   │
   ├─ addJavascriptInterface(UsbBridge, "__bitanNative")
   │
   └─ UsbBridge ── UsbManager : permission, claimInterface(iface, true),
                     fil de lecture (interrupt IN) + fil d'écriture (interrupt OUT)
```

`bridge.js` ne fait qu'une chose : traduire. Java ne peut pas rendre de
promesse, alors le shim construit l'objet `window.BitanBridge` attendu par le
transport « passerelle native » déjà présent dans `mobile/transports.js` :

```js
window.BitanBridge = {
  open(): Promise<string>,        // Java rappelle event('open', libellé)
  send(bytes: number[]): void,
  close(): void,
  onData(bytes: number[]): void,  // posée par la webapp
  onError(message: string): void, // posée par la webapp
}
```

Comme `detectCapabilities().bridge` devient vrai, le mode **« Automatique »**
choisit la passerelle d'office : il n'y a rien à configurer, on appuie sur
**Connecter**.

La webapp n'est **pas** recopiée dans le dépôt : la tâche Gradle `copyWebapp`
la reprend de `../mobile` à chaque compilation. Corriger la webapp puis
reconstruire suffit — les deux ne peuvent pas diverger.

### Le service worker est désactivé dans la coquille

`app.js` n'enregistre pas `sw.js` quand la passerelle est présente. Ce n'est
pas un oubli : un service worker qui interroge le réseau pour des URL que seul
le WebView sait servir ne mettrait rien en cache, puis répondrait une erreur à
chaque rechargement. La coquille est hors ligne par construction, elle n'a pas
besoin de ce cache.

---

## 3. Compiler

Il faut un JDK et le SDK Android. Sur cette machine tout est déjà là :

- JDK : `C:\Program Files\Android\Android Studio\jbr`
- SDK : `%LOCALAPPDATA%\Android\Sdk` (déjà indiqué dans `local.properties`)

```bat
set JAVA_HOME=C:\Program Files\Android\Android Studio\jbr
cd android
gradlew.bat assembleRelease --offline
```

L'APK sort dans `app\build\outputs\apk\release\app-release.apk`, et une copie
commode est déposée à la racine du dossier sous `bitan-sono-<version>.apk`.

`--offline` n'est pas obligatoire mais accélère : le plugin Android et Gradle
sont déjà dans le cache de la machine. Sans ce drapeau, Gradle vérifie les
dépôts distants avant de compiler.

Pour une version de mise au point, plus verbeuse mais non signée pour la
distribution :

```bat
gradlew.bat assembleDebug
```

### La clé de signature

`keystore/bitan-sono.jks` est créée localement et **n'est pas partagée** (elle
est dans `.gitignore`). Pour en fabriquer une autre :

```bat
"%JAVA_HOME%\bin\keytool.exe" -genkeypair -v ^
  -keystore keystore\bitan-sono.jks -storetype PKCS12 ^
  -alias bitan-sono -keyalg RSA -keysize 2048 -validity 10950 ^
  -storepass bitan-sono -keypass bitan-sono ^
  -dname "CN=bitan-sono, OU=perso, O=bitan-sono, C=FR"
```

Si vous changez de clé, désinstallez l'ancienne application avant d'installer
la nouvelle : Android refuse une mise à jour signée par une autre clé.

---

## 4. Installer sur le téléphone

L'APK n'est pas sur le Play Store, et n'a pas besoin de l'être.

1. copiez `bitan-sono-<version>.apk` sur le téléphone (câble, ou en le déposant sur
   votre serveur web et en le téléchargeant depuis le navigateur) ;
2. ouvrez le fichier depuis le gestionnaire de fichiers ;
3. Android demande d'autoriser l'installation depuis cette source : acceptez
   pour l'application concernée, puis installez ;
4. lancez **bitan·sono**.

Avec un câble et `adb`, plus direct :

```bat
adb install -r bitan-sono-<version>.apk
```

---

## 5. Utiliser le sonomètre

1. branchez l'adaptateur **USB-C OTG** puis le sonomètre ;
2. Android propose **bitan·sono** dans la liste des applications (filtre
   `USB_DEVICE_ATTACHED`, VID `0x64BD` / PID `0x74E3`) — ou lancez-la ;
3. l'application demande l'autorisation d'accéder à l'appareil : acceptez ;
4. **Réglages → Liaison → Automatique** (c'est le défaut), puis **Connecter** ;
5. onglet **Direct**, puis **Démarrer**.

Le diagnostic doit afficher `Passerelle native détectée : oui` et
`Liaison utilisée : CH32V10x · USB`.

Un seul programme peut parler au sonomètre à la fois : débranchez-le de
l'ordinateur avant de le brancher sur le téléphone.

### Si l'application est en double

`launchMode="singleTask"` : brancher l'appareil alors que l'application tourne
déjà la ramène au premier plan au lieu d'en ouvrir une seconde.

---

## 6. Tests

Le contrat entre `bridge.js` et le transport de la webapp est vérifié
automatiquement, sans téléphone :

```sh
cd ../mobile
node --test tests/bridge.test.mjs
```

Sept tests rejouent les appels que Java émettrait — `event('open')`,
`event('data')`, `event('error')` — et contrôlent que le transport se branche,
écrit, remonte les rapports et signale les erreurs. Ils vérifient aussi que le
shim est **idempotent**, parce que la coquille l'injecte deux fois (dans
l'en-tête de la page, puis à `onPageStarted` en filet de sécurité).

Ce qui **ne** peut pas être testé ici : le transfert USB réel, qui exige le
sonomètre et un téléphone.

---

## 7. Si ça refuse encore

Le message `Interface refusée par le système, même en forçant.` signifie que
même `claimInterface(iface, true)` n'a pas suffi — cas rare mais réel sur
certains noyaux Android verrouillés.

Le repli reste disponible et fonctionne toujours : **Réglages → Liaison →
Serveur distant**, avec le sonomètre branché sur l'ordinateur qui fait tourner
`bitan-sono`. Voir `../mobile/README.md`, section 4.

---

## 8. Structure

```
settings.gradle          plugin Android 9.4.1, dépôts
build.gradle             racine (tout est dans :app)
gradle.properties        réglages Gradle
local.properties         chemin du SDK sur cette machine (non partagé)
gradlew / gradlew.bat    wrapper Gradle 9.8.1
app/build.gradle         module : compileSdk 35, minSdk 24, signature, copyWebapp
app/src/main/
  AndroidManifest.xml    USB host, lanceur, filtre d'attachement
  assets/bridge.js       le shim JavaScript
  java/fr/bitansono/app/
    MainActivity.java    WebView, origine https virtuelle, injection du shim
    UsbBridge.java       USB host : permission, claim forcé, échange de trames
  res/                   libellé, icônes, filtre VID/PID
keystore/                clé de signature locale (non partagée)
```

---

## 9. Licence

MIT, comme le reste du projet. Le protocole a été rétro-conçu par observation
du matériel, à des fins d'interopérabilité.
