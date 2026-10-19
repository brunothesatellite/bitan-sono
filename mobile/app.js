/* ==========================================================================
   bitan·sono mobile — contrôleur d'interface
   --------------------------------------------------------------------------
   Portrait d'abord. Toute la logique métier vit dans les modules purs
   (protocol.js, analysis.js, alarm.js, transports.js, device.js) ; ce fichier
   ne fait que du DOM, de la persistance et du câblage.
   ========================================================================== */

import * as A from "./analysis.js";
import { createAlarm } from "./alarm.js";
import { DeviceController } from "./device.js";
import { createTranslator } from "./i18n.js";
import { createDoseTracker, fmtDuration } from "./analysis.js";
import { HOME_RED } from "./analysis.js";
import {
  DEMO_PROFILES,
  TRANSPORT_KINDS,
  createTransport,
  detectCapabilities,
  normalizeWsUrl,
  resolveAutoKind,
} from "./transports.js";
import { RANGE_LABELS, parseReadPoint } from "./protocol.js";

/* ------------------------------------------------------------------ icônes */

const WX_CLOUD = (fill) =>
  `<g fill="${fill}"><circle cx="24" cy="38" r="8"/><circle cx="34" cy="32" r="10"/>` +
  `<circle cx="43" cy="38" r="7.5"/><rect x="16" y="38" width="34" height="9" rx="4.5"/></g>`;

const WX_ICONS = [
  `<svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="16" fill="#ffd66e" opacity=".25"/>` +
    `<g stroke="#f5b544" stroke-width="3.6" stroke-linecap="round">` +
    `<line x1="32" y1="6" x2="32" y2="13"/><line x1="32" y1="51" x2="32" y2="58"/>` +
    `<line x1="6" y1="32" x2="13" y2="32"/><line x1="51" y1="32" x2="58" y2="32"/>` +
    `<line x1="13.6" y1="13.6" x2="18.6" y2="18.6"/><line x1="45.4" y1="45.4" x2="50.4" y2="50.4"/>` +
    `<line x1="50.4" y1="13.6" x2="45.4" y2="18.6"/><line x1="18.6" y1="45.4" x2="13.6" y2="50.4"/></g>` +
    `<circle cx="32" cy="32" r="11.5" fill="#ffd66e"/><circle cx="28.5" cy="28.5" r="4" fill="#ffe6a8" opacity=".8"/></svg>`,
  `<svg viewBox="0 0 64 64">` +
    `<g stroke="#f5b544" stroke-width="3.2" stroke-linecap="round">` +
    `<line x1="20" y1="6" x2="20" y2="11"/><line x1="8" y1="18" x2="12" y2="22"/>` +
    `<line x1="32" y1="18" x2="28" y2="22"/><line x1="20" y1="30" x2="20" y2="31"/></g>` +
    `<circle cx="20" cy="22" r="8" fill="#ffd66e"/>` +
    WX_CLOUD("#e8eef5") +
    `</svg>`,
  `<svg viewBox="0 0 64 64">` +
    WX_CLOUD("#b9c4d4") +
    `<circle cx="30" cy="29" r="4" fill="#d3dbe6" opacity=".9"/></svg>`,
  `<svg viewBox="0 0 64 64">` +
    WX_CLOUD("#7d8ca3") +
    `<g stroke="#38bdf8" stroke-width="3" stroke-linecap="round">` +
    `<line x1="24" y1="48" x2="22" y2="56"/><line x1="34" y1="48" x2="32" y2="56"/></g>` +
    `<polygon points="40,42 31,54 36,54 33.5,62 43,50 38,50 41,42" fill="#ffd23f" ` +
    `stroke="#eab308" stroke-width="1.4" stroke-linejoin="round"/></svg>`,
];

const TREND_SVGS = {
  up: `<svg viewBox="0 0 24 24" fill="none" stroke="#fb923c" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>`,
  upFast: `<svg viewBox="0 0 24 24" fill="none" stroke="#f87171" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>`,
  flat: `<svg viewBox="0 0 24 24" fill="none" stroke="#2dd4a7" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="12" x2="20" y2="12"/><polyline points="13 5 20 12 13 19"/></svg>`,
  down: `<svg viewBox="0 0 24 24" fill="none" stroke="#38bdf8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/><polyline points="17 18 23 18 23 12"/></svg>`,
};

/* ------------------------------------------------------------------- état */

const STORE_KEY = "bitan-sono-mobile-settings";
const MAX_POINTS = 900;
const MAX_ROWS = 400;
const LIVE_LO = 30;
const LIVE_HI = 130;
const LIVE_CENTER = { x: 130, y: 122, r: 96 };
const BARO_CENTER = { x: 110, y: 118, r: 90 };

const DEFAULT_SETTINGS = {
  language: "fr",
  theme: "dark",
  transport: "auto",
  relayUrl: "",
  interval: 1,
  lowAlarm: 30,
  highAlarm: 45,
  soundEnabled: false,
  vibrate: false,
  wakeLock: false,
  deviceMode: "SLOW",
  deviceWeighting: "A",
  deviceMaxHold: false,
  deviceRange: 0,
  demoProfile: "family",
  homeT: [55, 65, 75],
};

const settings = loadSettings();
// Un fichier ancien ou édité à la main peut contenir n'importe quoi.
settings.homeT = A.sanitizeHomeT(settings.homeT);
const translator = createTranslator(settings.language);
const t = translator.t;

const state = {
  view: "live",
  connected: false,
  simulated: false,
  liveRunning: false,
  haveMeasurement: false,
  live: [],
  liveStats: {},
  history: [],
  historyTruncated: false,
  transportKind: null,
  transportLabel: "",
  transportDetail: "",
  lastError: "",
  lastErrorDetail: "",
};

const nap = { active: false, start: 0, lastPeak: 0 };
const dose = createDoseTracker({ storage: safeStorage() });

let transport = null;
let controller = null;
let refreshTimer = null;
let toastTimer = null;
let wakeLock = null;

const alarm = createAlarm({
  onBeep: (side) => playAlarm(side),
  onVibrate: () => vibrateAlarm(),
});

/* ------------------------------------------------------------- utilitaires */

const el = (id) => document.getElementById(id);
const qsa = (sel) => Array.from(document.querySelectorAll(sel));

function safeStorage() {
  try {
    const probe = "__bitan_probe__";
    window.localStorage.setItem(probe, "1");
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch {
    return null;
  }
}

function loadSettings() {
  const storage = safeStorage();
  if (!storage) return { ...DEFAULT_SETTINGS };
  try {
    const raw = JSON.parse(storage.getItem(STORE_KEY) || "null");
    if (raw && typeof raw === "object") return { ...DEFAULT_SETTINGS, ...raw };
  } catch {
    /* préférences illisibles : on repart des valeurs par défaut */
  }
  return { ...DEFAULT_SETTINGS };
}

function saveSettings() {
  const storage = safeStorage();
  if (!storage) return;
  try {
    storage.setItem(STORE_KEY, JSON.stringify(settings));
  } catch {
    /* quota dépassé : peu importe */
  }
}

/* Seuils des zones (baromètre + météo). Toujours valides : assainis au
   chargement et à chaque écriture. Le dosimètre garde son seuil à 75 dB. */
const homeT = () => settings.homeT;
const HZ = () => A.homeZones(homeT());
const zoneOfT = (v) => A.zoneOf(v, homeT());

function toast(message, kind = "") {
  const node = el("toast");
  node.textContent = message;
  node.className = `toast${kind ? ` is-${kind}` : ""}`;
  node.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    node.hidden = true;
  }, 3200);
}

