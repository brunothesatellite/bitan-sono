/* ==========================================================================
   bitan·sono mobile — session appareil (module ES, sans DOM)
   --------------------------------------------------------------------------
   Transcription de slm/device.py, avec les leçons de la v0.2 :

     * un seul evenement `stopped` a la fin de la boucle live, quel que soit
       le chemin de sortie (l'ancien code pouvait mourir en silence) ;
     * apres 5 rapports manquants, on rouvre l'appareil (`_recover`) plutot
       que de figer l'affichage ;
     * le delai de lecture suit l'intervalle demande sans deriver.

   Testable en Node : le transport est injecte.
   ========================================================================== */

import * as P from "./protocol.js";
import { TIMEOUTS, ReportQueue, sleep } from "./transports.js";

export class DeviceController {
  constructor({ transport, settings = {}, handlers = {} } = {}) {
    this.transport = transport;
    this.settings = { interval: 1, lowAlarm: 30, highAlarm: 45, ...settings };
    this.handlers = handlers;
    this.queue = new ReportQueue();
    this.connected = false;
    this._liveToken = 0;
    this._liveRunning = false;
    this._busy = false;
  }

  get simulated() {
    return Boolean(this.transport?.isSimulated);
  }

  get liveRunning() {
    return this._liveRunning;
  }

  _status(state, message = "") {
    this.handlers.onStatus?.({ state, message, simulated: this.simulated });
  }

  async connect() {
    if (this.connected) return true;
    try {
      this.transport.onReport = (bytes) => this.queue.push(bytes);
      // Mode flux (serveur distant) : les mesures arrivent d'elles-mêmes.
      this.transport.onMeasure = (data, stats, count) => {
        if (stats) this.handlers.onStats?.(stats, count);
        if (!this._liveRunning) return;
        try {
          this._emitMeasurement(P.fromWire(data));
        } catch (err) {
          this.handlers.onError?.(err);
        }
      };
      this.transport.onError = (err) => {
        this.handlers.onError?.(err);
        this.connected = false;
        this._status("disconnected", err?.message || "");
      };
      await this.transport.open();
      this.connected = true;
      this._status("connected", this.transport.label || "");
      return true;
    } catch (err) {
      this.connected = false;
      this._status("disconnected", err?.message || String(err));
      this.handlers.onConnectError?.(err);
      return false;
    }
  }

  async close(message = "") {
    this.stopLive();
    if (this.connected) {
      try {
        await this.transport.close();
      } catch {
        /* ignore */
      }
    }
    this.connected = false;
    this._status("disconnected", message);
  }

  /** Ecrit une trame et attend un rapport (ou null au bout du delai). */
  async _request(bytes, timeout = TIMEOUTS.request) {
    this.queue.drain();
    try {
      await this.transport.write(bytes);
    } catch (err) {
      this.connected = false;
      this._status("disconnected", err?.message || String(err));
      this.handlers.onError?.(err);
      return null;
    }
    return this.queue.next(timeout);
  }

  /** Une mesure, en synchrone (utilise pour lire les reglages). */
  async readOnce() {
    if (!this.connected && !(await this.connect())) return null;
    const raw = await this._request(P.readPoint());
    if (!raw) return null;
    try {
      return P.parseReadPoint(raw);
    } catch {
      return null;
    }
  }

  /* -- direct ------------------------------------------------------------ */

  startLive() {
    if (this._liveRunning) return;
    this._liveRunning = true;
    this._liveToken += 1;
    const token = this._liveToken;
    this.handlers.onLive?.({ state: "started" });
    if (this.transport?.mode === "stream") {
      Promise.resolve(this.transport.startLive?.()).catch((err) => {
        this.handlers.onError?.(err);
        this._finishLive();
      });
      return;
    }
    this._liveLoop(token).catch((err) => this.handlers.onError?.(err));
  }

  stopLive() {
    if (!this._liveRunning) return;
    // Changer le jeton suffit : la boucle abandonnera a la prochaine etape.
    // `stopped` est emis ici, une seule fois, et la boucle ne redouble pas.
    this._liveToken += 1;
    this._liveRunning = false;
    if (this.transport?.mode === "stream") {
      Promise.resolve(this.transport.stopLive?.()).catch(() => {});
    }
    this.handlers.onLive?.({ state: "stopped" });
  }

