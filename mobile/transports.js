/* ==========================================================================
   bitan·sono mobile — transports (module ES)
   --------------------------------------------------------------------------
   Cinq façons d'atteindre le sonomètre, derrière une interface unique :

     hid    WebHID   — Chrome/Edge bureautique, et Chrome Android >= 157
     usb    WebUSB   — la voie OTG disponible sur Android aujourd'hui
     relay  serveur  — le sonomètre est branché sur un ordinateur qui fait
                       tourner `bitan-sono` ; le téléphone ne fait qu'afficher
     bridge passerelle native — une coquille Android (WebView/TWA) peut
                       injecter window.BitanBridge et brancher l'USB host
     sim    démo     — aucun matériel, pour découvrir l'interface

   Deux familles de transports :

     mode "framed"  on écrit une trame de 8 octets, on reçoit un rapport
                    (HID, USB, bridge, sim)
     mode "stream"  le transport pousse lui-même les mesures (relay)

   Conventions de trames : voir protocol.js. Sur le bus, seuls les 8 octets
   utiles circulent (l'ID de rapport 0 n'est jamais transmis).
   ========================================================================== */

import {
  ACK_HISTORY_HANDSHAKE,
  ACK_SETTINGS,
  CMD_HANDSHAKE_HISTORY,
  CMD_READ_HISTORY,
  CMD_READ_POINT,
  CMD_WRITE_SETTINGS,
  NO_DATA,
  PAYLOAD_LEN,
  PID,
  REPORT_ID,
  RANGE_LABELS,
  VID,
} from "./protocol.js";

