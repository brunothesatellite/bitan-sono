/* ==========================================================================
   Session appareil (DeviceController) sur un transport factice

   On vérifie ici ce que la v0.2 du bureau avait appris à ses dépens :
     * un seul événement `stopped`, quel que soit le chemin de sortie ;
     * après 5 rapports manquants, l'appareil est rouvert au lieu de figer ;
     * la lecture de l'historique rend exactement les enregistrements
       attendus (on rejoue les trames réellement capturées).
   ========================================================================== */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

import * as P from "../protocol.js";
import { DeviceController } from "../device.js";
import { SimTransport, TIMEOUTS } from "../transports.js";

const here = new URL(".", import.meta.url);
const fixture = JSON.parse(readFileSync(fileURLToPath(new URL("fixtures/device.json", here)), "utf8"));

const hex = (text) => Uint8Array.from(Buffer.from(text, "hex"));
const byte = (cmd) => {
  const out = new Uint8Array(8);
  out[0] = cmd;
  return out;
};
const report = (value) => {
  const out = new Uint8Array(8);
  const raw = Math.round(value * 10) & 0xffff;
  out[0] = (raw >> 8) & 0xff;
  out[1] = raw & 0xff;
  return out;
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function until(predicate, { timeout = 4000, step = 10 } = {}) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (predicate()) return true;
    await sleep(step);
  }
  throw new Error("condition jamais remplie");
}

class FakeTransport {
  mode = "framed";
  isSimulated = false;
  label = "Appareil factice";
  detail = "test";

  constructor({ value = 50, drop = 0, history = [], historyLoop = false } = {}) {
    this.value = value;
    this.drop = drop;
    this.history = history;
    this.historySource = historyLoop ? [...history] : null;
    this.writes = [];
    this.opens = 0;
    this.closes = 0;
    this.onReport = null;
    this.onMeasure = null;
    this.onError = null;
  }

  async open() {
    this.opens += 1;
    // Au deuxième essai, la panne simulée est terminée : c'est ce qui permet
    // de vérifier que la reprise ramène bien des mesures.
    if (this.opens > 1) this.drop = 0;
  }

  async close() {
    this.closes += 1;
  }

  async write(bytes) {
    this.writes.push(Array.from(bytes));
    if (this.drop > 0) {
      this.drop -= 1;
      return;
    }
    this.answer(bytes[0]);
  }

  answer(cmd) {
    if (cmd === P.CMD_READ_POINT) this.onReport(report(this.value));
    else if (cmd === P.CMD_WRITE_SETTINGS) this.onReport(byte(P.ACK_SETTINGS));
    else if (cmd === P.CMD_HANDSHAKE_HISTORY) this.onReport(byte(P.ACK_HISTORY_HANDSHAKE));
    else if (cmd === P.CMD_READ_HISTORY) {
      // Un appareil bavard jusqu'au bout : le journal ne se termine jamais.
      if (!this.history.length && this.historySource) this.history = [...this.historySource];
      this.onReport(this.history.length ? this.history.shift() : byte(P.NO_DATA));
    }
  }
}

function makeController(transport, overrides = {}) {
  const events = { measurements: [], status: [], live: [], errors: [], written: [], device: [] };
  const controller = new DeviceController({
    transport,
    settings: { interval: 0.2, lowAlarm: 30, highAlarm: 45, ...overrides },
    handlers: {
      onMeasurement: (record) => events.measurements.push(record),
      onStatus: (event) => events.status.push(event),
      onLive: (event) => events.live.push(event.state),
      onError: (err) => events.errors.push(err),
      onSettingsWritten: (event) => events.written.push(event),
      onDeviceSettings: (record) => events.device.push(record),
    },
  });
  return { controller, events };
}

test("connect() signale l'ouverture puis l'état connecté", async () => {
  const transport = new FakeTransport();
  const { controller, events } = makeController(transport);
  assert.equal(controller.simulated, false);
  assert.equal(await controller.connect(), true);
  assert.equal(transport.opens, 1);
  assert.equal(events.status.at(-1).state, "connected");
  // Un deuxième appel ne rouvre pas l'appareil.
  assert.equal(await controller.connect(), true);
  assert.equal(transport.opens, 1);
  await controller.close();
  assert.equal(transport.closes, 1);
  assert.equal(events.status.at(-1).state, "disconnected");
});

test("connect() remonte l'erreur d'ouverture sans mentir sur l'état", async () => {
  const transport = new FakeTransport();
  transport.open = async () => {
    throw new Error("claim refusé");
  };
  const { controller, events } = makeController(transport);
  assert.equal(await controller.connect(), false);
  assert.equal(controller.connected, false);
  assert.equal(events.status.at(-1).state, "disconnected");
  assert.match(events.status.at(-1).message, /claim/);
});

