/* ==========================================================================
   Tests des transports — selection d'interface, repli WebUSB, diagnostic.

   Le point sensible : sur Android, le noyau tient l'interface HID et
   `claimInterface` est refuse. On verifie donc que le transport essaie
   *toutes* les interfaces, qu'il ne laisse jamais l'appareil ouvert apres un
   echec, et qu'il remonte une carte des interfaces exploitable.
   ========================================================================== */

import test from "node:test";
import assert from "node:assert/strict";

import { PID, VID } from "../protocol.js";
import {
  WebHidTransport,
  WebUsbTransport,
  describeConfiguration,
  fail,
  interfaceCandidates,
  isRefusal,
  pickInterface,
} from "../transports.js";

/* --------------------------------------------------------------- fabriques */

function endpoint(number, direction, type = "interrupt") {
  return { endpointNumber: number, direction, type, packetSize: 8 };
}

function alternate(setting, ifaceClass, endpoints) {
  return {
    alternateSetting: setting,
    interfaceClass: ifaceClass,
    interfaceSubclass: 0,
    interfaceProtocol: 0,
    endpoints,
  };
}

function configuration(interfaces) {
  return {
    configurationValue: 1,
    interfaces: interfaces.map((alternates, index) => ({
      interfaceNumber: index,
      alternate: alternates[0],
      alternates,
    })),
  };
}

const HID = (inNum = 0x81, outNum = 0x01) =>
  alternate(0, 0x03, [endpoint(inNum, "in"), endpoint(outNum, "out")]);
const CDC = (inNum = 0x82, outNum = 0x02) =>
  alternate(0, 0x02, [endpoint(inNum, "in"), endpoint(outNum, "out")]);

/** Appareil factice : on choisit quelles interfaces refusent d'etre prises. */
function fakeDevice({ interfaces, refuse = [], refuseAll = false }) {
  const calls = [];
  const device = {
    vendorId: VID,
    productId: PID,
    productName: "Sonomètre de test",
    opened: false,
    configuration: null,
    claimed: null,
    calls,
    async open() {
      this.opened = true;
      calls.push("open");
    },
    async close() {
      // Le noyau rend l'interface a la fermeture.
      this.opened = false;
      this.claimed = null;
      calls.push("close");
    },
    async selectConfiguration(value) {
      calls.push(`selectConfiguration:${value}`);
      this.configuration = configuration(interfaces);
    },
    async claimInterface(number) {
      calls.push(`claim:${number}`);
      if (refuseAll || refuse.includes(number)) {
        const err = new Error("Unable to claim interface");
        err.name = "NetworkError";
        throw err;
      }
      this.claimed = number;
    },
    async releaseInterface(number) {
      calls.push(`release:${number}`);
      if (this.claimed === number) this.claimed = null;
    },
    async selectAlternateInterface(number, setting) {
      calls.push(`alt:${number}.${setting}`);
    },
    // La boucle de lecture s'arrete sur un transfert en echec.
    async transferIn() {
      throw new Error("arrêt de test");
    },
    async transferOut() {
      calls.push("transferOut");
    },
  };
  return device;
}

/* ------------------------------------------------- navigator.usb remplacable */

const original = Object.getOwnPropertyDescriptor(globalThis, "navigator");

function installUsb(usb) {
  Object.defineProperty(globalThis, "navigator", {
    value: { usb },
    configurable: true,
    writable: true,
  });
}

function restoreNavigator() {
  if (original) Object.defineProperty(globalThis, "navigator", original);
  else delete globalThis.navigator;
}

function usbWith(device, { onRequest } = {}) {
  return {
    getDevices: async () => (device ? [device] : []),
    requestDevice: async () => {
      onRequest?.();
      if (!device) {
        const err = new Error("No device selected.");
        err.name = "NotFoundError";
        throw err;
      }
      return device;
    },
  };
}

test.after(restoreNavigator);

/* ------------------------------------------------------------ erreurs typees */

test("fail annote le code et le detail technique", () => {
  const err = fail("claim", "refus", null, "IF 0.0 classe 03/00/00 HID");
  assert.equal(err.code, "claim");
  assert.equal(err.detail, "IF 0.0 classe 03/00/00 HID");
  assert.equal(err.message, "refus");
});

test("isRefusal reconnait un refus d'autorisation, pas une prise d'interface", () => {
  assert.equal(isRefusal(Object.assign(new Error("x"), { name: "NotAllowedError" })), true);
  assert.equal(isRefusal(new Error("Access denied")), true);
  assert.equal(isRefusal(new Error("Unable to claim interface")), false);
});

/* ------------------------------------------------- choix des interfaces */

test("interfaceCandidates prefere une interface HID complete", () => {
  const candidates = interfaceCandidates(configuration([[CDC()], [HID()]]));
  assert.equal(candidates.length, 2);
  assert.equal(candidates[0].isHid, true);
  assert.equal(candidates[0].iface.interfaceNumber, 1);
});