function showError(message) {
  el("banner-error-text").textContent = message;
  el("banner-error").hidden = false;
}

const fmt = (v, digits = 1) => (v === null || v === undefined || Number.isNaN(v) ? "–" : Number(v).toFixed(digits));

/* ------------------------------------------------------------------- audio */

function unlockAudio() {
  const audio = el("alarm-audio");
  if (!audio) return;
  try {
    audio.muted = true;
    audio.src = "assets/highalarm.wav";
    const played = audio.play();
    if (played?.then) {
      played
        .then(() => {
          audio.pause();
          audio.currentTime = 0;
          audio.muted = false;
          audio.removeAttribute("src");
        })
        .catch(() => {
          audio.muted = false;
        });
    } else {
      audio.muted = false;
    }
  } catch {
    audio.muted = false;
  }
}

function playAlarm(side) {
  if (!settings.soundEnabled) return;
  const audio = el("alarm-audio");
  if (!audio) return;
  audio.src = side === "high" ? "assets/highalarm.wav" : "assets/lowalarm.wav";
  audio.currentTime = 0;
  const played = audio.play();
  if (played?.catch) played.catch(() => {});
}

function vibrateAlarm() {
  if (!settings.vibrate) return;
  try {
    navigator.vibrate?.([90, 70, 90]);
  } catch {
    /* non supporté */
  }
}

/* ------------------------------------------------------- écran allumé (PWA) */

async function acquireWakeLock() {
  if (!settings.wakeLock || !("wakeLock" in navigator)) return;
  try {
    wakeLock = await navigator.wakeLock.request("screen");
  } catch {
    wakeLock = null;
  }
}

async function releaseWakeLock() {
  try {
    await wakeLock?.release?.();
  } catch {
    /* ignore */
  }
  wakeLock = null;
}

/* ------------------------------------------------------------------ onglets */

function setView(name) {
  state.view = name;
  qsa(".view").forEach((node) => node.classList.toggle("is-active", node.id === `view-${name}`));
  qsa(".tab").forEach((node) => node.classList.toggle("is-active", node.dataset.view === name));
  // Chaque onglet s'ouvre en haut : `#main` ne doit surtout pas defiler en
  // douceur, sinon on arrive au milieu du nouvel onglet.
  el("main").scrollTop = 0;
  // Les graphes d'une vue masquee n'ont pas de largeur mesurable : on (re)dessine
  // au moment ou la vue devient visible.
  if (name === "live") renderLive();
  if (name === "home") renderHome();
  if (name === "memory") renderMemory();
}

/* ------------------------------------------------------- jauges et aiguilles */

function polar(frac, r, center) {
  const angle = Math.PI * (1 - Math.min(1, Math.max(0, frac)));
  return [center.x + r * Math.cos(angle), center.y - r * Math.sin(angle)];
}

const arc = (from, to, r, center) => {
  const [x0, y0] = polar(from, r, center);
  const [x1, y1] = polar(to, r, center);
  return `M${x0.toFixed(1)} ${y0.toFixed(1)} A${r} ${r} 0 0 1 ${x1.toFixed(1)} ${y1.toFixed(1)}`;
};

function buildLiveGauge() {
  const svg = el("gauge");
  if (!svg) return;
  const c = LIVE_CENTER;
  const span = LIVE_HI - LIVE_LO;
  const frac = (v) => (v - LIVE_LO) / span;
  const parts = [`<path d="${arc(0, 1, c.r, c)}" fill="none" stroke="var(--surface-2)" stroke-width="14" stroke-linecap="round"/>`];
  parts.push(`<path id="gauge-fill" d="${arc(0, 0.001, c.r, c)}" fill="none" stroke="var(--accent)" stroke-width="14" stroke-linecap="round"/>`);
  // Graduations tous les 20 dB.
  for (let v = 30; v <= 130; v += 20) {
    const [x1, y1] = polar(frac(v), c.r - 21, c);
    const [x2, y2] = polar(frac(v), c.r - 27, c);
    parts.push(`<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="var(--text-muted)" stroke-width="1.6"/>`);
    const [tx, ty] = polar(frac(v), c.r - 40, c);
    parts.push(`<text x="${tx.toFixed(1)}" y="${ty.toFixed(1)}" fill="var(--text-muted)" font-size="10" text-anchor="middle" dominant-baseline="middle">${v}</text>`);
  }
  // Repères d'alarme (mis à jour par renderLive).
  parts.push(`<line id="gauge-low" x1="0" y1="0" x2="0" y2="0" stroke="var(--accent)" stroke-width="3" stroke-linecap="round"/>`);
  parts.push(`<line id="gauge-high" x1="0" y1="0" x2="0" y2="0" stroke="var(--red)" stroke-width="3" stroke-linecap="round"/>`);
  parts.push(`<line id="gauge-needle" x1="${c.x}" y1="${c.y}" x2="${c.x}" y2="${c.y - c.r + 12}" stroke="var(--text)" stroke-width="2.6" stroke-linecap="round"/>`);
  parts.push(`<circle cx="${c.x}" cy="${c.y}" r="7" fill="var(--text)"/>`);
  svg.innerHTML = parts.join("");
}

function buildBaro() {
  const svg = el("home-gauge");
  if (!svg) return;
  const c = BARO_CENTER;
  const span = A.HOME_HI - A.HOME_LO;
  const frac = (v) => (Math.min(A.HOME_HI, Math.max(A.HOME_LO, v)) - A.HOME_LO) / span;
  const parts = [];
  let from = A.HOME_LO;
  const zones = HZ();
  zones.forEach((zone, i) => {
    const ends = i === 0 || i === zones.length - 1 ? ' stroke-linecap="round"' : "";
    parts.push(
      `<path d="${arc(frac(from), frac(zone.to), c.r, c)}" fill="none" stroke="${zone.color}" stroke-width="13" opacity=".85"${ends}/>`
    );
    from = zone.to;
  });
  for (const v of [A.HOME_LO, ...homeT(), A.HOME_HI]) {
    const [tx, ty] = polar(frac(v), c.r + 16, c);
    const x = Math.min(212, Math.max(8, tx));
    parts.push(
      `<text x="${x.toFixed(1)}" y="${ty.toFixed(1)}" fill="var(--text-muted)" font-size="10" text-anchor="middle" dominant-baseline="middle">${v}</text>`
    );
  }
  parts.push(`<line id="baro-needle" x1="${c.x}" y1="${c.y}" x2="${c.x}" y2="${c.y - c.r + 10}" stroke="var(--text)" stroke-width="2.6" stroke-linecap="round"/>`);
  parts.push(`<circle cx="${c.x}" cy="${c.y}" r="7" fill="var(--text)"/>`);
  svg.innerHTML = parts.join("");
}

function updateBaro(value) {
  const needle = el("baro-needle");
  if (!needle || value === null || value === undefined) return;
  const frac = (Math.min(A.HOME_HI, Math.max(A.HOME_LO, value)) - A.HOME_LO) / (A.HOME_HI - A.HOME_LO);
  const [x, y] = polar(frac, BARO_CENTER.r - 10, BARO_CENTER);
  needle.setAttribute("x2", x.toFixed(1));
  needle.setAttribute("y2", y.toFixed(1));
}

/* -------------------------------------------------------------------- reçus */

