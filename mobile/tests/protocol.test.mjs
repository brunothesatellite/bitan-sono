/* ==========================================================================
   Équivalence protocole mobile <-> slm/protocol.py

   Les trames de `fixtures/device.json` ont été réellement lues sur
   l'appareil (tools/capture_fixtures.py) et décodées par le Python. On exige
   ici une égalité stricte, champ par champ : si les deux implémentations
   divergent d'un dixième de dB, ce test casse.

     node --test tests/
   ========================================================================== */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

import * as P from "../protocol.js";

const here = new URL(".", import.meta.url);
const fixture = JSON.parse(readFileSync(fileURLToPath(new URL("fixtures/device.json", here)), "utf8"));

const hex = (text) => Uint8Array.from(Buffer.from(text, "hex"));
const toHex = (bytes) => Buffer.from(bytes).toString("hex");

/** Traduit un enregistrement JS vers les noms de `Measurement.to_dict()`. */
function toPythonShape(record) {
  return {
    no: record.no,
    value: record.value,
    battery_low: record.batteryLow,
    mode: record.mode,
    max_hold: record.maxHold,
    weighting: record.weighting,
    range: record.range,
    time: record.time,
    date: record.date,
    low_effect: record.lowEffect,
    high_effect: record.highEffect,
    source: record.source,
    range_label: record.rangeLabel,
  };
}

test("les trames sortantes sont identiques à celles du Python", () => {
  // _report(cmd) en Python produit [0x00, cmd, 0…] sur 9 octets ; sur le bus
  // seuls les 8 octets utiles circulent (l'ID de rapport 0 ne se transmet pas).
  assert.equal(toHex(P.readPoint()), "b300000000000000");
  assert.equal(toHex(P.handshakeHistory()), "b500000000000000");
  assert.equal(toHex(P.readHistory()), "c400000000000000");
  assert.equal(toHex(P.writeSettings({ mode: "SLOW", weighting: "A", rangeIndex: 0 })), "5600000000000000");
  assert.equal(
    toHex(P.writeSettings({ mode: "FAST", maxHold: true, weighting: "C", rangeIndex: 3 })),
    "5673000000000000"
  );
  assert.equal(hex("b300000000000000").length, P.PAYLOAD_LEN);
});

test("les constantes du protocole n'ont pas dérivé", () => {
  assert.equal(P.CMD_READ_POINT, 0xb3);
  assert.equal(P.CMD_WRITE_SETTINGS, 0x56);
  assert.equal(P.CMD_HANDSHAKE_HISTORY, 0xb5);
  assert.equal(P.CMD_READ_HISTORY, 0xc4);
  assert.equal(P.ACK_SETTINGS, 0xc4);
  assert.equal(P.ACK_HISTORY_HANDSHAKE, 0xef);
  assert.equal(P.ACK_HISTORY_RECORD, 0xfd);
  assert.equal(P.NO_DATA, 0xff);
  assert.equal(P.HID_REPORT_LEN, 9);
  assert.deepEqual(P.RANGES[0], [30, 130]);
  assert.equal(P.RANGE_LABELS[3], "60 ~ 110 dB");
});

test("normalize accepte une charge utile de 8 octets comme une trame de 9", () => {
  const payload = hex("0293400000000000");
  const framed = P.normalize(payload);
  assert.equal(framed.length, 9);
  assert.equal(framed[0], 0);
  assert.equal(toHex(framed.subarray(1)), toHex(payload));
  // Une trame déjà complète passe telle quelle.
  assert.equal(toHex(P.normalize(hex("000293400000000000"))), "000293400000000000");
  assert.throws(() => P.normalize(new Uint8Array(4)));
});

test("les rapports live réels se décodent comme en Python", () => {
  assert.ok(fixture.live.length >= 5, "capture live trop pauvre");
  for (const sample of fixture.live) {
    const fromRaw9 = toPythonShape(P.parseReadPoint(hex(sample.raw9)));
    const fromPayload = toPythonShape(P.parseReadPoint(hex(sample.payload8)));
    assert.deepEqual(fromRaw9, sample.expect, `trame ${sample.raw9}`);
    assert.deepEqual(fromPayload, sample.expect, `charge utile ${sample.payload8}`);
  }
});

test("la pile faible et les drapeaux sont lus au bon endroit", () => {
  // Trame forgée : valeur 65,9 dB, drapeaux pile faible (0x80) + C (0x10) + gamme 2.
  const record = P.parseReadPoint(hex("0293920000000000"));
  assert.equal(record.value, 65.9);
  assert.equal(record.batteryLow, true);
  assert.equal(record.mode, "SLOW");
  assert.equal(record.maxHold, false);
  assert.equal(record.weighting, "C");
  assert.equal(record.range, 2);
  assert.equal(record.rangeLabel, "50 ~ 100 dB");

  // Et la variante FAST + MAX + gamme 0.
  const fast = P.parseReadPoint(hex("0293600000000000"));
  assert.equal(fast.mode, "FAST");
  assert.equal(fast.maxHold, true);
  assert.equal(fast.weighting, "A");
});

