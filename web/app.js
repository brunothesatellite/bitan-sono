/* ==========================================================================
   bitan·sono — front-end controller
   ========================================================================== */
"use strict";

/* ------------------------------------------------------------------ i18n */
const I18N = {
  fr: {
    "app.tagline": "Sonomètre — acquisition & analyse",
    "tab.live": "Temps réel",
    "tab.import": "Import / Historique",
    "status.connecting": "Connexion…",
    "status.online": "Sonomètre connecté",
    "status.sim": "Simulateur",
    "status.offline": "Déconnecté",
    "status.reconnecting": "Reconnexion…",
    "action.settings": "Réglages",
    "action.start": "Démarrer",
    "action.stop": "Arrêter",
    "action.save": "Enregistrer",
    "action.export": "Exporter",
    "action.clear": "Effacer",
    "action.open": "Ouvrir un fichier",
    "action.download": "Lire le sonomètre",
    "action.cancel": "Annuler",
    "action.apply": "Appliquer",
    "action.close": "Fermer",
    "live.title": "Mesure temps réel",
    "live.lowbatt": "Pile faible",
    "live.under": "Sous le seuil",
    "live.over": "Au-dessus du seuil",
    "live.lowalarm": "Alarme basse",
    "live.highalarm": "Alarme haute",
    "stats.title": "Statistiques",
    "stats.avg": "Moyenne",
    "stats.min": "Minimum",
    "stats.max": "Maximum",
    "stats.leq": "Leq",
    "chart.live": "Évolution du niveau",
    "chart.level": "Niveau",
    "chart.import": "Analyse des données",
    "table.measures": "Mesures",
    "table.records": "Enregistrements",
    "import.total": "Enregistrements",
    "col.no": "N°",
    "col.value": "Valeur",
    "col.weight": "Pondération",
    "col.time": "Heure",
    "col.date": "Date",
    "settings.title": "Réglages",
    "settings.device": "Appareil",
    "settings.range": "Gamme de mesure",
    "settings.response": "Réponse",
    "settings.weighting": "Pondération",
    "settings.maxhold": "Mémoriser le maximum (MAX)",
    "settings.readfromdevice": "Lire depuis l'appareil",
    "settings.alarms": "Alarmes",
    "settings.sound": "Alerte sonore",
    "settings.app": "Application",
    "settings.interval": "Intervalle d'échantillonnage (s)",
    "about.title": "À propos",
    "about.body": "Application compagnon open-source pour le sonomètre Bitan / SKU001. Réimplémentation moderne, développée par rétro-ingénierie du protocole USB HID pour l'interopérabilité.",
    "about.license": "Licence",
    "toast.saved": "Enregistré : {path}",
    "toast.imported": "{n} enregistrements importés",
    "toast.cleared": "Données effacées",
    "toast.noData": "Aucune donnée à exporter",
    "toast.downloading": "Lecture de l'historique…",
    "toast.downloaded": "{n} enregistrements lus",
    "toast.disconnected": "Sonomètre non connecté",
    "toast.rangeInverted": "L'alarme haute doit être supérieure à l'alarme basse",
  },
  en: {
    "app.tagline": "Sound level meter — acquisition & analysis",
    "tab.live": "Real time",
    "tab.import": "Import / History",
    "status.connecting": "Connecting…",
    "status.online": "Meter connected",
    "status.sim": "Simulator",
    "status.offline": "Disconnected",
    "status.reconnecting": "Reconnecting…",
    "action.settings": "Settings",
    "action.start": "Start",
    "action.stop": "Stop",
    "action.save": "Save",
    "action.export": "Export",
    "action.clear": "Clear",
    "action.open": "Open file",
    "action.download": "Read meter",
    "action.cancel": "Cancel",
    "action.apply": "Apply",
    "action.close": "Close",
    "live.title": "Real time measurement",
    "live.lowbatt": "Low battery",
    "live.under": "Below threshold",
    "live.over": "Above threshold",
    "live.lowalarm": "Low alarm",
    "live.highalarm": "High alarm",
    "stats.title": "Statistics",
    "stats.avg": "Average",
    "stats.min": "Minimum",
    "stats.max": "Maximum",
    "stats.leq": "Leq",
    "chart.live": "Level over time",
    "chart.level": "Level",
    "chart.import": "Data analysis",
    "table.measures": "Measurements",
    "table.records": "Records",
    "import.total": "Records",
    "col.no": "No.",
    "col.value": "Value",
    "col.weight": "Weighting",
    "col.time": "Time",
    "col.date": "Date",
    "settings.title": "Settings",
    "settings.device": "Device",
    "settings.range": "Measurement range",
    "settings.response": "Response",
    "settings.weighting": "Weighting",
    "settings.maxhold": "Hold maximum (MAX)",
    "settings.readfromdevice": "Read from device",
    "settings.alarms": "Alarms",
    "settings.sound": "Audible alert",
    "settings.app": "Application",
    "settings.interval": "Sampling interval (s)",
    "about.title": "About",
    "about.body": "Open-source companion app for the Bitan / SKU001 sound level meter. A modern reimplementation built by reverse engineering the USB HID protocol for interoperability.",
    "about.license": "License",
    "toast.saved": "Saved: {path}",
    "toast.imported": "{n} records imported",
    "toast.cleared": "Data cleared",
    "toast.noData": "Nothing to export",
    "toast.downloading": "Reading history…",
    "toast.downloaded": "{n} records read",
    "toast.disconnected": "Meter not connected",
    "toast.rangeInverted": "High alarm must be above the low alarm",
  },
};