function ingest(record, { at = Date.now(), count = true } = {}) {
  record._t = at;
  state.live.push(record);
  if (state.live.length > MAX_POINTS + 200) state.live = state.live.slice(-MAX_POINTS);
  if (count) state.liveStats = A.computeStats(state.live);
  state.haveMeasurement = true;

  if (state.liveRunning && Number(record.value) > HOME_RED) {
    dose.add(Math.max(0.2, Number(settings.interval) || 1));
  }
  if (nap.active && Number(record.value) > homeT()[1]) nap.lastPeak = Date.now();

  alarm.check(record, {
    enabled: settings.soundEnabled,
    highAlarm: settings.highAlarm,
    lowAlarm: settings.lowAlarm,
  });

  renderLive();
  renderHome();
  if (state.view === "home") renderNap();
}

/* ------------------------------------------------------------------ graphes */

function drawChart(canvas, records, { redFrom = null, redTo = null } = {}) {
  if (!canvas) return;
  if (!canvas.clientWidth) {
    // Vue masquee : rien a dessiner, mais on efface pour rester propre.
    canvas.dataset.pending = "1";
    return;
  }
  canvas.dataset.pending = "";
  if (!records.length) {
    const ctx = canvas.getContext("2d");
    if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    return;
  }
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const cssW = canvas.clientWidth;
  // La hauteur vient de la feuille de style, jamais de l'attribut `height` :
  // ecrire `canvas.height` reecrit cet attribut, et le relire au tour suivant
  // faisait doubler le graphe a chaque mesure.
  const cssH = canvas.clientHeight || 140;
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);

  const values = records.map((r) => Number(r.value));
  let lo = Math.floor(Math.min(...values) - 3);
  let hi = Math.ceil(Math.max(...values) + 3);
  if (hi - lo < 20) {
    const mid = (hi + lo) / 2;
    lo = Math.floor(mid - 10);
    hi = Math.ceil(mid + 10);
  }
  lo = Math.max(0, lo);
  hi = Math.min(140, hi);

  const padL = 26;
  const padR = 6;
  const padT = 8;
  const padB = 16;
  const plotW = cssW - padL - padR;
  const plotH = cssH - padT - padB;
  const xOf = (i) => padL + (records.length === 1 ? plotW / 2 : (i / (records.length - 1)) * plotW);
  const yOf = (v) => padT + plotH - ((v - lo) / (hi - lo)) * plotH;

  const css = getComputedStyle(document.documentElement);
  const border = css.getPropertyValue("--border").trim() || "#263353";
  const muted = css.getPropertyValue("--text-muted").trim() || "#93a3c4";
  const accent = css.getPropertyValue("--accent").trim() || "#38bdf8";

  // Zone rouge (> 75 dB)
  if (redFrom !== null && redFrom < hi) {
    const top = yOf(Math.min(hi, redTo ?? hi));
    const bottom = yOf(redFrom);
    ctx.fillStyle = "rgba(248,113,113,.14)";
    ctx.fillRect(padL, top, plotW, bottom - top);
    ctx.strokeStyle = "rgba(248,113,113,.75)";
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(padL, bottom);
    ctx.lineTo(padL + plotW, bottom);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Grille horizontale (3 lignes) + étiquettes de valeur
  ctx.strokeStyle = border;
  ctx.fillStyle = muted;
  ctx.font = "10px system-ui, sans-serif";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  const steps = 3;
  for (let i = 0; i <= steps; i += 1) {
    const v = lo + ((hi - lo) * i) / steps;
    const y = yOf(v);
    ctx.globalAlpha = 0.55;
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(padL + plotW, y);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.fillText(v.toFixed(0), padL - 5, y);
  }

  // Courbe
  ctx.beginPath();
  records.forEach((r, i) => {
    const x = xOf(i);
    const y = yOf(Number(r.value));
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.strokeStyle = accent;
  ctx.lineWidth = 2;
  ctx.lineJoin = "round";
  ctx.stroke();

  // Dernier point
  const lastX = xOf(records.length - 1);
  const lastY = yOf(Number(records[records.length - 1].value));
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.arc(lastX, lastY, 3.4, 0, Math.PI * 2);
  ctx.fill();

  // Repères temporels
  const first = records[0];
  const last = records[records.length - 1];
  ctx.fillStyle = muted;
  ctx.textAlign = "left";
  ctx.textBaseline = "bottom";
  ctx.fillText(first.time || "", padL, cssH - 3);
  ctx.textAlign = "right";
  ctx.fillText(last.time || "", padL + plotW, cssH - 3);
}

/* ------------------------------------------------------------------ rendus */

function renderGauge(value) {
  const fill = el("gauge-fill");
  if (!fill) return;
  const c = LIVE_CENTER;
  if (value === null || value === undefined) {
    fill.setAttribute("d", arc(0, 0.001, c.r, c));
    return;
  }
  const frac = (Math.min(LIVE_HI, Math.max(LIVE_LO, value)) - LIVE_LO) / (LIVE_HI - LIVE_LO);
  fill.setAttribute("d", arc(0, Math.max(0.001, frac), c.r, c));
  fill.setAttribute("stroke", HZ()[zoneOfT(value)].color);

  const needle = el("gauge-needle");
  if (needle) {
    const [x, y] = polar(frac, c.r - 12, c);
    needle.setAttribute("x2", x.toFixed(1));
    needle.setAttribute("y2", y.toFixed(1));
  }
  for (const [id, alarmValue] of [
    ["gauge-low", settings.lowAlarm],
    ["gauge-high", settings.highAlarm],
  ]) {
    const node = el(id);
    if (!node) continue;
    const f = (Math.min(LIVE_HI, Math.max(LIVE_LO, alarmValue)) - LIVE_LO) / (LIVE_HI - LIVE_LO);
    const [x1, y1] = polar(f, c.r - 6, c);
    const [x2, y2] = polar(f, c.r + 6, c);
    node.setAttribute("x1", x1.toFixed(1));
    node.setAttribute("y1", y1.toFixed(1));
    node.setAttribute("x2", x2.toFixed(1));
    node.setAttribute("y2", y2.toFixed(1));
  }
}

function renderLive() {
  const last = state.live.length ? state.live[state.live.length - 1] : null;
  const value = last ? Number(last.value) : null;

  const big = el("live-value");
  big.textContent = value === null ? "–" : value.toFixed(1);
  big.classList.toggle("placeholder", value === null);
  big.style.color = value === null ? "" : HZ()[zoneOfT(value)].color;

  el("chip-mode").textContent = last ? last.mode : "—";
  el("chip-weight").textContent = last ? last.weighting : "—";
  el("chip-range").textContent = last ? last.rangeLabel : "—";
  el("chip-max").hidden = !last?.maxHold;
  el("chip-batt").hidden = !last?.batteryLow;
  el("chip-batt").textContent = t("live.lowbatt");

  const under = value !== null && value < settings.lowAlarm;
  const over = value !== null && value > settings.highAlarm;
  el("flag-under").textContent = t("live.under");
  el("flag-over").textContent = t("live.over");
  el("flag-under").classList.toggle("is-on", under);
  el("flag-over").classList.toggle("is-on", over);

  const s = state.liveStats || {};
  const has = Boolean(s.count);
  el("st-min").textContent = has ? fmt(s.min) : "–";
  el("st-avg").textContent = has ? fmt(s.avg) : "–";
  el("st-max").textContent = has ? fmt(s.max) : "–";
  el("st-leq").textContent = has ? fmt(s.leq) : "–";
  el("live-count").textContent = has
    ? `${s.count} ${translator.lang === "fr" ? "mesures" : "measurements"}`
    : t("live.wait");

  renderGauge(value);
  drawChart(el("chart-live"), state.live.slice(-120));
  renderRows();
}

function renderRows() {
  const node = el("live-rows");
  if (!node) return;
  const rows = state.live.slice(-40).reverse();
  if (!rows.length) {
    node.innerHTML = `<p class="muted center">${t("live.wait")}</p>`;
    return;
  }
  node.innerHTML = rows
    .map((r) => {
      const over = Number(r.value) > settings.highAlarm;
      const under = Number(r.value) < settings.lowAlarm;
      const cls = over ? " is-over" : under ? " is-under" : "";
      // Une mesure live n'a ni numero ni horodatage : on affiche l'heure du
      // recu plutot qu'un « # » orphelin.
      const stamp = r.time || (r._t ? new Date(r._t).toTimeString().slice(0, 8) : "");
      return (
        `<div class="row${cls}"><span class="when">${r.no ? `#${r.no}` : ""}</span>` +
        `<span class="val">${fmt(r.value)} dB</span>` +
        `<span class="when">${stamp}</span></div>`
      );
    })
    .join("");
}

function renderHome() {
  const last = state.live.length ? state.live[state.live.length - 1] : null;
  const lastValue = last ? Number(last.value) : null;
  const now = Date.now();

  const v1 = A.leqWindow(state.live, 1500, { now, fallback: lastValue });
  const v60 = A.leqWindow(state.live, 60000, { now, fallback: lastValue });
  el("home-laeq1s").textContent = v1 === null ? "–" : v1.toFixed(1);
  el("home-laeq1m").textContent = v60 === null ? "–" : v60.toFixed(1);

  const ref = v60 ?? v1;
  const zone = ref === null ? null : zoneOfT(ref);

  // Météo de la maison
  if (zone === null) {
    el("weather-label").textContent = "–";
    el("weather-label").style.color = "";
    el("weather-sub").textContent = t("home.wait");
    el("weather-icon").innerHTML = "";
    el("mood-label").textContent = "–";
    el("mood-dot").style.background = "var(--text-muted)";
  } else {
    el("weather-icon").innerHTML = WX_ICONS[zone];
    el("weather-label").textContent = t(`home.wx${zone}`);
    el("weather-label").style.color = HZ()[zone].color;
    el("weather-sub").textContent = t("home.moodsub", { v: ref.toFixed(1) });
    el("mood-label").textContent = t(`home.zone${zone}`);
    el("mood-dot").style.background = HZ()[zone].color;
    el("mood-dot").style.boxShadow = `0 0 0 5px ${HZ()[zone].color}33`;
  }
  qsa("#weather-strip .wx").forEach((node) => {
    node.classList.toggle("is-active", zone !== null && Number(node.dataset.zone) === zone);
  });

  updateBaro(lastValue);

  const s = state.liveStats || {};
  const has = Boolean(s.count);
  el("hm-l10").textContent = has ? fmt(s.l10) : "–";
  el("hm-l50").textContent = has ? fmt(s.l50) : "–";
  el("hm-l90").textContent = has ? fmt(s.l90) : "–";
  el("hm-leq").textContent = has ? fmt(s.leq) : "–";
  el("home-count").textContent = has
    ? `${s.count} ${translator.lang === "fr" ? "mesures" : "measurements"}`
    : t("home.wait");

  renderTrend();
  renderCocoon();
  renderNap();

  // Dosimètre
  const sec = Math.round(dose.seconds);
  el("home-dose").textContent =
    sec >= 90 ? t("home.dosemin", { n: Math.round(sec / 60) }) : t("home.dosesec", { n: sec });

  // Conseil bienveillant
  const coach = A.coachKey(s, sec);
  el("coach-text").textContent = t(coach.key, coach.vars);
  el("coach-dot").style.background = coach.color;

  drawChart(el("chart-home"), state.live.slice(-240), { redFrom: A.HOME_RED, redTo: A.HOME_HI });
}

function renderTrend() {
  const icon = el("trend-icon");
  const text = el("trend-text");
  if (!icon || !text) return;
  const slope = A.trendSlope(state.live, { now: Date.now() });
  const kind = A.trendKind(slope);
  if (!kind) {
    icon.innerHTML = "";
    text.textContent = t("home.wait");
    return;
  }
  const key = { upFast: "home.trendUpFast", up: "home.trendUp", down: "home.trendDown", flat: "home.trendFlat" }[kind];
  icon.innerHTML = TREND_SVGS[kind];
  text.textContent = t(key);
}

function renderCocoon() {
  const scoreNode = el("cocoon-score");
  const c = A.cocoonScore(state.liveStats, dose.seconds);
  if (!c) {
    scoreNode.textContent = "–";
    scoreNode.style.color = "var(--text-muted)";
    el("cocoon-label").textContent = "–";
    el("cocoon-why").textContent = t("home.wait");
    return;
  }
  scoreNode.textContent = c.score;
  const band = A.cocoonBand(c.score);
  scoreNode.style.color = A.HOME_ZONES[band].color;
  el("cocoon-label").textContent = t(`home.cocoon${band}`);
  el("cocoon-why").textContent = c.worst ? t(`home.cocoonWhy${c.worst}`) : "";
}

function renderNap() {
  const btn = el("btn-nap");
  if (!btn) return;
  btn.textContent = nap.active ? t("home.napStop") : t("home.napStart");
  btn.classList.toggle("primary", !nap.active);
  if (!nap.active) {
    el("nap-line1").textContent = t("home.napIdle");
    el("nap-line2").textContent = "";
    el("nap-dot").style.background = "var(--text-muted)";
    return;
  }
  const now = Date.now();
  el("nap-line1").textContent = t("home.napElapsed", { t: fmtDuration(now - nap.start) });
  const sincePeak = nap.lastPeak ? now - nap.lastPeak : Infinity;
  if (sincePeak < 10000) {
    el("nap-line2").textContent = t("home.napPeak");
    el("nap-dot").style.background = "var(--red)";
    return;
  }
  const sec = nap.lastPeak ? Math.floor(sincePeak / 1000) : Math.floor((now - nap.start) / 1000);
  const stability = A.napStability(state.live, { now });
  el("nap-line2").textContent =
    (sec >= 90 ? t("home.napCalmMin", { n: Math.round(sec / 60) }) : t("home.napCalmSec", { n: sec })) +
    " · " +
    t("home.napStab", { p: stability === null ? "–" : stability });
  el("nap-dot").style.background = "var(--ok)";
}

function renderMemory() {
  const node = el("history-rows");
  const records = state.history;
  el("memory-count").textContent = String(records.length);
  el("memory-truncated").hidden = !state.historyTruncated;
  if (!records.length) {
    node.innerHTML = `<p class="muted center">${t("memory.empty")}</p>`;
    return;
  }
  node.innerHTML = records
    .slice(0, 500)
    .map(
      (r) =>
        `<div class="row"><span class="when">#${r.no}</span>` +
        `<span class="val">${fmt(r.value)} dB</span>` +
        `<span class="when">${r.date} ${r.time}</span></div>`
    )
    .join("");
}

/* -------------------------------------------------------------- statut/lien */

function setStatus(kind, message = "") {
  const pill = el("device-pill");
  pill.classList.remove("is-online", "is-sim", "is-offline", "is-busy");
  pill.classList.add(
    kind === "online"
      ? "is-online"
      : kind === "sim" || kind === "relay"
        ? "is-sim"
        : kind === "reconnecting"
          ? "is-busy"
          : "is-offline"
  );
  el("status-text").textContent = t(`status.${kind}`);
  pill.title = message || `${t(`transport.kind.${state.transportKind}`)} — VID 64BD / PID 74E3`;
  const connected = kind === "online" || kind === "sim" || kind === "relay";
  el("conn-state").textContent = connected
    ? `${t("conn.connected")} · ${state.transportLabel || t(`transport.kind.${state.transportKind}`)}`
    : t("conn.notConnected");
  renderDiagnostics();
}

function renderDiagnostics() {
  const caps = detectCapabilities();
  const yes = t("diag.yes");
  const no = t("diag.no");
  const row = (label, value, ok = null) =>
    `<dt>${esc(label)}</dt><dd class="${ok === true ? "is-ok" : ok === false ? "is-ko" : ""}">${value}</dd>`;
  const rows = [
    row(t("diag.secure"), caps.secure ? yes : no, caps.secure),
    row(t("diag.hid"), caps.hid ? yes : no, caps.hid),
    row(t("diag.usb"), caps.usb ? yes : no, caps.usb),
    row(t("diag.bridge"), caps.bridge ? yes : no, caps.bridge),
    row(t("diag.state"), esc(state.transportLabel) || t("conn.notConnected"), state.connected),
    row(t("diag.lastError"), esc(state.lastError) || t("diag.none"), state.lastError ? false : null),
  ];
  if (state.connected && state.transportDetail) {
    rows.push(row(t("diag.link"), esc(state.transportDetail), true));
  }
  // Carte des interfaces : c'est la piece a communiquer en cas de refus.
  if (state.lastErrorDetail) {
    rows.push(
      `<dt>${esc(t("diag.ifaces"))}</dt>` +
        `<dd class="diag-map-cell"><code class="diag-map">${esc(state.lastErrorDetail)}</code></dd>`
    );
  }
  el("diag-list").innerHTML = rows.join("");
}

/* ------------------------------------------------------------ connexion USB */

/** Echappe le texte insere dans une chaine HTML. */
function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[c]);
}