test("readOnce() décode une mesure et writeSettings() lit l'acquittement", async () => {
  const transport = new FakeTransport({ value: 62.4 });
  const { controller, events } = makeController(transport);
  await controller.connect();

  const record = await controller.readOnce();
  assert.equal(record.value, 62.4);
  assert.equal(record.mode, "SLOW");

  assert.equal(await controller.writeSettings({ mode: "FAST", maxHold: true, weighting: "C", rangeIndex: 2 }), true);
  assert.equal(events.written.at(-1).ok, true);
  // La trame écrite est bien celle du protocole : 0x56 puis 0x72
  // (FAST | MAX | pondération C | gamme 2).
  assert.equal(transport.writes.at(-1).join(","), "86,114,0,0,0,0,0,0");

  const read = await controller.readSettings();
  assert.equal(read.value, 62.4);
  assert.equal(events.device.length, 1);
});

test("la boucle live émet des mesures, un seul started et un seul stopped", async () => {
  const transport = new FakeTransport({ value: 55 });
  const { controller, events } = makeController(transport, { interval: 0.05 });
  await controller.connect();

  controller.startLive();
  await until(() => events.measurements.length >= 3);
  assert.equal(controller.liveRunning, true);
  controller.stopLive();
  await sleep(50);

  assert.deepEqual(events.live, ["started", "stopped"]);
  assert.equal(controller.liveRunning, false);
  // Les mesures portent l'effet des seuils.
  assert.equal(events.measurements[0].highEffect, true);
  assert.equal(events.measurements[0].lowEffect, false);
  assert.ok(events.measurements[0].value >= 54.9);
});

test("startLive() deux fois de suite ne lance pas deux boucles", async () => {
  const transport = new FakeTransport({ value: 51 });
  const { controller, events } = makeController(transport, { interval: 0.05 });
  await controller.connect();
  controller.startLive();
  controller.startLive();
  await until(() => events.measurements.length >= 2);
  controller.stopLive();
  await sleep(50);
  assert.deepEqual(events.live, ["started", "stopped"]);
});

test("un appareil muet est rouvert puis la mesure reprend", async () => {
  const originalTimeout = TIMEOUTS.request;
  TIMEOUTS.request = 40; // sinon cinq échecs prendraient trois secondes
  try {
    const transport = new FakeTransport({ value: 58, drop: 5 });
    const { controller, events } = makeController(transport, { interval: 0.02 });
    await controller.connect();

    controller.startLive();
    await until(() => transport.opens >= 2 && events.measurements.length >= 1, { timeout: 4000 });

    assert.ok(transport.opens >= 2, "l'appareil n'a pas été rouvert");
    assert.ok(transport.closes >= 1);
    const states = events.status.map((event) => event.state);
    assert.ok(states.includes("reconnecting"), `états vus : ${states.join(", ")}`);
    assert.equal(controller.connected, true);
    // La reprise ne déclenche pas de `stopped` parasite.
    assert.deepEqual(events.live, ["started"]);

    controller.stopLive();
    await sleep(40);
    assert.deepEqual(events.live, ["started", "stopped"]);
  } finally {
    TIMEOUTS.request = originalTimeout;
  }
});

test("un appareil définitivement injoignable arrête la mesure proprement", async () => {
  const originalTimeout = TIMEOUTS.request;
  TIMEOUTS.request = 30;
  try {
    // La première ouverture réussit, les suivantes échouent : c'est le cas
    // « le câble a bougé » après un démarrage réussi.
    const transport = new FakeTransport({ value: 50, drop: 1000 });
    const realOpen = transport.open.bind(transport);
    transport.open = async () => {
      if (transport.opens >= 1) {
        transport.opens += 1;
        throw new Error("absent");
      }
      await realOpen();
    };

    const { controller, events } = makeController(transport, { interval: 0.02 });
    await controller.connect();
    controller.startLive();

    await until(() => events.live.includes("stopped"), { timeout: 8000 });
    assert.equal(controller.liveRunning, false);
    assert.equal(events.live.filter((name) => name === "stopped").length, 1);
    assert.ok(events.errors.length >= 1, "aucune erreur remontée");
    const states = events.status.map((event) => event.state);
    assert.equal(states.at(-1), "disconnected");
  } finally {
    TIMEOUTS.request = originalTimeout;
  }
});