export const TIMEOUTS = {
  request: 600,
  handshake: 1000,
  open: 8000,
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Petite pompe a rapports : les transports y deposent, le controleur y puise. */
export class ReportQueue {
  constructor() {
    this.items = [];
    this.waiters = [];
  }
  push(bytes) {
    const waiter = this.waiters.shift();
    if (waiter) waiter(bytes);
    else this.items.push(bytes);
  }
  drain() {
    this.items.length = 0;
  }
  next(timeoutMs) {
    if (this.items.length) return Promise.resolve(this.items.shift());
    return new Promise((resolve) => {
      const waiter = (bytes) => {
        clearTimeout(timer);
        resolve(bytes);
      };
      const timer = setTimeout(() => {
        const i = this.waiters.indexOf(waiter);
        if (i >= 0) this.waiters.splice(i, 1);
        resolve(null);
      }, timeoutMs);
      this.waiters.push(waiter);
    });
  }
}

/** Base commune : les transports ne font que du transport. */
class BaseTransport {
  mode = "framed";
  kind = "sim";
  isSimulated = false;
  label = "";
  detail = "";
  onReport = null;
  onError = null;
  onMeasure = null;
  onStatus = null;

  describe() {
    return { kind: this.kind, label: this.label, detail: this.detail };
  }
  emitStatus(state, message = "") {
    this.onStatus?.({ state, message });
  }
}

/* --------------------------------------------------------------------------
   WebHID — propre, sans gestion d'interfaces, mais absent de Chrome Android
   -------------------------------------------------------------------------- */
export class WebHidTransport extends BaseTransport {
  kind = "hid";
  label = "WebHID";

  static available() {
    return typeof navigator !== "undefined" && Boolean(navigator.hid);
  }

  async open() {
    if (!WebHidTransport.available()) throw fail("no-api", "WebHID indisponible");
    let device = (await navigator.hid.getDevices()).find(
      (d) => d.vendorId === VID && d.productId === PID
    );
    if (!device) {
      try {
        const picked = await navigator.hid.requestDevice({
          filters: [{ vendorId: VID, productId: PID }],
        });
        device = picked[0];
      } catch (err) {
        // Annulation du sélecteur ou autorisation refusée.
        throw fail(isRefusal(err) ? "no-permission" : "no-device", String(err?.message || err), err);
      }
    }
    if (!device) throw fail("no-device", "no-device");
    try {
      if (!device.opened) await device.open();
    } catch (err) {
      throw fail(isRefusal(err) ? "no-permission" : "open", String(err?.message || err), err);
    }
    this.device = device;
    this._onInput = (event) => {
      const view = event.data;
      this.onReport(new Uint8Array(view.buffer, view.byteOffset, view.byteLength).slice());
    };
    device.addEventListener("inputreport", this._onInput);
    this.label = `${device.productName || "Sonomètre"}`;
    this.detail = `WebHID · VID ${VID.toString(16).toUpperCase()} PID ${PID.toString(16).toUpperCase()}`;
  }

  async close() {
    if (this.device) {
      if (this._onInput) this.device.removeEventListener("inputreport", this._onInput);
      try {
        await this.device.close();
      } catch {
        /* deja ferme */
      }
    }
    this.device = null;
  }

  async write(bytes) {
    if (!this.device) throw new Error("transport fermé");
    await this.device.sendReport(REPORT_ID, bytes);
  }
}

/* --------------------------------------------------------------------------
   WebUSB — la voie OTG. Peut echouer si le noyau Android a deja pris
   l'interface HID : c'est alors une SecurityError/NetworkError explicite.
   -------------------------------------------------------------------------- */
export class WebUsbTransport extends BaseTransport {
  kind = "usb";
  label = "WebUSB";

  static available() {
    return typeof navigator !== "undefined" && Boolean(navigator.usb);
  }

  async open() {
    if (!WebUsbTransport.available()) throw fail("no-api", "WebUSB indisponible");
    let device = null;
    try {
      device = (await navigator.usb.getDevices()).find(
        (d) => d.vendorId === VID && d.productId === PID
      );
      if (!device) {
        try {
          device = await navigator.usb.requestDevice({ filters: [{ vendorId: VID, productId: PID }] });
        } catch (err) {
          throw fail(isRefusal(err) ? "no-permission" : "no-device", String(err?.message || err), err);
        }
      }
      if (!device) throw fail("no-device", "no-device");

      try {
        await device.open();
      } catch (err) {
        throw fail(isRefusal(err) ? "no-permission" : "open", String(err?.message || err), err);
      }
      if (device.configuration === null) await device.selectConfiguration(1);

      const map = describeConfiguration(device.configuration);
      const candidates = interfaceCandidates(device.configuration).filter((c) => c.epIn);
      if (!candidates.length) {
        throw fail("no-endpoint", "aucune entrée interrupt sur cet appareil", null, map);
      }

      // L'interface HID appartient presque toujours au noyau sur Android :
      // claimInterface est alors refuse. On essaie *toutes* les interfaces
      // utilisables, au cas ou l'appareil en exposerait une libre.
      let lastError = null;
      for (const cand of candidates) {
        let claimed = false;
        try {
          await device.claimInterface(cand.iface.interfaceNumber);
          claimed = true;
          const current = device.configuration?.interfaces?.find(
            (i) => i.interfaceNumber === cand.iface.interfaceNumber
          )?.alternate?.alternateSetting;
          if (cand.alt.alternateSetting !== current) {
            await device.selectAlternateInterface(cand.iface.interfaceNumber, cand.alt.alternateSetting);
          }
        } catch (err) {
          lastError = err;
          if (claimed) {
            try {
              await device.releaseInterface(cand.iface.interfaceNumber);
            } catch {
              /* ignore */
            }
          }
          continue;
        }

        this.device = device;
        this.iface = cand.iface;
        this.epIn = cand.epIn;
        this.epOut = cand.epOut;
        this.inLength = Math.max(PAYLOAD_LEN, cand.epIn.packetSize || PAYLOAD_LEN);
        this._running = true;
        this._readLoop().catch((err) => this.onError?.(err));

        this.label = device.productName || "Sonomètre";
        this.detail = `WebUSB · interface ${cand.iface.interfaceNumber} · IN 0x${cand.epIn.endpointNumber.toString(16)} OUT 0x${cand.epOut.endpointNumber.toString(16)}`;
        return;
      }

      // Aucune interface n'a pu être prise : c'est le cas « noyau ».
      throw fail(
        /claim/i.test(String(lastError?.message || "")) ? "claim" : "open",
        String(lastError?.message || "échec de la prise d'interface"),
        lastError,
        map
      );
    } catch (err) {
      // Un peripherique laisse ouvert condamne toutes les tentatives suivantes
      // jusqu'au rechargement de la page : on referme toujours.
      try {
        await device?.close();
      } catch {
        /* ignore */
      }
      this.device = null;
      throw err;
    }
  }

  async _readLoop() {
    while (this._running && this.device) {
      let result;
      try {
        result = await this.device.transferIn(this.epIn.endpointNumber, this.inLength);
      } catch (err) {
        if (this._running) this.onError?.(err);
        return;
      }
      if (!this._running) return;
      if (result?.status === "ok" && result.data && result.data.byteLength) {
        const { buffer, byteOffset, byteLength } = result.data;
        this.onReport(new Uint8Array(buffer, byteOffset, byteLength).slice());
      } else if (result?.status && result.status !== "ok") {
        this.onError?.(new Error(`transfert IN ${result.status}`));
        return;
      }
    }
  }

  async close() {
    this._running = false;
    if (this.device) {
      try {
        if (this.iface) await this.device.releaseInterface(this.iface.interfaceNumber);
      } catch {
        /* ignore */
      }
      try {
        await this.device.close();
      } catch {
        /* ignore */
      }
    }
    this.device = null;
  }

  async write(bytes) {
    if (!this.device || !this.epOut) throw new Error("transport fermé");
    // 8 octets utiles : sur le bus, l'ID de rapport 0 ne circule pas.
    await this.device.transferOut(this.epOut.endpointNumber, bytes);
  }
}

/** Erreur annotee : `code` pour l'interface, `detail` pour le diagnostic. */
export function fail(code, message, cause = null, detail = "") {
  const err = new Error(message);
  err.code = code;
  if (cause) err.cause = cause;
  if (detail) err.detail = detail;
  return err;
}

/** Vrai si l'erreur traduit un refus d'autorisation du navigateur. */
export function isRefusal(err) {
  const name = String(err?.name || "");
  const text = String(err?.message || err || "");
  return /Security|NotAllowed|Access denied|permission/i.test(`${name} ${text}`);
}

function hex2(value) {
  return Number(value ?? 0).toString(16).padStart(2, "0").toUpperCase();
}

/**
 * Toutes les interfaces utilisables, classees par interet.
 *
 * Un appareil HID n'en expose qu'une, deja prise par le noyau sur Android ;
 * mais un appareil composite (HID + CDC, par exemple) peut en offrir une
 * libre. On essaie donc les candidates dans l'ordre.
 */
export function interfaceCandidates(configuration) {
  const found = [];
  for (const iface of configuration?.interfaces ?? []) {
    const alts = [];
    for (const alt of iface.alternates) {
      const epIn = alt.endpoints.find((e) => e.direction === "in" && e.type === "interrupt");
      const epOut = alt.endpoints.find((e) => e.direction === "out" && e.type === "interrupt");
      alts.push({ iface, alt, epIn, epOut, isHid: alt.interfaceClass === 0x03 });
    }
    if (!alts.length) continue;
    found.push(
      alts.find((a) => a.isHid && a.epIn && a.epOut) ??
        alts.find((a) => a.epIn && a.epOut) ??
        alts.find((a) => a.isHid && a.epIn) ??
        alts.find((a) => a.epIn) ??
        alts[0]
    );
  }
  const rank = (c) =>
    c.isHid && c.epIn && c.epOut ? 0 : c.epIn && c.epOut ? 1 : c.isHid && c.epIn ? 2 : c.epIn ? 3 : 4;
  return found
    .map((c, index) => ({ c, index }))
    .sort((a, b) => rank(a.c) - rank(b.c) || a.index - b.index)
    .map(({ c }) => c);
}

/** Choisit l'interface et les points de terminaison a utiliser. */
export function pickInterface(configuration) {
  const best = interfaceCandidates(configuration)[0];
  if (!best) throw fail("no-endpoint", "aucune interface utilisable sur cet appareil");
  return { iface: best.iface, epIn: best.epIn, epOut: best.epOut, alt: best.alt, isHid: best.isHid };
}

/**
 * Carte lisible des interfaces et points de terminaison, montree dans le
 * diagnostic. C'est ce qu'il faut recopier dans un rapport de bogue : elle
 * dit exactement ce que l'appareil expose et ce qui est prenable.
 */
export function describeConfiguration(configuration) {
  const lines = [];
  for (const iface of configuration?.interfaces ?? []) {
    for (const alt of iface.alternates) {
      const endpoints = alt.endpoints
        .map((e) => `${e.direction === "in" ? "IN" : "OUT"} 0x${hex2(e.endpointNumber)} ${e.type}`)
        .join(", ");
      const cls = `0x${hex2(alt.interfaceClass)}/0x${hex2(alt.interfaceSubclass)}/0x${hex2(alt.interfaceProtocol)}`;
      lines.push(
        `IF ${iface.interfaceNumber}.${alt.alternateSetting} classe ${cls}` +
          (alt.interfaceClass === 0x03 ? " HID" : "") +
          (endpoints ? ` · ${endpoints}` : " · aucun point de terminaison")
      );
    }
  }
  return lines.join("\n");
}

/* --------------------------------------------------------------------------
   Passerelle native — pour une coquille Android (WebView / TWA) qui
   implementerait l'USB host en Java et l'exposerait au JavaScript.
   Contrat attendu :
     window.BitanBridge = {
       open(): Promise<string>,          // libelle de l'appareil
       send(bytes: number[]): void,      // 8 octets utiles
       close(): void,
       onData(bytes: number[]): void,    // appele par la coquille
       onError(message: string): void,
     }
   -------------------------------------------------------------------------- */
export class BridgeTransport extends BaseTransport {
  kind = "bridge";
  label = "Passerelle native";

  static available() {
    return typeof window !== "undefined" && Boolean(window.BitanBridge);
  }

  async open() {
    const bridge = window.BitanBridge;
    if (!bridge) throw new Error("passerelle absente");
    bridge.onData = (bytes) => this.onReport(Uint8Array.from(bytes));
    bridge.onError = (message) => this.onError?.(new Error(message));
    this.label = (await bridge.open()) || "Sonomètre (natif)";
    this.detail = "USB host natif via la passerelle";
    this.bridge = bridge;
  }

  async close() {
    try {
      await this.bridge?.close?.();
    } catch {
      /* ignore */
    }
    this.bridge = null;
  }

  async write(bytes) {
    if (!this.bridge) throw new Error("transport fermé");
    await this.bridge.send(Array.from(bytes));
  }
}

/* --------------------------------------------------------------------------
   Relais — le sonomètre est sur un ordinateur qui fait tourner bitan-sono
   -------------------------------------------------------------------------- */
export class RelayTransport extends BaseTransport {
  mode = "stream";
  kind = "relay";
  label = "Serveur distant";

  constructor(url) {
    super();
    this.url = normalizeWsUrl(url);
  }

  async open() {
    if (typeof WebSocket === "undefined") throw new Error("WebSocket indisponible");
    await new Promise((resolve, reject) => {
      const socket = new WebSocket(this.url);
      this.socket = socket;
      const failed = (event) =>
        reject(new Error(event?.message || `connexion refusée (${this.url})`));
      const timer = setTimeout(() => {
        try {
          socket.close();
        } catch {
          /* ignore */
        }
        reject(new Error("délai dépassé"));
      }, TIMEOUTS.open);
      socket.onopen = () => {
        clearTimeout(timer);
        resolve();
      };
      socket.onerror = failed;
      socket.onmessage = (event) => this._onMessage(event);
      socket.onclose = () => this.onStatus?.({ state: "disconnected", message: "" });
    });
  }

  _send(payload) {
    if (this.socket?.readyState === 1) this.socket.send(JSON.stringify(payload));
  }

  _onMessage(event) {
    let message;
    try {
      message = JSON.parse(event.data);
    } catch {
      return;
    }
    switch (message.type) {
      case "measurement":
        this.onMeasure?.(message.data, message.stats, message.count);
        break;
      case "status":
        this.onStatus?.({ state: message.state, message: message.message || "" });
        break;
      case "snapshot":
        this.remote = message;
        this.detail = `${this.url} · ${message.simulated ? "simulateur" : "matériel"}`;
        break;
      case "error":
        this.onError?.(new Error(message.message));
        break;
      default:
        break;
    }
    this.onMessage?.(message);
  }

  async startLive() {
    this._send({ cmd: "live.start" });
  }
  async stopLive() {
    this._send({ cmd: "live.stop" });
  }
  async writeSettings(settings) {
    this._send({
      cmd: "device.write",
      mode: settings.deviceMode,
      max_hold: settings.deviceMaxHold,
      weighting: settings.deviceWeighting,
      range: settings.deviceRange,
    });
  }
  async readSettings() {
    this._send({ cmd: "device.read_settings" });
  }

  async write() {
    throw new Error("transport en flux : utilisez les commandes dédiées");
  }

  async close() {
    try {
      this.socket?.close();
    } catch {
      /* ignore */
    }
    this.socket = null;
  }
}

/** ws://hote:8765 ou hote:8765 ou https://hote -> ws://hote:8765/ws */
export function normalizeWsUrl(input) {
  let url = String(input || "").trim();
  if (!url) throw new Error("adresse vide");
  if (!/^wss?:\/\//.test(url)) {
    url = `${url.startsWith("https") ? "wss" : "ws"}://${url.replace(/^https?:\/\//, "")}`;
  }
  if (!/\/ws$/.test(url)) url = url.replace(/\/$/, "") + "/ws";
  return url;
}

/* --------------------------------------------------------------------------
   Simulateur — reproduit le protocole du vrai appareil (mode framed), avec
   des ambiances choisissables pour montrer la meteo de la maison.
   -------------------------------------------------------------------------- */
export const DEMO_PROFILES = {
  calm: { base: 38, spread: 1.5, peak: 0.02, label: "demo.calm" },
  family: { base: 52, spread: 4, peak: 0.08, label: "demo.family" },
  busy: { base: 66, spread: 6, peak: 0.22, label: "demo.busy" },
  storm: { base: 78, spread: 9, peak: 0.4, label: "demo.storm" },
};

export class SimTransport extends BaseTransport {
  kind = "sim";
  isSimulated = true;
  label = "Simulateur";
  detail = "Aucun matériel connecté";

  constructor({ profile = "family", seed = 1, translate = null } = {}) {
    super();
    this.profile = DEMO_PROFILES[profile] ? profile : "family";
    this.mode = "SLOW";
    this.maxHold = false;
    this.weighting = "A";
    this.range = 0;
    this.dropNext = 0;
    this._seed = seed;
    this._t0 = Date.now();
    // Le libelle de l'ambiance est une cle i18n : sans traducteur, on affiche
    // au moins le dernier segment (« calm ») plutot que la cle entiere.
    this._t = typeof translate === "function" ? translate : (key) => String(key).split(".").pop();
  }

  _rng() {
    // Générateur déterministe (mulberry32) : les tests restent reproductibles.
    this._seed = (this._seed + 0x6d2b79f5) >>> 0;
    let t = this._seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  setProfile(name) {
    if (DEMO_PROFILES[name]) this.profile = name;
  }

  /** Force une mesure (utile aux tests d'interface). */
  inject(value) {
    this.onReport?.(this._report(Number(value)));
  }

  async open() {
    this._t0 = Date.now();
    this.detail = `Ambiance « ${this._t(DEMO_PROFILES[this.profile].label)} »`;
  }

  async close() {}

  async write(bytes) {
    const cmd = bytes[0];
    if (this.dropNext > 0) {
      this.dropNext -= 1;
      return; // panne simulée : le controleur doit se raviser
    }
    if (cmd === CMD_READ_POINT) {
      this.onReport?.(this._report(this._nextValue()));
    } else if (cmd === CMD_WRITE_SETTINGS) {
      const flag = bytes[1] ?? 0;
      this.mode = flag & 0x40 ? "FAST" : "SLOW";
      this.maxHold = Boolean(flag & 0x20);
      this.weighting = flag & 0x10 ? "C" : "A";
      this.range = flag & 0x0f;
      const ack = new Uint8Array(PAYLOAD_LEN);
      ack[0] = ACK_SETTINGS;
      this.onReport?.(ack);
    } else if (cmd === CMD_HANDSHAKE_HISTORY) {
      // `this._rng` est une methode : la passer telle quelle perdrait `this`.
      this._history = buildSimHistory(() => this._rng());
      const ack = new Uint8Array(PAYLOAD_LEN);
      ack[0] = ACK_HISTORY_HANDSHAKE;
      this.onReport?.(ack);
    } else if (cmd === CMD_READ_HISTORY) {
      if (!this._history?.length) {
        const end = new Uint8Array(PAYLOAD_LEN);
        end[0] = NO_DATA;
        this.onReport?.(end);
      } else {
        this.onReport?.(this._history.shift());
      }
    }
  }

  _nextValue() {
    const p = DEMO_PROFILES[this.profile];
    const t = (Date.now() - this._t0) / 1000;
    const wave = Math.sin(t / 7) * p.spread;
    const noise = (this._rng() - 0.5) * p.spread;
    let value = p.base + wave + noise;
    if (this._rng() < p.peak) value += 12 + this._rng() * 10;
    return Math.max(0, Math.min(130, value));
  }

  _report(value) {
    const raw = Math.round(value * 10) & 0xffff;
    const out = new Uint8Array(PAYLOAD_LEN);
    out[0] = (raw >> 8) & 0xff;
    out[1] = raw & 0xff;
    let flags = this.range & 0x0f;
    if (this.mode === "FAST") flags |= 0x40;
    if (this.maxHold) flags |= 0x20;
    if (this.weighting === "C") flags |= 0x10;
    out[2] = flags;
    return out;
  }
}

function buildSimHistory(rng) {
  const chunks = [];
  const now = new Date();
  now.setSeconds(now.getSeconds() - 98);
  const bcd = (n) => ((Math.floor(n / 10) << 4) | n % 10) & 0xff;
  const header = new Uint8Array([
    0xfd,
    0,
    bcd(now.getSeconds()),
    bcd(now.getMinutes()),
    bcd(now.getHours()),
    bcd(now.getDate()),
    bcd(now.getMonth() + 1),
    bcd(now.getFullYear() - 2000),
  ]);
  const stream = [...header, 1];
  let base = 42 + rng() * 14;
  for (let i = 0; i < 49; i += 1) {
    base = Math.max(35, Math.min(78, base + (rng() - 0.5) * 10));
    const a = Math.round(Math.max(0, Math.min(204, base + (rng() - 0.5) * 2)) * 20) & 0xfff;
    const b = Math.round(Math.max(0, Math.min(204, base + (rng() - 0.5) * 2)) * 20) & 0xfff;
    stream.push(a >> 4, ((a & 0x0f) << 4) | (b >> 8), b & 0xff);
  }
  stream.push(NO_DATA);
  for (let i = 0; i < stream.length; i += PAYLOAD_LEN) {
    const chunk = new Uint8Array(PAYLOAD_LEN);
    chunk.set(stream.slice(i, i + PAYLOAD_LEN));
    chunks.push(chunk);
  }
  return chunks;
}

/* --------------------------------------------------------------------------
   Fabrique
   -------------------------------------------------------------------------- */

export const TRANSPORT_KINDS = ["auto", "hid", "usb", "relay", "sim", "bridge"];

export function detectCapabilities() {
  return {
    secure: typeof window !== "undefined" ? Boolean(window.isSecureContext) : false,
    hid: WebHidTransport.available(),
    usb: WebUsbTransport.available(),
    bridge: BridgeTransport.available(),
    direct: WebHidTransport.available() || WebUsbTransport.available(),
  };
}

/** Choisit la meilleure liaison automatiquement. */
export function resolveAutoKind(caps = detectCapabilities()) {
  if (caps.bridge) return "bridge";
  if (caps.hid) return "hid";
  if (caps.usb) return "usb";
  return null; // ni WebHID ni WebUSB : l'utilisateur devra choisir relais/démo
}

export function createTransport(kind, options = {}) {
  switch (kind) {
    case "hid":
      return new WebHidTransport();
    case "usb":
      return new WebUsbTransport();
    case "bridge":
      return new BridgeTransport();
    case "relay":
      return new RelayTransport(options.url);
    case "sim":
      return new SimTransport(options);
    case "auto": {
      const resolved = resolveAutoKind();
      if (!resolved) throw new Error("aucun transport direct disponible");
      return createTransport(resolved, options);
    }
    default:
      throw new Error(`liaison inconnue : ${kind}`);
  }
}

export { RANGE_LABELS };
export { sleep };