const ERROR_KEYS = {
  "no-api": "error.noApi",
  "no-device": "error.noDevice",
  "no-permission": "error.noPermission",
  "no-endpoint": "error.noEndpoint",
  claim: "error.claim",
  open: "error.open",
  insecure: "error.insecure",
};

function friendlyError(err) {
  const code = err?.code;
  if (code && ERROR_KEYS[code]) return t(ERROR_KEYS[code]);
  const text = String(err?.message || err || "");
  if (/no-device|NotFoundError|No device selected/i.test(text)) return t("error.noDevice");
  if (/disponible|noApi/i.test(text)) {
    return window.isSecureContext ? t("error.noApi") : t("error.insecure");
  }
  if (/claim|Unable to claim/i.test(text)) return t("error.claim");
  if (!window.isSecureContext) return t("error.insecure");
  return text;
}

/** Memorise l'erreur et la carte des interfaces qu'elle transporte. */
function noteError(err) {
  state.lastError = friendlyError(err);
  state.lastErrorDetail = typeof err?.detail === "string" ? err.detail : "";
  return state.lastError;
}

async function disconnectTransport() {
  if (controller) {
    try {
      await controller.close();
    } catch {
      /* ignore */
    }
  }
  controller = null;
  transport = null;
  state.connected = false;
  state.liveRunning = false;
  state.transportKind = null;
  state.transportLabel = "";
  state.transportDetail = "";
  updateLiveButton();
  setStatus("offline");
}