const RANGES = { 0: [30, 130], 1: [30, 80], 2: [50, 100], 3: [60, 110], 4: [80, 130] };
const MAX_ROWS = 800;
const MAX_POINTS = 900;

let lang = "fr";
const t = (key, vars) => {
  let text = (I18N[lang] && I18N[lang][key]) || I18N.fr[key] || key;
  if (vars) for (const [k, v] of Object.entries(vars)) text = text.replace(`{${k}}`, v);
  return text;
};

/* ------------------------------------------------------------------ state */
const state = {
  settings: { low_alarm: 30, high_alarm: 45, sound_enabled: false, interval: 1,
              language: "fr", theme: "dark", device_mode: "SLOW",
              device_weighting: "A", device_max_hold: false, device_range: 0 },
  connected: false, simulated: false, liveRunning: false, haveMeasurement: false,
  live: [], imported: [], liveStats: {}, importStats: {},
};

/* ---------------------------------------------------------------- helpers */
const $ = (sel) => document.querySelector(sel);
const el = (id) => document.getElementById(id);

function toast(message, kind = "") {
  const node = document.createElement("div");
  node.className = "toast " + kind;
  node.textContent = message;
  el("toasts").appendChild(node);
  setTimeout(() => { node.style.opacity = "0"; }, 3600);
  setTimeout(() => node.remove(), 4000);
}

/* ==========================================================================
   Charts
   ========================================================================== */
const chartTheme = () => (document.documentElement.dataset.theme === "dark" ? {
  text: "#8b949e", axis: "rgba(255,255,255,.09)", split: "rgba(255,255,255,.05)",
} : { text: "#64748b", axis: "rgba(15,23,42,.12)", split: "rgba(15,23,42,.06)" });

let liveChart, importChart;

function baseOption(name, extra = {}) {
  const th = chartTheme();
  return Object.assign({
    animation: false,
    grid: { left: 48, right: 20, top: 28, bottom: 34 },
    tooltip: { trigger: "axis", backgroundColor: "rgba(20,25,34,.95)",
      borderColor: "rgba(255,255,255,.15)", textStyle: { color: "#e6edf3", fontSize: 12 } },
    xAxis: { type: "category", name, nameTextStyle: { color: th.text },
      axisLine: { lineStyle: { color: th.axis } }, axisLabel: { color: th.text },
      splitLine: { show: false } },
    yAxis: { type: "value", name: "SPL (dB)", nameTextStyle: { color: th.text },
      scale: true, axisLine: { lineStyle: { color: th.axis } },
      axisLabel: { color: th.text }, splitLine: { lineStyle: { color: th.split } } },
    series: [],
  }, extra);
}

