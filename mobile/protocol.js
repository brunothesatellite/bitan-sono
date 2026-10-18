/* ==========================================================================
   bitan·sono mobile — protocole HID (module ES, sans DOM)
   --------------------------------------------------------------------------
   Transcription fidele de slm/protocol.py. Toute modification doit rester
   alignee avec le Python : tests/protocol.test.mjs compare les deux
   implementations sur des trames reellement capturees sur l'appareil.

   Trames 9 octets = 1 octet d'ID de rapport + 8 octets utiles.

     entree : [id, valeur_hi, valeur_lo, drapeaux, 0, 0, 0, 0, 0]
     sortie : [id, commande, argument, 0, 0, 0, 0, 0, 0]

   Les transports web (WebHID, WebUSB) ne manipulent que les 8 octets utiles :
   l'ID de rapport 0 n'est jamais transmis sur le bus. Les fonctions de ce
   module parlent donc en "charge utile" (8 octets) et `normalize()` accepte
   aussi une trame de 9 octets pour rester compatible avec les captures.
   ========================================================================== */

export const CMD_READ_POINT = 0xb3; // 179
export const CMD_WRITE_SETTINGS = 0x56; // 86
export const CMD_HANDSHAKE_HISTORY = 0xb5; // 181
export const CMD_READ_HISTORY = 0xc4; // 196

export const ACK_READ_POINT = 0xb3;
export const ACK_SETTINGS = 0xc4;
export const ACK_HISTORY_HANDSHAKE = 0xef;
export const ACK_HISTORY_RECORD = 0xfd;
export const NO_DATA = 0xff;

export const REPORT_ID = 0x00;
export const HID_REPORT_LEN = 9; // 1 ID + 8 charge utile
export const PAYLOAD_LEN = 8;

export const VID = 0x64bd;
export const PID = 0x74e3;
export const USAGE_PAGE = 0xff00;
export const PRODUCT_NAME = "CH32V10x";

/* Drapeaux d'etat (octet 3 d'une mesure live). */
export const FLAG_BATTERY_LOW = 0x80;
export const FLAG_FAST = 0x40;
export const FLAG_MAX = 0x20;
export const FLAG_WEIGHTING_C = 0x10;

export const RANGES = {
  0: [30, 130],
  1: [30, 80],
  2: [50, 100],
  3: [60, 110],
  4: [80, 130],
};

export const RANGE_LABELS = [
  "30 ~ 130 dB",
  "30 ~ 80 dB",
  "50 ~ 100 dB",
  "60 ~ 110 dB",
  "80 ~ 130 dB",
];

export const MODES = ["SLOW", "FAST"];
export const WEIGHTINGS = ["A", "C"];

/* --------------------------------------------------------------------------
   Constructeurs de trames (charge utile de 8 octets)
   -------------------------------------------------------------------------- */

function payload(cmd, flag = null) {
  const out = new Uint8Array(PAYLOAD_LEN);
  out[0] = cmd;
  if (flag !== null) out[1] = flag & 0xff;
  return out;
}

/** Demande une mesure live (0xB3). */
export function readPoint() {
  return payload(CMD_READ_POINT);
}

/** Poignee de main avant de vider le journal (0xB5). */
export function handshakeHistory() {
  return payload(CMD_HANDSHAKE_HISTORY);
}

/** Demande l'enregistrement d'historique suivant (0xC4). */
export function readHistory() {
  return payload(CMD_READ_HISTORY);
}

/** Octet de configuration de l'appareil. */
export function settingsFlag({ mode = "SLOW", maxHold = false, weighting = "A", rangeIndex = 0 } = {}) {
  let flag = 0;
  if (String(mode).toUpperCase() === "FAST") flag |= FLAG_FAST;
  if (maxHold) flag |= FLAG_MAX;
  if (String(weighting).toUpperCase() === "C") flag |= FLAG_WEIGHTING_C;
  flag |= rangeIndex & 0x0f;
  return flag;
}

/** Ecrit la configuration de l'appareil (0x56). */
export function writeSettings(options = {}) {
  return payload(CMD_WRITE_SETTINGS, settingsFlag(options));
}

/* --------------------------------------------------------------------------
   Utilitaires
   -------------------------------------------------------------------------- */

