/* ==========================================================================
   Contrat entre la coquille Android et la webapp.

   Le shim (android/app/src/main/assets/bridge.js) construit l'objet
   `window.BitanBridge` que le transport « passerelle native » attend. Les deux
   moitiés sont écrites dans deux langages différents : ce fichier vérifie
   qu'elles s'accordent vraiment, en rejouant les appels que Java émettrait.

   Le test est sauté si le dossier ./android n'est pas là (webapp seule).
   ========================================================================== */

import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { BridgeTransport, detectCapabilities, resolveAutoKind } from "../transports.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SHIM = path.resolve(HERE, "..", "..", "android", "app", "src", "main", "assets", "bridge.js");
const HAS_SHIM = existsSync(SHIM);
const SKIP = HAS_SHIM ? false : "coquille Android absente (./android)";
const SOURCE = HAS_SHIM ? readFileSync(SHIM, "utf8") : "";

/** Installe le shim dans un faux `window`, avec un Java simulé. */
function installShim() {
  const native = {
    calls: [],
    open() {
      native.calls.push("open");
    },
    send(json) {
      native.calls.push(["send", json]);
    },
    close() {
      native.calls.push("close");
    },
  };
  const win = { __bitanNative: native };
  inject(win);
  globalThis.window = win;
  return { win, native };
}

const inject = (win) => new Function("window", SOURCE)(win);

/** Le Java simulé rappelle la page, comme le fait evaluateJavascript. */
const fromJava = (win, type, payload) => win.__bitanBridge.event(type, payload);

test.afterEach(() => {
  delete globalThis.window;
});

test("le shim construit un BitanBridge conforme au contrat attendu", { skip: SKIP }, () => {
  const { win } = installShim();
  const bridge = win.BitanBridge;
  assert.ok(bridge, "window.BitanBridge doit exister");
  assert.equal(typeof bridge.open, "function", "open() doit rendre une promesse");
  assert.equal(typeof bridge.send, "function");
  assert.equal(typeof bridge.close, "function");
  assert.ok("onData" in bridge, "la webapp pose onData");
  assert.ok("onError" in bridge, "la webapp pose onError");
  assert.equal(typeof win.__bitanBridge.event, "function", "Java rappelle event()");
});

test("le shim est idempotent : la coquille l'injecte deux fois", { skip: SKIP }, () => {
  const { win } = installShim();
  const first = win.BitanBridge;
  // L'en-tête de la page puis onPageStarted : deux injections pour la même page.
  inject(win);
  inject(win);
  assert.equal(win.BitanBridge, first, "un pont en place ne doit pas être remplacé");
});

test("open() résulte avec le libellé renvoyé par Java", { skip: SKIP }, async () => {
  const { win } = installShim();
  const opening = win.BitanBridge.open();
  fromJava(win, "open", "CH32V10x · USB");
  assert.equal(await opening, "CH32V10x · USB");
});

test("une erreur avant ouverture fait échouer open()", { skip: SKIP }, async () => {
  const { win } = installShim();
  const bridge = win.BitanBridge;
  const opening = bridge.open();
  fromJava(win, "error", "Interface refusée par le système, même en forçant.");
  await assert.rejects(() => opening, /même en forçant/);
});

test("le transport bridge s'appuie sur le shim sans rien changer", { skip: SKIP }, async () => {
  const { win, native } = installShim();
  const transport = new BridgeTransport();
  const reports = [];
  transport.onReport = (bytes) => reports.push(Array.from(bytes));

  const opening = transport.open();
  assert.deepEqual(native.calls, ["open"], "open() doit atteindre le côté Java");
  fromJava(win, "open", "Sonomètre (OTG)");
  await opening;

  assert.equal(transport.label, "Sonomètre (OTG)");
  assert.equal(transport.mode, "framed");
  assert.match(transport.detail, /USB host natif/);

  // Les 8 octets utiles partent en JSON vers Java.
  await transport.write(Uint8Array.from([0x40, 0, 0, 0, 0, 0, 0, 0]));
  assert.deepEqual(native.calls[1], ["send", "[64,0,0,0,0,0,0,0]"]);

  // Un rapport reçu remonte au contrôleur.
  fromJava(win, "data", [0x01, 0x8f, 0, 0, 0, 0, 0, 0]);
  assert.deepEqual(reports, [[1, 143, 0, 0, 0, 0, 0, 0]]);

  await transport.close();
  assert.ok(native.calls.includes("close"), "close() doit atteindre le côté Java");
  assert.equal(transport.bridge, null);
});

test("une erreur après ouverture passe par onError", { skip: SKIP }, async () => {
  const { win } = installShim();
  const transport = new BridgeTransport();
  const errors = [];
  transport.onError = (err) => errors.push(String(err.message));

  const opening = transport.open();
  fromJava(win, "open", "Sonomètre (OTG)");
  await opening;

  fromJava(win, "error", "Écriture USB refusée.");
  assert.deepEqual(errors, ["Écriture USB refusée."]);
});

test("la coquille est choisie d'office quand elle est présente", { skip: SKIP }, () => {
  installShim();
  const caps = detectCapabilities();
  assert.equal(caps.bridge, true, "la passerelle doit être détectée");
  assert.equal(resolveAutoKind(caps), "bridge", "« Automatique » doit préférer la coquille");
});