async function connectTransport({ autoStart = false } = {}) {
  await disconnectTransport();
  let kind = settings.transport;
  if (kind === "auto") {
    const resolved = resolveAutoKind();
    if (!resolved) {
      state.lastError = window.isSecureContext ? t("error.noApi") : t("error.insecure");
      state.lastErrorDetail = "";
      showError(state.lastError);
      setStatus("offline");
      return;
    }
    kind = resolved;
  }
  try {
    transport = createTransport(kind, {
      url: settings.relayUrl,
      profile: settings.demoProfile,
      translate: t,
    });
  } catch (err) {
    noteError(err);
    showError(state.lastError);
    setStatus("offline");
    return;
  }
  state.transportKind = kind;
  state.transportLabel = t(`transport.kind.${kind}`);

  controller = new DeviceController({
    transport,
    settings: {
      interval: Number(settings.interval) || 1,
      lowAlarm: Number(settings.lowAlarm),
      highAlarm: Number(settings.highAlarm),
    },
    handlers: {
      onMeasurement: (record) => ingest(record),
      onStatus: ({ state: name, message }) => {
        if (name === "connected") state.connected = true;
        if (name === "disconnected") state.connected = false;
        setStatus(
          name === "connected" ? (transport.isSimulated ? "sim" : kind === "relay" ? "relay" : "online") : name,
          message
        );
        updateLiveButton();
      },
      onError: (err) => {
        noteError(err);
        renderDiagnostics();
      },
      onConnectError: (err) => {
        noteError(err);
        showError(state.lastError);
      },
      onLive: ({ state: name }) => {
        state.liveRunning = name === "started";
        updateLiveButton();
      },
      onSettingsWritten: ({ ok }) => {
        toast(ok ? t("toast.settingsSent") : t("toast.disconnected"), ok ? "success" : "error");
      },
      onDeviceSettings: (record) => {
        applyDeviceSettings(record);
        toast(t("toast.deviceRead"), "success");
      },
    },
  });

  const ok = await controller.connect();
  if (!ok) {
    updateLiveButton();
    renderDiagnostics();
    return;
  }
  state.transportDetail = transport.detail || "";
  el("demo-card").hidden = !transport.isSimulated;
  if (transport.mode === "stream") {
    await controller.startLive();
  } else if (autoStart && !transport.isSimulated) {
    // Appareil réel déjà branché au lancement : on cale l'interface sur son
    // état, puis l'écoute démarre d'elle-même, comme un appui sur « Démarrer ».
    await controller.readSettings().catch(() => {});
    controller.startLive();
    await acquireWakeLock();
  } else {
    // Premiere lecture : cale l'interface sur l'etat reel de l'appareil et
    // sert de test de sante de la liaison.
    controller.readSettings().catch(() => {});
  }
  renderDiagnostics();
}

function updateLiveButton() {
  const btn = el("btn-live");
  btn.textContent = state.liveRunning ? t("action.stop") : t("action.start");
  btn.classList.toggle("primary", !state.liveRunning);
  el("live-hint").textContent = state.connected ? "" : t("live.wait");
}

async function toggleLive() {
  unlockAudio();
  if (!controller) await connectTransport();
  if (!controller || !controller.connected) {
    showError(state.lastError || t("toast.disconnected"));
    return;
  }
  if (state.liveRunning) {
    controller.stopLive();
    await releaseWakeLock();
  } else {
    controller.startLive();
    await acquireWakeLock();
  }
  updateLiveButton();
}

/**
 * Enregistre le service worker (coquille hors ligne). Jamais bloquant : si le
 * navigateur refuse ou si la page n'est pas en contexte securise, l'application
 * fonctionne exactement pareil.
 *
 * Dans la coquille Android, on s'abstient : la page y est servie depuis les
 * ressources de l'APK, et un service worker interrogerait le reseau pour des
 * URL que seul le WebView sait servir. Sa mise en cache echouerait, et il
 * repondrait ensuite une erreur a chaque rechargement. La coquille n'a de
 * toute facon pas besoin de cache : elle est hors ligne par construction.
 */
function registerServiceWorker() {
  if (!("serviceWorker" in navigator) || !window.isSecureContext) return;
  if (window.BitanBridge) return;
  navigator.serviceWorker.register("sw.js").catch(() => {
    /* hors ligne indisponible : sans consequence sur la mesure */
  });
}