/** Ramene une trame a 9 octets (ID de rapport inclus). */
export function normalize(raw) {
  const bytes = raw instanceof Uint8Array ? raw : new Uint8Array(raw);
  if (bytes.length >= HID_REPORT_LEN) return bytes.subarray(0, HID_REPORT_LEN);
  if (bytes.length === HID_REPORT_LEN - 1) {
    const out = new Uint8Array(HID_REPORT_LEN);
    out[0] = REPORT_ID;
    out.set(bytes, 1);
    return out;
  }
  throw new Error(`rapport HID trop court : ${bytes.length} octets`);
}

/**
 * Arrondi a une decimale, regle de Python (`round` = arrondi au pair).
 * Indispensable pour rester identique a `Measurement.to_dict()` : les valeurs
 * d'historique sont des multiples de 0,05 et tombent donc pile sur des demis.
 */
const round1 = (v) => {
  const scaled = v * 10;
  const floor = Math.floor(scaled);
  const diff = scaled - floor;
  if (diff > 0.5) return (floor + 1) / 10;
  if (diff < 0.5) return floor / 10;
  return (floor % 2 === 0 ? floor : floor + 1) / 10;
};

/** Modele commun aux mesures live et historique. */
export function createRecord(over = {}) {
  const range = over.range ?? 0;
  return {
    no: 0,
    value: 0,
    batteryLow: false,
    mode: "SLOW",
    maxHold: false,
    weighting: "A",
    range,
    time: "",
    date: "",
    lowEffect: false,
    highEffect: false,
    source: "live",
    rangeLabel: RANGE_LABELS[range] ?? "",
    ...over,
    value: round1(Number(over.value ?? 0)),
    rangeLabel: RANGE_LABELS[over.range ?? 0] ?? "",
  };
}

/** Decode la reponse a `readPoint()` (Analyse.AnalysisReadPoint). */
export function parseReadPoint(raw) {
  const buf = normalize(raw);
  const raw16 = (buf[1] << 8) | buf[2];
  const signed = raw16 >= 0x8000 ? raw16 - 0x10000 : raw16;
  const flags = buf[3];
  return createRecord({
    value: round1(signed / 10),
    batteryLow: Boolean(flags & FLAG_BATTERY_LOW),
    mode: flags & FLAG_FAST ? "FAST" : "SLOW",
    maxHold: Boolean(flags & FLAG_MAX),
    weighting: flags & FLAG_WEIGHTING_C ? "C" : "A",
    range: flags & 0x0f,
    source: "live",
  });
}

/**
 * Convertit une mesure venant du serveur `bitan-sono` (snake_case, tel que
 * `Measurement.to_dict()` le produit en Python) en enregistrement mobile.
 */
export function fromWire(data = {}) {
  return createRecord({
    no: Number(data.no) || 0,
    value: round1(Number(data.value) || 0),
    batteryLow: Boolean(data.battery_low),
    mode: data.mode === "FAST" ? "FAST" : "SLOW",
    maxHold: Boolean(data.max_hold),
    weighting: data.weighting === "C" ? "C" : "A",
    range: Number(data.range) || 0,
    time: data.time || "",
    date: data.date || "",
    lowEffect: Boolean(data.low_effect),
    highEffect: Boolean(data.high_effect),
    source: data.source || "live",
  });
}

/** Analyse.IsCorrect — l'appareil a accepte la configuration. */
export function isSettingsAck(raw) {
  const bytes = raw instanceof Uint8Array ? raw : new Uint8Array(raw || []);
  // Sur le bus, l'ID de rapport 0 ne circule pas : `normalize` remet la trame
  // dans la forme de 9 octets que le Python manipule.
  return bytes.length >= PAYLOAD_LEN && normalize(bytes)[1] === ACK_SETTINGS;
}

/** Analyse.AnswerBackHistory — l'appareil est pret a vider son journal. */
export function isHistoryHandshakeAck(raw) {
  const bytes = raw instanceof Uint8Array ? raw : new Uint8Array(raw || []);
  return bytes.length >= PAYLOAD_LEN && normalize(bytes)[1] === ACK_HISTORY_HANDSHAKE;
}

/** Decode un octet BCD (0x42 -> 42). */
export function decodeBcd(byte) {
  return (byte >> 4) * 10 + (byte & 0x0f);
}