  _finishLive() {
    if (!this._liveRunning) return; // deja signale par stopLive()
    this._liveRunning = false;
    this.handlers.onLive?.({ state: "stopped" });
  }

  async _recover(attempts = 3) {
    this._status("reconnecting", "Sonomètre muet, tentative de reconnexion…");
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      if (!this._liveRunning) return false;
      try {
        await this.transport.close();
      } catch {
        /* ignore */
      }
      this.connected = false;
      try {
        await this.transport.open();
        this.connected = true;
        this.queue.drain();
        this._status("connected", "Sonomètre reconnecté");
        return true;
      } catch (err) {
        this.handlers.onError?.(err);
      }
      await sleep(1000);
    }
    this._status("disconnected", "Sonomètre injoignable, mesure arrêtée");
    return false;
  }

  async _liveLoop(token) {
    let missed = 0;
    const interval = Math.max(0.2, Number(this.settings.interval) || 1);
    while (this._liveRunning && token === this._liveToken) {
      const started = Date.now();
      if (!this.connected && !(await this.connect())) break;
      const raw = await this._request(P.readPoint(), TIMEOUTS.request);
      if (token !== this._liveToken) break;
      if (!raw) {
        missed += 1;
        if (missed >= 5) {
          if (!(await this._recover())) break;
          missed = 0;
        }
      } else {
        missed = 0;
        try {
          this._emitMeasurement(P.parseReadPoint(raw));
        } catch {
          /* trame illisible : on ignore */
        }
      }
      if (token !== this._liveToken) break;
      const elapsed = Date.now() - started;
      await sleep(Math.max(0, interval * 1000 - elapsed));
    }
    if (token === this._liveToken) this._finishLive();
  }

  _emitMeasurement(record) {
    record.lowEffect = Number(record.value) < Number(this.settings.lowAlarm);
    record.highEffect = Number(record.value) > Number(this.settings.highAlarm);
    this.handlers.onMeasurement?.(record);
  }

  /* -- reglages appareil ------------------------------------------------- */

  async readSettings() {
    const record = await this.readOnce();
    if (!record) return null;
    this.handlers.onDeviceSettings?.(record);
    return record;
  }

  async writeSettings({ mode, maxHold, weighting, rangeIndex }) {
    if (this.transport?.mode === "stream") {
      await this.transport.writeSettings({
        deviceMode: mode,
        deviceMaxHold: maxHold,
        deviceWeighting: weighting,
        deviceRange: rangeIndex,
      });
      return true;
    }
    if (!this.connected && !(await this.connect())) return false;
    const raw = await this._request(P.writeSettings({ mode, maxHold, weighting, rangeIndex }));
    const ok = raw === null || P.isSettingsAck(raw);
    this.handlers.onSettingsWritten?.({ ok });
    return ok;
  }

  /* -- historique -------------------------------------------------------- */

  async downloadHistory({ maxRecords = 31000, onProgress = null } = {}) {
    if (this.transport?.mode === "stream") throw new Error("liaison en flux : utilisez le serveur");
    if (!this.connected && !(await this.connect())) throw new Error("non connecté");
    this._busy = true;
    try {
      const ack = await this._request(P.handshakeHistory(), TIMEOUTS.handshake);
      if (!ack || !P.isHistoryHandshakeAck(ack)) {
        // Certains firmwares vident d'emblee : on continue quand meme.
      }
      const chunks = [];
      let total = 0;
      let empties = 0;
      while (total < maxRecords * 3 + 16) {
        const raw = await this._request(P.readHistory(), TIMEOUTS.request);
        if (!raw) {
          empties += 1;
          if (empties >= 3) break;
          continue;
        }
        empties = 0;
        const payload = P.normalize(raw).subarray(1, P.HID_REPORT_LEN);
        chunks.push(payload);
        total += payload.length;
        onProgress?.({ bytes: total });
        if (payload[0] === P.NO_DATA) break;
      }
      const stream = new Uint8Array(total);
      let offset = 0;
      for (const chunk of chunks) {
        stream.set(chunk, offset);
        offset += chunk.length;
      }
      const records = P.iterHistory(stream);
      records.forEach((r, i) => {
        r.no = i + 1;
      });
      return records;
    } finally {
      this._busy = false;
    }
  }
}