function startRefreshTimer() {
  if (refreshTimer) return;
  refreshTimer = setInterval(() => {
    if (nap.active) renderNap();
  }, 1000);
}

function stopRefreshTimer() {
  if (refreshTimer) clearInterval(refreshTimer);
  refreshTimer = null;
}

/* ----------------------------------------------------------- mémoire / CSV */

async function downloadHistory() {
  if (!controller?.connected) {
    toast(t("toast.disconnected"), "error");
    return;
  }
  if (controller.transport?.mode === "stream") {
    toast(t("memory.hint"), "error");
    return;
  }
  const progress = el("history-progress");
  progress.hidden = false;
  progress.value = 0;
  try {
    const records = await controller.downloadHistory({
      onProgress: ({ bytes: total }) => {
        progress.value = (total % 100) + 1;
        el("memory-progress").textContent = t("memory.progress", { n: total });
      },
    });
    state.history = records;
    state.historyTruncated = records.length > 500;
    renderMemory();
    toast(t("toast.downloaded", { n: records.length }), "success");
  } catch (err) {
    noteError(err);
    showError(state.lastError);
  } finally {
    progress.hidden = true;
    el("memory-progress").textContent = "";
  }
}

function exportCsv() {
  if (!state.history.length) {
    toast(t("toast.noData"), "error");
    return;
  }
  const lines = ["NO.;MeaValue;Weighting;Time;Date"];
  for (const r of state.history) {
    lines.push(`${r.no};${Number(r.value).toFixed(1)};${r.weighting};${r.time};${r.date}`);
  }
  const blob = new Blob([`\ufeff${lines.join("\r\n")}\r\n`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `bitan-sono-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  toast(t("toast.exported"), "success");
}

/* ----------------------------------------------------------------- réglages */

function applyDeviceSettings(record) {
  settings.deviceMode = record.mode;
  settings.deviceWeighting = record.weighting;
  settings.deviceMaxHold = record.maxHold;
  settings.deviceRange = record.range;
  saveSettings();
  syncControls();
}

function segment(sectionId, value) {
  const node = el(sectionId);
  if (!node) return;
  qsa(`#${sectionId} button`).forEach((btn) => btn.classList.toggle("is-active", btn.dataset.value === value));
}

function syncControls() {
  el("sel-transport").value = TRANSPORT_KINDS.includes(settings.transport) ? settings.transport : "auto";
  el("field-relay").hidden = settings.transport !== "relay";
  el("relay-hint").hidden = settings.transport !== "relay";
  el("inp-relay").value = settings.relayUrl;
  segment("seg-mode", settings.deviceMode);
  segment("seg-weight", settings.deviceWeighting);
  segment("seg-theme", settings.theme);
  segment("seg-lang", translator.lang);
  el("sel-range").value = String(settings.deviceRange);
  el("chk-maxhold").checked = Boolean(settings.deviceMaxHold);
  el("rng-alarm-low").value = String(settings.lowAlarm);
  el("rng-alarm-high").value = String(settings.highAlarm);
  el("alarm-low-value").textContent = String(settings.lowAlarm);
  el("alarm-high-value").textContent = String(settings.highAlarm);
  el("chk-sound").checked = Boolean(settings.soundEnabled);
  el("chk-vibrate").checked = Boolean(settings.vibrate);
  el("chk-wakelock").checked = Boolean(settings.wakeLock);
  el("rng-interval").value = String(settings.interval);
  el("interval-value").textContent = String(settings.interval);
  for (let i = 0; i < 3; i++) {
    const input = el(`set-ht${i + 1}`);
    if (input && document.activeElement !== input) input.value = String(settings.homeT[i]);
  }
}

function applyLang() {
  const pairs = [
    ["tab-live", "tab.live"],
    ["tab-home", "tab.home"],
    ["tab-memory", "tab.memory"],
    ["tab-settings", "tab.settings"],
    ["stats-title", "stats.title"],
    ["lbl-min", "stats.min"],
    ["lbl-avg", "stats.avg"],
    ["lbl-max", "stats.max"],
    ["lbl-leq", "stats.leq"],
    ["chart-live-title", "chart.live"],
    ["recent-title", "live.recent"],
    ["home-weather-title", "home.weather"],
    ["home-baro-title", "home.baro"],
    ["lbl-laeq1s", "home.leq1s"],
    ["lbl-laeq1m", "home.leq1m"],
    ["home-trend-title", "home.trend"],
    ["home-cocoon-title", "home.cocoon"],
    ["home-nap-title", "home.nap"],
    ["home-session-title", "home.session"],
    ["lbl-l10", "home.l10"],
    ["lbl-l50", "home.l50"],
    ["lbl-l90", "home.l90"],
    ["lbl-hleq", "home.leeq"],
    ["home-dose-title", "home.redzone"],
    ["home-coach-title", "home.coach"],
    ["chart-home-title", "chart.home"],
    ["memory-title", "memory.title"],
    ["memory-hint", "memory.hint"],
    ["memory-count-title", "memory.count"],
    ["memory-truncated", "memory.truncated"],
    ["btn-history", "action.download"],
    ["btn-export-csv", "action.export"],
    ["btn-clear-history", "action.clear"],
    ["settings-title", "settings.title"],
    ["settings-connection", "settings.connection"],
    ["btn-connect", "conn.connect"],
    ["btn-disconnect", "conn.disconnect"],
    ["btn-send-device", "settings.sendtodevice"],
    ["btn-read-device", "settings.readfromdevice"],
    ["btn-test-sound", "settings.soundTest"],
    ["lbl-transport", "settings.transport"],
    ["lbl-relay", "relay.url"],
    ["relay-hint", "relay.hint"],
    ["settings-diagnostics", "settings.diagnostics"],
    ["settings-device", "settings.device"],
    ["lbl-response", "settings.response"],
    ["lbl-weighting", "settings.weighting"],
    ["lbl-range", "settings.range"],
    ["lbl-maxhold", "settings.maxhold"],
    ["settings-alarms", "settings.alarms"],
    ["lbl-alarm-low", "settings.alarmLow"],
    ["lbl-alarm-high", "settings.alarmHigh"],
    ["lbl-sound", "settings.sound"],
    ["lbl-vibrate", "settings.vibrate"],
    ["lbl-vibrate-hint", "settings.vibrateHint"],
    ["settings-zones", "settings.zones"],
    ["zones-hint", "settings.zonesHint"],
    ["btn-reset-zones", "settings.resetZones"],
    ["settings-app", "settings.app"],
    ["lbl-interval", "settings.interval"],
    ["lbl-theme", "settings.theme"],
    ["lbl-language", "settings.language"],
    ["lbl-wakelock", "settings.wakelock"],
    ["lbl-wakelock-hint", "settings.wakelockHint"],
    ["settings-otg", "settings.otg"],
    ["otg-hint", "settings.otgHint"],
    ["settings-about", "settings.about"],
    ["about-body", "about.body"],
    ["demo-title", "demo.hint"],
  ];
  for (const [id, key] of pairs) {
    const node = el(id);
    if (node) node.textContent = t(key);
  }
  // Le titre « Maison+ » reste un libellé de section, pas une clef de traduction.
  el("home-plus-title").textContent = "Maison+";
  document.documentElement.lang = translator.lang;
  const themeButtons = qsa("#seg-theme button");
  if (themeButtons[0]) themeButtons[0].textContent = t("settings.themeDark");
  if (themeButtons[1]) themeButtons[1].textContent = t("settings.themeLight");
  const transportNames = {
    auto: t("transport.auto"),
    hid: t("transport.hid"),
    usb: t("transport.usb"),
    relay: t("transport.relay"),
    sim: t("transport.sim"),
  };
  qsa("#sel-transport option").forEach((opt) => {
    opt.textContent = transportNames[opt.value] || opt.textContent;
  });
  buildWeatherStrip();
  buildHomeThresholdRows();
  el("banner-insecure").textContent = t("warn.insecure");
  el("banner-error-close").setAttribute("aria-label", t("action.close"));
  updateLiveButton();
  renderLive();
  renderHome();
  renderMemory();
  renderDiagnostics();
}

function buildWeatherStrip() {
  const strip = el("weather-strip");
  if (!strip) return;
  strip.innerHTML = WX_ICONS.map(
    (svg, zone) =>
      `<div class="wx" data-zone="${zone}">${svg}<strong>${t(`home.wx${zone}`)}</strong>` +
      `<span>${A.wxRanges(homeT())[zone]}</span></div>`
  ).join("");
}

/* ------------------------------------------------------------------ seuils */

/* Seuils des zones, comme la maquette : 3 nombres pour 4 météos, ordre
   imposé par les bornes, aperçu en direct. Les lignes sont reconstruites
   à chaque changement de langue (les noms de météos sont traduits). */
function buildHomeThresholdRows() {
  const box = el("set-zones");
  if (!box) return;
  box.innerHTML = "";
  for (let i = 0; i < 3; i++) {
    box.insertAdjacentHTML(
      "beforeend",
      `<div class="thr-row">` +
        `<span class="thr-side">${WX_ICONS[i]}<b>${t(`home.wx${i}`)}</b></span>` +
        `<span class="thr-step"><button type="button" data-i="${i}" data-step="-1" aria-label="${t("settings.threshold", { n: i + 1 })} −">−</button>` +
        `<input inputmode="numeric" id="set-ht${i + 1}" value="${settings.homeT[i]}" aria-label="${t("settings.threshold", { n: i + 1 })}">` +
        `<span class="unit">dB</span>` +
        `<button type="button" data-i="${i}" data-step="1" aria-label="${t("settings.threshold", { n: i + 1 })} +">+</button></span>` +
        `<span class="thr-side thr-right"><b>${t(`home.wx${i + 1}`)}</b>${WX_ICONS[i + 1]}</span></div>`
    );
  }
  box.querySelectorAll("button[data-step]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const i = Number(btn.dataset.i);
      settings.homeT[i] += Number(btn.dataset.step);
      settings.homeT = A.sanitizeHomeT(settings.homeT);
      saveSettings();
      syncThresholdInputs();
      refreshHomeZones();
    });
  });
  box.querySelectorAll("input").forEach((input, i) => {
    input.addEventListener("change", () => {
      settings.homeT[i] = Number(input.value);
      settings.homeT = A.sanitizeHomeT(settings.homeT);
      saveSettings();
      input.value = String(settings.homeT[i]);
      syncThresholdInputs();
      refreshHomeZones();
    });
  });
  syncThresholdInputs();
}