const lineSeries = (data, color = "#2dd4a7", marks = []) => ({
  type: "line", data, showSymbol: false, smooth: .18,
  lineStyle: { width: 2, color }, itemStyle: { color },
  areaStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
    { offset: 0, color: hexToRgba(color, .28) },
    { offset: 1, color: hexToRgba(color, 0) }]) },
  markLine: marks.length ? { silent: true, symbol: "none",
    data: marks.map((m) => ({ yAxis: m.value, lineStyle: { color: m.color, type: "dashed" },
      label: { formatter: m.label, color: m.color, fontSize: 10, position: "insideEndTop" } })) } : undefined,
});

function initCharts() {
  liveChart = echarts.init(el("live-chart"), null, { renderer: "canvas" });
  importChart = echarts.init(el("import-chart"), null, { renderer: "canvas" });
  liveChart.setOption(baseOption(""));
  importChart.setOption(baseOption(""));
  window.addEventListener("resize", () => { liveChart.resize(); importChart.resize(); });
}

function hexToRgba(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

function renderLiveChart() {
  if (!liveChart) return;
  const th = chartTheme();
  const data = state.live.slice(-MAX_POINTS);
  const color = state.settings.high_alarm || state.settings.low_alarm ? "#38bdf8" : "#2dd4a7";
  const marks = [
    { value: state.settings.high_alarm, color: "#ff6b6b", label: `${state.settings.high_alarm}` },
    { value: state.settings.low_alarm, color: "#f5b544", label: `${state.settings.low_alarm}` },
  ];
  const series = lineSeries(data.map((r) => r.value), color, marks);
  liveChart.setOption({
    xAxis: { data: data.map((r) => r.no), axisLabel: { color: th.text } },
    yAxis: { axisLabel: { color: th.text } },
    series: [series],
  }, { replaceMerge: ["series"] });
}

function renderImportChart() {
  if (!importChart) return;
  const th = chartTheme();
  const data = state.imported;
  if (!data.length) { importChart.setOption({ xAxis: { data: [] }, series: [] },
    { replaceMerge: ["series"] }); return; }
  const marks = [
    { value: state.settings.high_alarm, color: "#ff6b6b", label: `${state.settings.high_alarm}` },
    { value: state.settings.low_alarm, color: "#f5b544", label: `${state.settings.low_alarm}` },
  ];
  const series = lineSeries(data.map((r) => r.value), "#38bdf8", marks);
  importChart.setOption({
    xAxis: { data: data.map((r) => r.no), axisLabel: { color: th.text } },
    yAxis: { axisLabel: { color: th.text } },
    series: [series],
  }, { replaceMerge: ["series"] });
}

/* ==========================================================================
   Gauge + readout
   ========================================================================== */
const GAUGE_LEN = Math.PI * 90; // semicircle radius 90

function buildGaugeTicks() {
  const group = el("gauge-ticks");
  group.innerHTML = "";
  for (let i = 0; i <= 8; i++) {
    const frac = i / 8;
    const angle = Math.PI * (1 - frac);
    const cx = 110, cy = 118;
    const r1 = i % 2 === 0 ? 97 : 99;
    const r2 = 104;
    const x1 = cx + r1 * Math.cos(angle), y1 = cy - r1 * Math.sin(angle);
    const x2 = cx + r2 * Math.cos(angle), y2 = cy - r2 * Math.sin(angle);
    group.insertAdjacentHTML("beforeend",
      `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}"></line>`);
  }
}

function renderGauge() {
  const [lo, hi] = RANGES[state.settings.device_range] || RANGES[0];
  el("live-range").textContent = `${lo} ~ ${hi} dB`;
  el("tb-min").textContent = lo;
  el("tb-max").textContent = hi;
  const value = state.lastValue ?? lo;
  const frac = Math.max(0, Math.min(1, (value - lo) / (hi - lo)));
  const fill = el("gauge-fill");
  fill.style.strokeDasharray = `${GAUGE_LEN} ${GAUGE_LEN}`;
  fill.style.strokeDashoffset = `${GAUGE_LEN * (1 - frac)}`;

  const lowAlarm = state.settings.low_alarm, highAlarm = state.settings.high_alarm;
  const card = $(".level-card");
  card.classList.toggle("is-low", state.haveMeasurement && value < lowAlarm);
  card.classList.toggle("is-high", state.haveMeasurement && value > highAlarm);
  fill.style.stroke = value > highAlarm ? "var(--danger)"
    : value < lowAlarm ? "var(--warn)" : "var(--accent)";

  el("flag-under").classList.toggle("is-on", state.haveMeasurement && value < lowAlarm);
  el("flag-over").classList.toggle("is-on", state.haveMeasurement && value > highAlarm);

  el("tb-fill").style.width = `${frac * 100}%`;
  const mark = (node, v) => {
    node.style.left = `${Math.max(0, Math.min(1, (v - lo) / (hi - lo))) * 100}%`;
  };
  mark(el("tb-low"), lowAlarm);
  mark(el("tb-high"), highAlarm);
  el("live-low").textContent = lowAlarm;
  el("live-high").textContent = highAlarm;
}

/* ==========================================================================
   Tables
   ========================================================================== */
function rowHtml(r) {
  const value = Number(r.value);
  const cls = value > state.settings.high_alarm ? "row-high"
    : value < state.settings.low_alarm ? "row-low" : "";
  return `<tr class="${cls}" data-no="${r.no}">
    <td>${r.no}</td><td>${value.toFixed(1)}</td>
    <td>${r.weighting || "A"}</td><td>${r.time || ""}</td><td>${r.date || ""}</td></tr>`;
}

function renderTable(tbody, records, autoScroll) {
  const node = el(tbody);
  node.innerHTML = records.map(rowHtml).join("");
  if (autoScroll) {
    const scroll = node.closest(".table-scroll");
    if (scroll) scroll.scrollTop = scroll.scrollHeight;
  }
}

function appendLiveRow(record) {
  const node = el("live-rows");
  const scroll = node.closest(".table-scroll");
  const pinned = !scroll || scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight < 60;
  node.insertAdjacentHTML("beforeend", rowHtml(record));
  while (node.children.length > MAX_ROWS) node.firstElementChild.remove();
  if (pinned && scroll) scroll.scrollTop = scroll.scrollHeight;
}

/* ==========================================================================
   Statistics
   ========================================================================== */
function renderStats() {
  const s = state.liveStats || {};
  const fmt = (v) => (v === undefined || v === null ? "–" : Number(v).toFixed(1));
  el("st-avg").textContent = fmt(s.avg);
  el("st-min").textContent = fmt(s.min);
  el("st-max").textContent = fmt(s.max);
  el("st-leq").textContent = fmt(s.leq);
  el("live-count-label").textContent = `${s.count || state.live.length} ${lang === "fr" ? "mesures" : "measurements"}`;
}

function renderImportMeta() {
  const s = state.importStats || {};
  const fmt = (v) => (v === undefined || v === null ? "–" : Number(v).toFixed(1));
  el("import-count").textContent = state.imported.length;
  el("import-min").textContent = fmt(s.min);
  el("import-max").textContent = fmt(s.max);
  el("import-leq").textContent = fmt(s.leq);
}

/* ==========================================================================
   WebSocket
   ========================================================================== */
let socket, reconnectTimer, pendingHistory = false;

function connect() {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  socket = new WebSocket(`${proto}://${location.host}/ws`);

  socket.onopen = () => { setStatus("connecting"); };
  socket.onclose = () => {
    setStatus("offline");
    clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(connect, 1500);
  };
  socket.onerror = () => { try { socket.close(); } catch (_) {} };
  socket.onmessage = (event) => handle(JSON.parse(event.data));
}

const send = (payload) => {
  if (socket && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(payload));
};

function handle(msg) {
  switch (msg.type) {
    case "snapshot":
      state.settings = Object.assign(state.settings, msg.settings || {});
      state.connected = msg.connected;
      state.simulated = msg.simulated;
      state.liveRunning = msg.live_running;
      state.live = msg.live_tail || [];
      state.imported = msg.import_records || [];
      state.liveStats = msg.live_stats || {};
      applySettingsToUi();
      renderAll();
      el("about-version").textContent = "v" + msg.version;
      setStatus(state.connected ? (state.simulated ? "sim" : "online") : "offline");
      updateStartButton();
      break;
    case "status":
      state.simulated = !!msg.simulated;
      if (msg.state === "reconnecting") {
        state.connected = false;
        setStatus("reconnecting");
        toast(msg.message || t("status.reconnecting"), "warn");
        break;
      }
      state.connected = msg.state === "connected";
      setStatus(state.connected ? (state.simulated ? "sim" : "online") : "offline");
      if (!state.connected && msg.message) toast(msg.message, "error");
      break;
    case "live":
      state.liveRunning = msg.state === "started";
      updateStartButton();
      break;
    case "measurement":
      onMeasurement(msg.data, msg.stats, msg.count);
      break;
    case "device_settings":
      Object.assign(state.settings, {
        device_mode: msg.data.mode, device_weighting: msg.data.weighting,
        device_max_hold: msg.data.max_hold, device_range: msg.data.range });
      applySettingsToUi();
      renderGauge(); buildGaugeTicks();
      toast(lang === "fr" ? "Réglages lus depuis l'appareil" : "Settings read from device", "success");
      break;
    case "history_start":
      pendingHistory = true;
      el("import-progress-wrap").hidden = false;
      el("import-progress").style.width = "5%";
      toast(t("toast.downloading"));
      break;
    case "history_progress":
      el("import-progress").style.width = `${Math.min(95, 5 + msg.bytes / 30)}%`;
      break;
    case "history_done":
      pendingHistory = false;
      el("import-progress").style.width = "100%";
      setTimeout(() => { el("import-progress-wrap").hidden = true; }, 500);
      if (msg.records && msg.records.length) {
        state.imported = msg.records;
        state.importStats = computeStats(msg.records);
        renderImport();
        toast(t("toast.downloaded", { n: msg.count }), "success");
      } else {
        toast(msg.message || t("toast.noData"), "error");
      }
      break;
    case "cleared":
      if (msg.which === "live") { state.live = []; state.liveStats = {}; renderLive(); renderStats(); }
      else { state.imported = []; state.importStats = {}; renderImport(); }
      toast(t("toast.cleared"));
      break;
    case "tail":
      if (msg.which === "live") { state.live = msg.records; state.liveStats = msg.stats; }
      else { state.imported = msg.records; state.importStats = msg.stats; }
      renderAll();
      break;
    case "app_settings":
      state.settings = Object.assign(state.settings, msg.settings || {});
      applySettingsToUi();
      break;
    case "device_settings_written":
      if (msg.ok) toast(lang === "fr" ? "Réglages appliqués à l'appareil" : "Settings sent to device", "success");
      break;
    case "error":
      toast(msg.message, "error");
      break;
  }
}

function computeStats(records) {
  if (!records.length) return {};
  const values = records.map((r) => Number(r.value));
  const power = values.reduce((a, v) => a + Math.pow(10, v / 10), 0) / values.length;
  return {
    count: values.length,
    min: Math.min(...values), max: Math.max(...values),
    avg: values.reduce((a, v) => a + v, 0) / values.length,
    leq: 10 * Math.log10(power),
  };
}

function onMeasurement(record, stats, count) {
  state.live.push(record);
  if (state.live.length > MAX_POINTS + 200) state.live = state.live.slice(-MAX_POINTS);
  state.liveStats = stats || computeStats(state.live);
  state.lastValue = record.value;
  state.haveMeasurement = true;

  const value = el("live-value");
  value.classList.remove("placeholder");
  value.textContent = Number(record.value).toFixed(1);
  el("chip-mode").textContent = record.mode;
  el("chip-weight").textContent = record.weighting;
  el("chip-max").hidden = !record.max_hold;
  el("chip-batt").hidden = !record.battery_low;
  state.settings.device_range = record.range;

  renderGauge();
  appendLiveRow(record);
  renderLiveChart();
  renderStats();
  checkAlarm(record);
}

let alarmCooldown = 0;
function checkAlarm(record) {
  if (!state.settings.sound_enabled) return;
  const now = Date.now();
  if (now - alarmCooldown < 2000) return;
  let file = null;
  if (record.value > state.settings.high_alarm) file = "assets/highalarm.wav";
  else if (record.value < state.settings.low_alarm) file = "assets/lowalarm.wav";
  if (!file) return;
  alarmCooldown = now;
  const audio = el("alarm-audio");
  audio.src = file;
  audio.currentTime = 0;
  audio.play().catch(() => {});
}

/* ==========================================================================
   Rendering
   ========================================================================== */
function renderAll() {
  renderLive();
  renderImport();
  renderStats();
  renderImportMeta();
}

function renderLive() {
  renderTable("live-rows", state.live.slice(-MAX_ROWS), true);
  renderLiveChart();
}

function renderImport() {
  renderTable("import-rows", state.imported.slice(0, MAX_ROWS));
  renderImportChart();
  renderImportMeta();
}

function setStatus(kind) {
  const pill = el("device-pill");
  pill.classList.remove("is-online", "is-sim", "is-offline", "is-busy");
  const cls = kind === "online" ? "is-online"
    : kind === "sim" ? "is-sim"
    : kind === "reconnecting" ? "is-busy" : "is-offline";
  pill.classList.add(cls);
  el("status-text").textContent = t("status." + kind);
  pill.title = "VID 64BD · PID 74E3";
}

function updateStartButton() {
  const btn = el("btn-start");
  btn.textContent = state.liveRunning ? t("action.stop") : t("action.start");
  btn.classList.toggle("btn-danger", state.liveRunning);
  btn.classList.toggle("btn-primary", !state.liveRunning);
}

function applySettingsToUi() {
  const s = state.settings;
  el("set-low").value = s.low_alarm;
  el("set-high").value = s.high_alarm;
  el("set-sound").checked = !!s.sound_enabled;
  el("set-interval").value = s.interval;
  el("set-max").checked = !!s.device_max_hold;
  el("set-range").value = String(s.device_range ?? 0);
  const mode = document.querySelector(`#set-mode input[value="${s.device_mode === "FAST" ? "FAST" : "SLOW"}"]`);
  if (mode) mode.checked = true;
  const weight = document.querySelector(`#set-weight input[value="${s.device_weighting === "C" ? "C" : "A"}"]`);
  if (weight) weight.checked = true;
  el("chip-mode").textContent = s.device_mode;
  el("chip-weight").textContent = s.device_weighting;

  setLanguage(s.language === "en" ? "en" : "fr", false);
  setTheme(s.theme === "light" ? "light" : "dark", false);
}

/* ==========================================================================
   Theme / language
   ========================================================================== */
function setTheme(theme, persist = true) {
  document.documentElement.dataset.theme = theme;
  state.settings.theme = theme;
  if (persist) send({ cmd: "app.settings.set", settings: { theme } });
  if (liveChart) { renderLiveChart(); renderImportChart(); }
}

function setLanguage(next, persist = true) {
  lang = next;
  document.documentElement.lang = next;
  el("lang-code").textContent = next.toUpperCase();
  document.querySelectorAll("[data-i18n]").forEach((node) => {
    node.textContent = t(node.dataset.i18n);
  });
  document.querySelectorAll("[data-i18n-title]").forEach((node) => {
    node.title = t(node.dataset.i18nTitle);
  });
  updateStartButton();
  setStatus(state.connected ? (state.simulated ? "sim" : "online") : "offline");
  renderStats(); renderImportMeta();
  el("lang-menu").hidden = true;
  if (persist) send({ cmd: "app.settings.set", settings: { language: next } });
}

/* ==========================================================================
   File dialogs (pywebview) with browser fallback
   ========================================================================== */
async function chooseSavePath(defaultName) {
  const api = window.pywebview && window.pywebview.api;
  if (api && api.choose_save_path) return api.choose_save_path(defaultName);
  return prompt("Nom du fichier :", defaultName);
}

async function chooseOpenPath() {
  const api = window.pywebview && window.pywebview.api;
  if (api && api.choose_open_path) return api.choose_open_path();
  return prompt(lang === "fr" ? "Chemin du fichier :" : "File path:");
}

async function exportStore(which) {
  const records = which === "live" ? state.live : state.imported;
  if (!records.length) { toast(t("toast.noData"), "error"); return; }
  const stamp = new Date().toISOString().slice(0, 10);
  const name = `bitan-sono_${which}_${stamp}.xlsx`;
  const path = await chooseSavePath(name);
  if (!path) return;
  try {
    const res = await fetch("/api/export", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ which, format: path.toLowerCase().endsWith(".csv") ? "csv" : "xlsx", path }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || "export failed");
    toast(t("toast.saved", { path: data.path }), "success");
  } catch (err) { toast(String(err.message || err), "error"); }
}