test("une valeur signée négative reste négative (int16 big endian)", () => {
  const record = P.parseReadPoint(hex("ffce000000000000"));
  assert.equal(record.value, -5);
});

test("les acquittements sont reconnus dans les deux formes de trame", () => {
  // Forme du Python : 9 octets, ID de rapport inclus (0x00 c4 …).
  assert.equal(P.isSettingsAck(hex("00c400000000000000")), true);
  assert.equal(P.isSettingsAck(hex("000000000000000000")), false);
  assert.equal(P.isHistoryHandshakeAck(hex("00ef00000000000000")), true);
  assert.equal(P.isHistoryHandshakeAck(hex("00c400000000000000")), false);
  // Forme du bus (WebHID / WebUSB) : les 8 octets utiles seulement.
  assert.equal(P.isSettingsAck(hex("c400000000000000")), true);
  assert.equal(P.isSettingsAck(hex("b300000000000000")), false);
  assert.equal(P.isHistoryHandshakeAck(hex("ef00000000000000")), true);
  assert.equal(P.isHistoryHandshakeAck(hex("c400000000000000")), false);
  // Trame vide ou tronquée : jamais d'exception.
  assert.equal(P.isSettingsAck(new Uint8Array(0)), false);
  assert.equal(P.isHistoryHandshakeAck(new Uint8Array(3)), false);
});

test("les groupes 12 bits se décodent au bit près", () => {
  assert.ok(fixture.history.groups.length >= 6, "pas assez de groupes capturés");
  for (const group of fixture.history.groups) {
    assert.deepEqual(P.decodeHistoryGroup(hex(group.raw)), group.expect, `groupe ${group.raw}`);
  }
  assert.throws(() => P.decodeHistoryGroup(new Uint8Array(2)));
});

test("l'en-tête d'historique donne la bonne date et les bons drapeaux", () => {
  // 2026-10-18 10:11:12, BCD, sans drapeau particulier.
  const header = P.parseHistoryHeader(hex("fd00121110181026"));
  assert.equal(header.record.source, "history");
  assert.equal(header.record.rangeLabel, "30 ~ 130 dB");
  assert.equal(header.record.mode, "SLOW");
  assert.equal(header.stamp.getFullYear(), 2026);
  assert.equal(header.stamp.getMonth(), 9);
  assert.equal(header.stamp.getDate(), 18);
  assert.equal(header.stamp.getHours(), 10);
  assert.equal(header.stamp.getMinutes(), 11);
  assert.equal(header.stamp.getSeconds(), 12);
  // Une date impossible (mois 13) retombe sur le 1er janvier 2000, comme le Python.
  const fallback = P.parseHistoryHeader(hex("fd00121110181326"));
  assert.equal(fallback.stamp.getFullYear(), 2000);
  assert.equal(fallback.stamp.getMonth(), 0);
  assert.equal(fallback.stamp.getDate(), 1);
  assert.equal(fallback.record.date, "2000-01-01");
  assert.throws(() => P.parseHistoryHeader(hex("0000000000000000")), /en-tete|en-tête/);
});

test("le flux d'historique complet se relit exactement comme en Python", () => {
  const { payloads, records } = fixture.history;
  const chunks = payloads.map(hex);
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const stream = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    stream.set(chunk, offset);
    offset += chunk.length;
  }
  const decoded = P.iterHistory(stream).map((record, index) => {
    record.no = index + 1;
    return toPythonShape(record);
  });
  assert.equal(decoded.length, records.length);
  assert.deepEqual(decoded, records);
});

test("iterHistory s'arrête proprement sur 0xFF et ignore un flux tronqué", () => {
  const truncated = hex(fixture.history.payloads[0]).subarray(0, 5);
  assert.deepEqual(P.iterHistory(truncated), []);
  assert.deepEqual(P.iterHistory(new Uint8Array(0)), []);
});

test("fromWire traduit une mesure du serveur de bureau", () => {
  const record = P.fromWire({
    no: 12,
    value: 61.24,
    battery_low: true,
    mode: "FAST",
    max_hold: true,
    weighting: "C",
    range: 1,
    time: "10:11:12",
    date: "2026-10-18",
    low_effect: false,
    high_effect: true,
    source: "live",
  });
  assert.equal(record.value, 61.2);
  assert.equal(record.batteryLow, true);
  assert.equal(record.mode, "FAST");
  assert.equal(record.maxHold, true);
  assert.equal(record.weighting, "C");
  assert.equal(record.rangeLabel, "30 ~ 80 dB");
  assert.equal(record.highEffect, true);
  assert.equal(record.source, "live");
});

test("l'arrondi suit la règle de Python (au pair), pas celle de JavaScript", () => {
  // Sans arrondi au pair, Math.round donnerait 47,3 au lieu de 47,2.
  assert.equal(P.decodeHistoryGroup(hex("3a6522"))[0], 46.7);
  const record = P.createRecord({ value: 47.25 });
  assert.equal(record.value, 47.2);
  assert.equal(P.createRecord({ value: -12.25 }).value, -12.2);
  assert.equal(P.createRecord({ value: 2.5 }).value, 2.5);
});