function syncThresholdInputs() {
  const preview = el("set-zones-preview");
  for (let i = 0; i < 3; i++) {
    const input = el(`set-ht${i + 1}`);
    if (!input) continue;
    // L'ordre est imposé par les bornes : pas de trou, pas de chevauchement.
    input.min = i > 0 ? settings.homeT[i - 1] + 1 : A.HOME_LO + 1;
    input.max = i < 2 ? settings.homeT[i + 1] - 1 : A.HOME_HI - 1;
    if (document.activeElement !== input) input.value = String(settings.homeT[i]);
  }
  if (!preview) return;
  const b = [A.HOME_LO, ...settings.homeT, A.HOME_HI];
  const colors = HZ().map((z) => z.color);
  let html = "";
  for (let z = 0; z < 4; z++) {
    const w = (((b[z + 1] - b[z]) / (A.HOME_HI - A.HOME_LO)) * 100).toFixed(2);
    const label = z === 0 ? `< ${b[1]}` : z === 3 ? `> ${b[3]}` : `${b[z]}–${b[z + 1]}`;
    html +=
      `<span class="zseg" style="width:${w}%;background:${colors[z]}22;border-color:${colors[z]}">` +
      `<span class="zlab">${label}</span></span>`;
  }
  preview.innerHTML = html;
}

function refreshHomeZones() {
  buildWeatherStrip();
  buildBaro();
  renderHome();
}

function applyTheme() {
  document.documentElement.dataset.theme = settings.theme === "light" ? "light" : "dark";
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", settings.theme === "light" ? "#f3f6fc" : "#0b1120");
}

function buildDemoProfiles() {
  const node = el("demo-profiles");
  if (!node) return;
  node.innerHTML = Object.keys(DEMO_PROFILES)
    .map(
      (key) =>
        `<button type="button" class="btn${settings.demoProfile === key ? " primary" : ""}" data-profile="${key}">${t(
          DEMO_PROFILES[key].label
        )}</button>`
    )
    .join("");
}

/* ------------------------------------------------------------------ câblage */