async function importFile() {
  const path = await chooseOpenPath();
  if (!path) return;
  try {
    const res = await fetch("/api/import", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || "import failed");
    state.imported = data.records;
    state.importStats = computeStats(data.records);
    renderImport();
    switchView("import");
    toast(t("toast.imported", { n: data.count }), "success");
  } catch (err) { toast(String(err.message || err), "error"); }
}

/* ==========================================================================
   Wiring
   ========================================================================== */
function switchView(name) {
  document.querySelectorAll(".tab").forEach((tab) =>
    tab.classList.toggle("is-active", tab.dataset.view === name));
  document.querySelectorAll(".view").forEach((view) =>
    view.classList.toggle("is-visible", view.id === "view-" + name));
  if (liveChart) { liveChart.resize(); importChart.resize(); }
}

function setupSteppers() {
  document.querySelectorAll(".stepper").forEach((stepper) => {
    const input = el(stepper.dataset.target);
    const step = parseFloat(stepper.dataset.step || "1");
    stepper.querySelectorAll("button[data-step]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const delta = parseFloat(btn.dataset.step);
        const value = (parseFloat(input.value) || 0) + delta;
        const min = parseFloat(input.min) || 0;
        const max = parseFloat(input.max) || 200;
        input.value = Math.max(min, Math.min(max, Math.round(value * 10) / 10));
      });
    });
  });
}