test("interfaceCandidates retombe sur une interface libre si la HID est incomplete", () => {
  const incompleteHid = alternate(0, 0x03, [endpoint(0x81, "in")]); // pas de sortie
  const candidates = interfaceCandidates(configuration([[incompleteHid], [CDC()]]));
  assert.equal(candidates[0].iface.interfaceNumber, 1, "une interface complete passe d'abord");
  assert.equal(candidates[0].isHid, false);
});

test("pickInterface leve une erreur typee quand rien n'est utilisable", () => {
  assert.throws(() => pickInterface(configuration([])), (err) => err.code === "no-endpoint");
  assert.throws(() => pickInterface(null), (err) => err.code === "no-endpoint");
});

test("describeConfiguration dresse la carte des interfaces", () => {
  const map = describeConfiguration(configuration([[HID()], [CDC(0x83, 0x03)]]));
  const lines = map.split("\n");
  assert.equal(lines.length, 2);
  assert.match(lines[0], /^IF 0\.0 classe 0x03\/0x00\/0x00 HID · IN 0x81 interrupt, OUT 0x01 interrupt$/);
  assert.match(lines[1], /^IF 1\.0 classe 0x02\/0x00\/0x00 · IN 0x83 interrupt, OUT 0x03 interrupt$/);
});

/* ------------------------------------------------------- ouverture WebUSB */

test("WebUSB se rabat sur la seconde interface quand le noyau tient la HID", async () => {
  const device = fakeDevice({ interfaces: [[HID()], [CDC()]], refuse: [0] });
  installUsb(usbWith(device));

  const transport = new WebUsbTransport();
  await transport.open();

  assert.equal(device.claimed, 1, "c'est l'interface libre qui est prise");
  assert.match(transport.detail, /interface 1/);
  assert.match(transport.detail, /IN 0x82/);
  assert.deepEqual(
    device.calls.filter((c) => c.startsWith("claim")),
    ["claim:0", "claim:1"],
    "les interfaces sont essayees dans l'ordre"
  );
  await transport.close();
  assert.deepEqual(device.calls.slice(-2), ["release:1", "close"]);
});

test("WebUSB remonte une erreur typee et referme l'appareil si tout est refuse", async () => {
  const device = fakeDevice({ interfaces: [[HID()]], refuseAll: true });
  installUsb(usbWith(device));

  const transport = new WebUsbTransport();
  await assert.rejects(
    () => transport.open(),
    (err) => {
      assert.equal(err.code, "claim");
      assert.match(err.detail, /IF 0\.0 classe 0x03\/0x00\/0x00 HID/);
      return true;
    }
  );
  assert.equal(device.opened, false, "l'appareil ne doit jamais rester ouvert");
  assert.equal(transport.device, null);
  assert.equal(device.calls.filter((c) => c === "close").length, 1);
});

test("WebUSB signale un appareil sans point de terminaison d'entree", async () => {
  const noInput = alternate(0, 0x03, [endpoint(0x01, "out")]);
  const device = fakeDevice({ interfaces: [[noInput]] });
  installUsb(usbWith(device));

  const transport = new WebUsbTransport();
  await assert.rejects(() => transport.open(), (err) => err.code === "no-endpoint");
  assert.equal(device.opened, false);
});

test("WebUSB distingue l'absence d'appareil du refus d'autorisation", async () => {
  installUsb(usbWith(null));
  const absent = new WebUsbTransport();
  await assert.rejects(() => absent.open(), (err) => err.code === "no-device");

  installUsb({
    getDevices: async () => [],
    requestDevice: async () => {
      const err = new Error("Permission denied");
      err.name = "NotAllowedError";
      throw err;
    },
  });
  const denied = new WebUsbTransport();
  await assert.rejects(() => denied.open(), (err) => err.code === "no-permission");
});

test("WebUSB choisit le reglage alternatif non nul quand il le faut", async () => {
  const withAlternates = [
    alternate(0, 0x03, []),
    alternate(1, 0x03, [endpoint(0x81, "in"), endpoint(0x01, "out")]),
  ];
  const device = fakeDevice({ interfaces: [withAlternates] });
  installUsb(usbWith(device));

  const transport = new WebUsbTransport();
  await transport.open();
  assert.equal(device.claimed, 0);
  assert.ok(device.calls.includes("alt:0.1"), "le reglage alternatif 1 est selectionne");
  await transport.close();
});

test("WebHID indisponible leve une erreur no-api", async () => {
  installUsb(usbWith(null));
  assert.equal(WebHidTransport.available(), false);
  await assert.rejects(() => new WebHidTransport().open(), (err) => err.code === "no-api");
});