function wire() {
  qsa(".tab").forEach((btn) => btn.addEventListener("click", () => setView(btn.dataset.view)));
  el("device-pill").addEventListener("click", () => setView("settings"));
  el("btn-live").addEventListener("click", toggleLive);

  el("seg-mode").addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    settings.deviceMode = btn.dataset.value;
    saveSettings();
    syncControls();
  });
  el("seg-weight").addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    settings.deviceWeighting = btn.dataset.value;
    saveSettings();
    syncControls();
  });
  el("seg-theme").addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    settings.theme = btn.dataset.value;
    saveSettings();
    applyTheme();
    syncControls();
  });
  el("seg-lang").addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    settings.language = translator.setLang(btn.dataset.value);
    saveSettings();
    applyLang();
    syncControls();
    buildDemoProfiles();
  });

  el("sel-transport").addEventListener("change", (e) => {
    settings.transport = e.target.value;
    saveSettings();
    syncControls();
  });
  el("inp-relay").addEventListener("change", (e) => {
    settings.relayUrl = e.target.value.trim();
    saveSettings();
  });
  el("sel-range").addEventListener("change", (e) => {
    settings.deviceRange = Number(e.target.value);
    saveSettings();
  });
  el("chk-maxhold").addEventListener("change", (e) => {
    settings.deviceMaxHold = e.target.checked;
    saveSettings();
  });

  el("btn-connect").addEventListener("click", () => {
    unlockAudio();
    settings.transport = el("sel-transport").value;
    settings.relayUrl = el("inp-relay").value.trim();
    saveSettings();
    connectTransport();
  });
  el("btn-disconnect").addEventListener("click", () => disconnectTransport());

  el("btn-send-device").addEventListener("click", async () => {
    if (!controller?.connected) {
      toast(t("toast.disconnected"), "error");
      return;
    }
    await controller.writeSettings({
      mode: settings.deviceMode,
      maxHold: settings.deviceMaxHold,
      weighting: settings.deviceWeighting,
      rangeIndex: Number(settings.deviceRange),
    });
  });
  el("btn-read-device").addEventListener("click", async () => {
    if (!controller?.connected) {
      toast(t("toast.disconnected"), "error");
      return;
    }
    if (controller.transport?.mode === "stream") {
      await controller.transport.readSettings?.();
      return;
    }
    await controller.readSettings();
  });

  el("rng-alarm-low").addEventListener("input", (e) => {
    settings.lowAlarm = Number(e.target.value);
    el("alarm-low-value").textContent = String(settings.lowAlarm);
    saveSettings();
    renderLive();
  });
  el("rng-alarm-high").addEventListener("input", (e) => {
    settings.highAlarm = Number(e.target.value);
    el("alarm-high-value").textContent = String(settings.highAlarm);
    saveSettings();
    renderLive();
  });
  el("rng-interval").addEventListener("input", (e) => {
    settings.interval = Number(e.target.value);
    el("interval-value").textContent = String(settings.interval);
    if (controller) controller.settings.interval = settings.interval;
    saveSettings();
  });
  el("chk-sound").addEventListener("change", (e) => {
    settings.soundEnabled = e.target.checked;
    saveSettings();
    if (e.target.checked) unlockAudio();
  });
  el("chk-vibrate").addEventListener("change", (e) => {
    settings.vibrate = e.target.checked;
    saveSettings();
    if (e.target.checked) vibrateAlarm();
  });
  el("chk-wakelock").addEventListener("change", (e) => {
    settings.wakeLock = e.target.checked;
    saveSettings();
    if (settings.wakeLock && state.liveRunning) acquireWakeLock();
    else releaseWakeLock();
  });
  el("btn-test-sound").addEventListener("click", () => {
    unlockAudio();
    const wasEnabled = settings.soundEnabled;
    settings.soundEnabled = true;
    playAlarm("high");
    settings.soundEnabled = wasEnabled;
  });
  el("btn-reset-zones").addEventListener("click", () => {
    settings.homeT = [...A.DEFAULT_HOME_T];
    saveSettings();
    syncThresholdInputs();
    refreshHomeZones();
  });

  el("btn-nap").addEventListener("click", () => {
    nap.active = !nap.active;
    nap.start = Date.now();
    nap.lastPeak = 0;
    renderNap();
  });

  el("btn-history").addEventListener("click", downloadHistory);
  el("btn-export-csv").addEventListener("click", exportCsv);
  el("btn-clear-history").addEventListener("click", () => {
    state.history = [];
    state.historyTruncated = false;
    renderMemory();
    toast(t("toast.cleared"));
  });

  el("demo-profiles").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-profile]");
    if (!btn) return;
    settings.demoProfile = btn.dataset.profile;
    saveSettings();
    transport?.setProfile?.(settings.demoProfile);
    buildDemoProfiles();
  });

  el("banner-error-close").addEventListener("click", () => {
    el("banner-error").hidden = true;
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && state.liveRunning) acquireWakeLock();
  });
}

/* ------------------------------------------------------------------ démarrage */

function boot() {
  applyTheme();
  const rangeSelect = el("sel-range");
  rangeSelect.innerHTML = RANGE_LABELS.map((label, i) => `<option value="${i}">${label}</option>`).join("");
  buildLiveGauge();
  buildBaro();
  buildWeatherStrip();
  buildHomeThresholdRows();
  buildDemoProfiles();
  wire();
  syncControls();
  applyLang();

  if (!window.isSecureContext) el("banner-insecure").hidden = false;

  // Repli démo : ni passerelle native, ni API directe (page HTTP, navigateur
  // sans WebUSB). La démo est alors le seul moyen de montrer l'interface : on
  // la propose plutôt que d'afficher un vide. Dès qu'une liaison réelle existe,
  // « Automatique » reste le réglage par défaut et rien n'est imposé.
  const caps = detectCapabilities();
  if (settings.transport === "auto" && !caps.direct && !caps.bridge) {
    settings.transport = "sim";
    saveSettings();
    syncControls();
  }

  renderLive();
  renderHome();
  renderMemory();
  setStatus("offline");
  startRefreshTimer();
  registerServiceWorker();

  void connectAtBoot();
}

/* --------------------------------------------------------- démarrage direct */

/** Liaisons derrière lesquelles il y a vraiment un appareil à écouter. */
const DEVICE_KINDS = ["hid", "usb", "bridge"];

/**
 * Le sonomètre est-il déjà là ? Question posée sans rien demander à personne.
 *
 * La passerelle native interroge la liste USB du téléphone, sans autorisation
 * ni revendication d'interface. Pour WebHID et WebUSB, `getDevices()` ne rend
 * que les appareils déjà autorisés lors d'une session passée : l'appel
 * n'ouvre aucune boîte de dialogue et ne réveille donc pas l'utilisateur.
 */
async function sonometerReady(kind) {
  try {
    if (kind === "bridge") return (await window.BitanBridge?.present?.()) === true;
    const known = kind === "hid" ? await navigator.hid?.getDevices?.() : await navigator.usb?.getDevices?.();
    return Boolean(known?.length);
  } catch {
    return false;
  }
}

/**
 * Démarrage sans intervention.
 *
 * Le réglage par défaut est « Automatique » : rien ne doit être demandé quand
 * le travail peut se faire tout seul. Appareil déjà branché : on se connecte et
 * l'écoute part, comme si l'on avait appuyé sur « Démarrer » dans l'onglet
 * Direct. Appareil absent : on reste hors ligne, sans message d'erreur, et on
 * attend que l'utilisateur branche l'appareil ou appuie sur « Démarrer ».
 *
 * La démo, elle, se branche d'office — il n'y a pas d'appareil à écouter — mais
 * l'écoute reste au doigt : rien ne doit ressembler à une mesure réelle.
 */
async function connectAtBoot() {
  if (settings.transport === "sim") {
    await connectTransport();
    return;
  }
  const kind = settings.transport === "auto" ? resolveAutoKind() : settings.transport;
  if (!DEVICE_KINDS.includes(kind)) return;
  if (!(await sonometerReady(kind))) return;
  await connectTransport({ autoStart: true });
}

/* ------------------------------------------------------------------- tests */

// Point d'entrée volontairement minimal pour les tests d'interface : injecter
// une mesure, forcer un état, ou lire l'état. Ne rien exposer d'autre.
window.__bitan = {
  state,
  settings,
  translator,
  ingest: (value, at = Date.now()) => ingest(parseReadPoint(recordBytes(value)), { at }),
  ingestRecord: (record, at = Date.now()) => ingest(record, { at }),
  connect: connectTransport,
  disconnect: disconnectTransport,
  reset: () => {
    state.live = [];
    state.liveStats = {};
    state.haveMeasurement = false;
    state.history = [];
    state.historyTruncated = false;
    dose.reset();
    alarm.reset();
    renderLive();
    renderHome();
    renderMemory();
  },
  setTransport: (kind) => {
    settings.transport = kind;
    saveSettings();
    syncControls();
  },
  setView,
  render: () => {
    renderLive();
    renderHome();
    renderMemory();
  },
  alarmState: () => alarm.state,
  doseSeconds: () => dose.seconds,
  sim: {
    setProfile: (name) => transport?.setProfile?.(name),
    drop: (n) => {
      if (transport) transport.dropNext = n;
    },
  },
  capabilities: detectCapabilities,
  normalizeWsUrl,
  // Bac a sable : provoque une erreur typee pour verifier le diagnostic.
  noteError: (err) => {
    noteError(err);
    renderDiagnostics();
  },
};

/** Encode une valeur en rapport HID brut (utile aux tests). */
function recordBytes(value) {
  const raw = Math.round(Number(value) * 10) & 0xffff;
  const out = new Uint8Array(8);
  out[0] = (raw >> 8) & 0xff;
  out[1] = raw & 0xff;
  out[2] = 0;
  return out;
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}