function wire() {
  document.querySelectorAll(".tab").forEach((tab) =>
    tab.addEventListener("click", () => switchView(tab.dataset.view)));

  el("btn-theme").addEventListener("click", () =>
    setTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark"));

  el("btn-lang").addEventListener("click", (e) => {
    e.stopPropagation();
    el("lang-menu").hidden = !el("lang-menu").hidden;
  });
  el("lang-menu").querySelectorAll("li").forEach((item) =>
    item.addEventListener("click", () => setLanguage(item.dataset.lang)));
  document.addEventListener("click", () => { el("lang-menu").hidden = true; });

  el("btn-about").addEventListener("click", () => el("dlg-about").showModal());
  el("btn-settings").addEventListener("click", () => {
    applySettingsToUi();
    el("dlg-settings").showModal();
  });

  el("btn-start").addEventListener("click", () =>
    send({ cmd: state.liveRunning ? "live.stop" : "live.start" }));

  el("btn-clear-live").addEventListener("click", () =>
    send({ cmd: "store.clear", which: "live" }));
  el("btn-clear-import").addEventListener("click", () =>
    send({ cmd: "store.clear", which: "import" }));

  el("btn-export-live").addEventListener("click", () => exportStore("live"));
  el("btn-export-import").addEventListener("click", () => exportStore("import"));

  el("btn-download").addEventListener("click", () => send({ cmd: "history.download" }));
  el("btn-open").addEventListener("click", importFile);

  el("btn-read-settings").addEventListener("click", (e) => {
    e.preventDefault();
    send({ cmd: "device.read_settings" });
  });

  el("btn-save-settings").addEventListener("click", (e) => {
    const low = parseInt(el("set-low").value, 10);
    const high = parseInt(el("set-high").value, 10);
    if (high <= low) { e.preventDefault(); toast(t("toast.rangeInverted"), "error"); return; }
    const mode = document.querySelector("#set-mode input:checked").value;
    const weight = document.querySelector("#set-weight input:checked").value;
    send({ cmd: "device.write", mode, weighting: weight,
           max_hold: el("set-max").checked, range: parseInt(el("set-range").value, 10) });
    send({ cmd: "app.settings.set", settings: {
      low_alarm: low, high_alarm: high, sound_enabled: el("set-sound").checked,
      interval: parseFloat(el("set-interval").value) || 1 } });
    state.settings.low_alarm = low;
    state.settings.high_alarm = high;
    state.settings.sound_enabled = el("set-sound").checked;
    renderGauge();
    renderLive();
    renderImport();
    setTimeout(() => { renderGauge(); renderLive(); renderImport(); }, 250);
  });

  el("dlg-settings").addEventListener("close", applySettingsToUi);
}

/* ==========================================================================
   Boot
   ========================================================================== */
function boot() {
  try {
    initCharts();
  } catch (err) {
    console.error("charts unavailable:", err);
  }
  buildGaugeTicks();
  wire();
  setupSteppers();
  renderGauge();
  renderStats();
  renderImportMeta();
  setLanguage(state.settings.language, false);
  setTheme(state.settings.theme, false);
  connect();
}

document.addEventListener("DOMContentLoaded", boot);