const pad2 = (n) => String(n).padStart(2, "0");
export const fmtDate = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
export const fmtTime = (d) => `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;

const isLeapYear = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

/**
 * `datetime(...)` de Python, en JavaScript.
 *
 * Le constructeur `Date` se contente de déborder (mois 13 -> janvier suivant) là
 * où Python lève `ValueError` et retombe sur le 1er janvier 2000. On reproduit
 * donc la règle de Python, jours par mois et bissextiles compris.
 */
export function pythonDate(year, month, day, hour, minute, second) {
  if (year < 1 || year > 9999) return null;
  if (month < 1 || month > 12) return null;
  const days = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (day < 1 || day > days[month - 1]) return null;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59 || second < 0 || second > 59) return null;
  return new Date(year, month - 1, day, hour, minute, second);
}

/**
 * Decode un en-tete d'historique de 8 octets (Analyse.AnalysisReadHistoryHeader).
 *
 *   [0] marqueur 0xFD
 *   [1] drapeaux d'etat
 *   [2..7] secondes, minutes, heures, jour, mois, annee (BCD, annee + 2000)
 */
export function parseHistoryHeader(buf) {
  if (buf.length < 8 || buf[0] !== ACK_HISTORY_RECORD) {
    throw new Error("ce n'est pas un en-tete d'historique");
  }
  const flags = buf[1];
  const day = decodeBcd(buf[5]);
  const month = decodeBcd(buf[6]);
  const year = 2000 + decodeBcd(buf[7]);
  // Comme le Python : une date impossible retombe sur le 1er janvier 2000.
  const stamp =
    pythonDate(year, month, day, decodeBcd(buf[4]), decodeBcd(buf[3]), decodeBcd(buf[2])) ??
    new Date(2000, 0, 1);
  const record = createRecord({
    batteryLow: Boolean(flags & FLAG_BATTERY_LOW),
    mode: flags & FLAG_FAST ? "FAST" : "SLOW",
    maxHold: Boolean(flags & FLAG_MAX),
    weighting: flags & FLAG_WEIGHTING_C ? "C" : "A",
    range: flags & 0x0f,
    date: fmtDate(stamp),
    time: fmtTime(stamp),
    source: "history",
  });
  return { record, stamp };
}

/** Decode un groupe de 3 octets portant deux mesures 12 bits (divisees par 20).
 *  Valeurs brutes, non arrondies, exactement comme `decode_history_group`. */
export function decodeHistoryGroup(group) {
  if (group.length < 3) throw new Error("groupe d'historique trop court");
  const v1 = ((group[0] << 4) | (group[1] >> 4)) / 20;
  const v2 = (((group[1] & 0x0f) << 8) | group[2]) / 20;
  return [v1, v2];
}

/**
 * Parcourt un flux d'historique brut.
 *
 * Le flux est une suite de blocs `en-tete(8) + intervalle(1) + groupes(3*n)`.
 * L'octet 0xFF clot le journal, l'octet 0xFD ouvre un nouveau bloc.
 */
export function iterHistory(stream, intervalHint = 1) {
  const out = [];
  const n = stream.length;
  if (n < 9) return out;

  let header = parseHistoryHeader(stream.subarray(0, 8));
  let record = header.record;
  let stamp = header.stamp;
  let pos = 8;
  let interval = stream[pos] || intervalHint;
  pos += 1;
  let no = 0;

  while (pos < n) {
    if (stream[pos] === NO_DATA) return out;
    if (stream[pos] === ACK_HISTORY_RECORD) {
      if (pos + 9 > n) return out;
      const next = parseHistoryHeader(stream.subarray(pos, pos + 8));
      record = next.record;
      stamp = next.stamp;
      pos += 8;
      interval = stream[pos] || intervalHint;
      pos += 1;
      continue;
    }
    if (pos + 3 > n) return out;
    for (const value of decodeHistoryGroup(stream.subarray(pos, pos + 3))) {
      no += 1;
      out.push(
        createRecord({
          no,
          value,
          mode: record.mode,
          weighting: record.weighting,
          range: record.range,
          date: fmtDate(stamp),
          time: fmtTime(stamp),
          source: "history",
        })
      );
      stamp = new Date(stamp.getTime() + interval * 1000);
    }
    pos += 3;
  }
  return out;
}