test("downloadHistory() relit le journal réel et rend les 98 enregistrements", async () => {
  const chunks = fixture.history.payloads.map(hex);
  const transport = new FakeTransport({ history: [...chunks] });
  const { controller } = makeController(transport);
  await controller.connect();

  const progress = [];
  const records = await controller.downloadHistory({ onProgress: (event) => progress.push(event.bytes) });

  assert.equal(records.length, fixture.history.records.length);
  assert.equal(records[0].value, fixture.history.records[0].value);
  assert.equal(records[0].no, 1);
  assert.equal(records.at(-1).no, 98);
  assert.equal(records.at(-1).value, fixture.history.records.at(-1).value);
  assert.ok(progress.length > 0);
  // La trame de poignée de main a bien été envoyée avant les lectures.
  const commands = transport.writes.map((frame) => frame[0]);
  assert.equal(commands[0], P.CMD_HANDSHAKE_HISTORY);
  assert.ok(commands.slice(1).every((cmd) => cmd === P.CMD_READ_HISTORY));
  assert.equal(commands.at(-1), P.CMD_READ_HISTORY);
});

test("downloadHistory() s'arrête meme si l'appareil ne repond jamais", async () => {
  const originalTimeout = TIMEOUTS.request;
  TIMEOUTS.request = 20;
  try {
    const transport = new FakeTransport();
    transport.answer = () => {}; // silence radio
    const { controller } = makeController(transport);
    await controller.connect();
    const records = await controller.downloadHistory();
    assert.deepEqual(records, []);
  } finally {
    TIMEOUTS.request = originalTimeout;
  }
});

test("un journal sans marqueur de fin s'arrête au plafond d'octets", async () => {
  const chunks = fixture.history.payloads.map(hex).filter((chunk) => chunk[0] !== P.NO_DATA);
  // L'appareil répond toujours quelque chose : sans garde-fou, la boucle
  // tournerait jusqu'au bout des 31 000 enregistrements.
  const transport = new FakeTransport({ history: chunks, historyLoop: true });
  const { controller } = makeController(transport);
  await controller.connect();

  const records = await controller.downloadHistory({ maxRecords: 30 });
  // 1 poignée de main + ceil((30 * 3 + 16) / 8) lectures.
  assert.equal(transport.writes.length, 1 + Math.ceil((30 * 3 + 16) / 8));
  assert.ok(records.length > 0 && records.length <= 98);
  assert.equal(transport.writes[0][0], P.CMD_HANDSHAKE_HISTORY);
});

/* -- simulateur ---------------------------------------------------------- */

test("le simulateur déroule un journal complet et des mesures plausibles", async () => {
  // Régression : `buildSimHistory(this._rng)` perdait `this` et le simulateur
  // levait « Cannot read properties of undefined (reading '_seed') ».
  const transport = new SimTransport({ profile: "family" });
  const { controller, events } = makeController(transport);
  assert.equal(await controller.connect(), true);

  const records = await controller.downloadHistory();
  assert.equal(records.length, 98);
  assert.equal(records[0].no, 1);
  assert.equal(records.at(-1).no, 98);
  for (const record of records) {
    assert.ok(record.value >= 0 && record.value <= 130, `valeur hors bornes : ${record.value}`);
    assert.match(record.time, /^\d{2}:\d{2}:\d{2}$/);
    assert.match(record.date, /^\d{4}-\d{2}-\d{2}$/);
  }
  // Le journal se consomme : une seconde lecture rend ce que le simulateur a
  // encore, jamais les mêmes trames.
  assert.ok(events.errors.length === 0, `erreurs inattendues : ${events.errors.map(String)}`);

  controller.startLive();
  await until(() => events.measurements.length >= 3);
  controller.stopLive();
  const values = events.measurements.map((r) => r.value);
  assert.ok(values.every((v) => v >= 0 && v <= 130));
  assert.ok(new Set(values).size >= 2, "le simulateur doit produire des valeurs variées");
  assert.equal(events.live.filter((s) => s === "started").length, 1);
  assert.equal(events.live.filter((s) => s === "stopped").length, 1);
});

test("le simulateur honore setProfile() et les pannes injectées", async () => {
  const transport = new SimTransport({ profile: "calm" });
  const { controller, events } = makeController(transport);
  await controller.connect();

  transport.setProfile("storm");
  assert.equal(transport.profile, "storm");
  transport.setProfile("inexistant");
  assert.equal(transport.profile, "storm", "un profil inconnu ne change rien");

  // Panne simulée : cinq rapports manquants déclenchent la reprise.
  transport.dropNext = 5;
  controller.startLive();
  await until(() => events.status.some((s) => s.state === "reconnecting"), { timeout: 10000 });
  await until(() => events.measurements.length > 0, { timeout: 10000 });
  controller.stopLive();
  assert.equal(events.live.filter((s) => s === "started").length, 1);
  assert.equal(events.live.filter((s) => s === "stopped").length, 1);
});
