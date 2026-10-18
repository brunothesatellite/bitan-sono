/* ==========================================================================
   bitan·sono — front-end controller
   ========================================================================== */
"use strict";

/* ------------------------------------------------------------------ i18n */
const I18N = {
  fr: {
    "app.tagline": "Sonomètre — acquisition & analyse",
    "tab.live": "Temps réel",
    "tab.home": "Maison",
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
    "chart.home": "Météo de la maison",
    "home.redzone": "Zone rouge",
    "home.mood": "Ambiance du moment",
    "home.baro": "Baromètre sonore",
    "home.session": "Session en cours",
    "home.coach": "Conseil du moment",
    "home.trend": "Tendance",
    "home.trendUpFast": "Ça monte fort — préparez un temps calme",
    "home.trendUp": "Ça s'anime…",
    "home.trendFlat": "Le niveau se maintient",
    "home.trendDown": "Ça se calme — éclaircies en vue",
    "home.cocoon": "Score cocon",
    "home.cocoon0": "Cocon douillet",
    "home.cocoon1": "Cocon confortable",
    "home.cocoon2": "Cocon agité",
    "home.cocoon3": "Cocon sens dessus dessous",
    "home.cocoonWhyBg": "Ce qui pèse le plus : le bruit de fond.",
    "home.cocoonWhyRed": "Ce qui pèse le plus : le temps en zone rouge.",
    "home.cocoonWhyDyn": "Ce qui pèse le plus : les pics de bruit.",
    "home.nap": "Mode sieste",
    "home.napStart": "Démarrer la sieste",
    "home.napStop": "Arrêter",
    "home.napIdle": "Pour la sieste : lancez le mode, la carte surveille le calme.",
    "home.napElapsed": "Sieste en cours depuis {t}",
    "home.napCalmMin": "{n} min de calme",
    "home.napCalmSec": "{n} s de calme",
    "home.napPeak": "Pic à l'instant !",
    "home.napStab": "Stabilité : {p} % sous 60 dB",
    "home.weather": "Météo de la maison",
    "home.wx0": "Soleil",
    "home.wx1": "Éclaircies",
    "home.wx2": "Nuageux",
    "home.wx3": "Orage",
    "home.dose": "Temps en zone rouge (> 75 dB) aujourd'hui",
    "home.l10": "L10 · pics",
    "home.l50": "L50 · médiane",
    "home.l90": "L90 · fond",
    "home.leeq": "LAeq · total",
    "home.zone0": "Sereine",
    "home.zone1": "Vie de famille active",
    "home.zone2": "Animée — vigilance douce",
    "home.zone3": "Pic de bruit",
    "home.moodsub": "LAeq 1 min : {v} dB",
    "home.wait": "Lancez la mesure pour révéler la météo de la maison.",
    "home.dosemin": "{n} min",
    "home.dosesec": "{n} s",
    "coach.background": "Le bruit de fond (L90 à {v} dB) est un peu élevé. Pensez à éteindre les écrans ou les bruits parasites en arrière-plan.",
    "coach.peaks": "Beaucoup d'énergie dépensée (pics à {v} dB) : c'est le bon moment pour un temps calme — Legos, lecture, dessin.",
    "coach.red": "Zone rouge depuis {n} min aujourd'hui : proposez une activité posée pour faire redescendre la pression, en douceur.",
    "coach.calm": "Ambiance sereine, belle dynamique familiale. Profitez-en !",
    "coach.steady": "Niveau stable et confortable. La maison respire.",
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
    "tab.home": "Home",
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
    "chart.home": "Home weather",
    "home.redzone": "Red zone",
    "home.mood": "Current mood",
    "home.baro": "Sound barometer",
    "home.session": "Current session",
    "home.coach": "Tip of the moment",
    "home.trend": "Trend",
    "home.trendUpFast": "Rising fast — get some quiet time ready",
    "home.trendUp": "Livening up…",
    "home.trendFlat": "Level holding steady",
    "home.trendDown": "Calming down — sunny spells ahead",
    "home.cocoon": "Cocoon score",
    "home.cocoon0": "Snug cocoon",
    "home.cocoon1": "Comfy cocoon",
    "home.cocoon2": "Restless cocoon",
    "home.cocoon3": "Upside-down cocoon",
    "home.cocoonWhyBg": "Weighing most: background noise.",
    "home.cocoonWhyRed": "Weighing most: time in the red zone.",
    "home.cocoonWhyDyn": "Weighing most: noise peaks.",
    "home.nap": "Nap mode",
    "home.napStart": "Start nap",
    "home.napStop": "Stop",
    "home.napIdle": "For nap time: start the mode, the card watches over the quiet.",
    "home.napElapsed": "Napping for {t}",
    "home.napCalmMin": "{n} min of quiet",
    "home.napCalmSec": "{n} s of quiet",
    "home.napPeak": "Peak right now!",
    "home.napStab": "Stability: {p}% under 60 dB",
    "home.weather": "Home weather",
    "home.wx0": "Sunny",
    "home.wx1": "Partly cloudy",
    "home.wx2": "Cloudy",
    "home.wx3": "Storm",
    "home.dose": "Time in red zone (> 75 dB) today",
    "home.l10": "L10 · peaks",
    "home.l50": "L50 · median",
    "home.l90": "L90 · background",
    "home.leeq": "LAeq · total",
    "home.zone0": "Serene",
    "home.zone1": "Active family life",
    "home.zone2": "Lively — gentle watch",
    "home.zone3": "Noise peak",
    "home.moodsub": "LAeq 1 min: {v} dB",
    "home.wait": "Start measuring to reveal the home weather.",
    "home.dosemin": "{n} min",
    "home.dosesec": "{n} s",
    "coach.background": "Background noise (L90 at {v} dB) is a bit high. Consider switching off screens or background hum.",
    "coach.peaks": "Lots of energy spent (peaks at {v} dB): a good time for quiet play — Lego, reading, drawing.",
    "coach.red": "Red zone for {n} min today: suggest a calm activity to gently bring the pressure down.",
    "coach.calm": "Serene mood, lovely family dynamics. Enjoy it!",
    "coach.steady": "Stable, comfortable level. The house is breathing.",
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

let liveChart, importChart, homeChart;

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
  homeChart = echarts.init(el("home-chart"), null, { renderer: "canvas" });
  liveChart.setOption(baseOption(""));
  importChart.setOption(baseOption(""));
  homeChart.setOption(baseOption(""));
  window.addEventListener("resize", () => {
    liveChart.resize(); importChart.resize(); if (homeChart) homeChart.resize();
  });
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
  const fmt = (v) => (!s.count || v === undefined || v === null ? "–" : Number(v).toFixed(1));
  el("st-avg").textContent = fmt(s.avg);
  el("st-min").textContent = fmt(s.min);
  el("st-max").textContent = fmt(s.max);
  el("st-leq").textContent = fmt(s.leq);
  el("live-count-label").textContent = `${s.count || state.live.length} ${lang === "fr" ? "mesures" : "measurements"}`;
}

function renderImportMeta() {
  const s = state.importStats || {};
  const empty = !state.imported.length;
  const fmt = (v) => (empty || v === undefined || v === null ? "–" : Number(v).toFixed(1));
  el("import-count").textContent = state.imported.length;
  el("import-min").textContent = fmt(s.min);
  el("import-max").textContent = fmt(s.max);
  el("import-leq").textContent = fmt(s.leq);
}

/* ==========================================================================
   Maison — family lifestyle dashboard ("météo de la maison")
   ========================================================================== */
const HOME_LO = 30, HOME_HI = 90, HOME_RED = 75;
const HOME_ZONES = [
  { to: 55, color: "#2dd4a7" },
  { to: 65, color: "#f5b544" },
  { to: 75, color: "#fb923c" },
  { to: 90, color: "#f87171" },
];
const zoneOf = (v) => (v < 55 ? 0 : v < 65 ? 1 : v < 75 ? 2 : 3);

/* Original pastel SVG weather drawings (64x64), one per barometer zone. */
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
  WX_CLOUD("#e8eef5") + `</svg>`,
  `<svg viewBox="0 0 64 64">` + WX_CLOUD("#b9c4d4") +
  `<circle cx="30" cy="29" r="4" fill="#d3dbe6" opacity=".9"/></svg>`,
  `<svg viewBox="0 0 64 64">` + WX_CLOUD("#7d8ca3") +
  `<g stroke="#38bdf8" stroke-width="3" stroke-linecap="round">` +
  `<line x1="24" y1="48" x2="22" y2="56"/><line x1="34" y1="48" x2="32" y2="56"/></g>` +
  `<polygon points="40,42 31,54 36,54 33.5,62 43,50 38,50 41,42" fill="#ffd23f" ` +
  `stroke="#eab308" stroke-width="1.4" stroke-linejoin="round"/></svg>`,
];
const WX_RANGES = ["< 55 dB", "55 – 65 dB", "65 – 75 dB", "> 75 dB"];

function buildWeatherStrip() {
  const strip = el("weather-strip");
  if (!strip) return;
  strip.innerHTML = "";
  WX_ICONS.forEach((svg, zone) => {
    strip.insertAdjacentHTML("beforeend",
      `<div class="wx" data-zone="${zone}">${svg}<strong>${t("home.wx" + zone)}</strong>` +
      `<span>${WX_RANGES[zone]}</span></div>`);
  });
}

const dose = (() => {
  const key = "bitan-sono-redday";
  const today = () => new Date().toISOString().slice(0, 10);
  let data = { date: today(), sec: 0 };
  try {
    const raw = JSON.parse(localStorage.getItem(key) || "null");
    if (raw && raw.date === today() && typeof raw.sec === "number") data = raw;
  } catch (_) {}
  return {
    add(sec) {
      if (today() !== data.date) data = { date: today(), sec: 0 };
      data.sec += sec;
      try { localStorage.setItem(key, JSON.stringify(data)); } catch (_) {}
    },
    get seconds() {
      if (today() !== data.date) return 0;
      return data.sec;
    },
  };
})();

function homePoint(frac, r) {
  const angle = Math.PI * (1 - Math.min(1, Math.max(0, frac)));
  return [110 + r * Math.cos(angle), 118 - r * Math.sin(angle)];
}

function buildHomeGauge() {
  const zones = el("home-zones");
  if (!zones) return;
  zones.innerHTML = "";
  let from = HOME_LO;
  HOME_ZONES.forEach((zone, i) => {
    const [x0, y0] = homePoint((from - HOME_LO) / (HOME_HI - HOME_LO), 90);
    const [x1, y1] = homePoint((zone.to - HOME_LO) / (HOME_HI - HOME_LO), 90);
    const ends = (i === 0 || i === HOME_ZONES.length - 1) ? " zseg-ends" : "";
    zones.insertAdjacentHTML("beforeend",
      `<path class="zseg${ends}" d="M${x0.toFixed(1)} ${y0.toFixed(1)} ` +
      `A90 90 0 0 1 ${x1.toFixed(1)} ${y1.toFixed(1)}" stroke="${zone.color}" />`);
    from = zone.to;
  });
  const ticks = el("home-ticks");
  ticks.innerHTML = "";
  for (let v = HOME_LO; v <= HOME_HI; v += 10) {
    const [x1, y1] = homePoint((v - HOME_LO) / (HOME_HI - HOME_LO), 97);
    const [x2, y2] = homePoint((v - HOME_LO) / (HOME_HI - HOME_LO), 104);
    ticks.insertAdjacentHTML("beforeend",
      `<line class="ztick" x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" ` +
      `x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}"></line>`);
  }
  // Boundary labels sit exactly on the zone limits (no separate scale row).
  const labels = [[HOME_LO, 12, 133], [55, 81, 8], [65, 139, 8], [75, 190, 37], [HOME_HI, 208, 133]];
  for (const [value, x, y] of labels) {
    ticks.insertAdjacentHTML("beforeend",
      `<text class="zlabel" x="${x}" y="${y}">${value}</text>`);
  }
}

function leqWindow(ms, fallback) {
  const now = Date.now();
  const values = state.live.filter((r) => r._t && now - r._t <= ms).map((r) => Number(r.value));
  const use = values.length ? values : (fallback === undefined || fallback === null ? [] : [fallback]);
  if (!use.length) return null;
  const power = use.reduce((a, v) => a + Math.pow(10, v / 10), 0) / use.length;
  return 10 * Math.log10(power);
}

function renderHome() {
  if (!el("view-home")) return;
  const s0 = state.liveStats || {};
  const fmt = (v) => (!s0.count || v === undefined || v === null ? "–" : Number(v).toFixed(1));
  const last = state.live.length ? state.live[state.live.length - 1] : null;
  const lastValue = last ? Number(last.value) : null;

  const v1 = leqWindow(1500, lastValue);
  const v60 = leqWindow(60000, lastValue);
  el("home-laeq1s").textContent = fmt(v1);
  el("home-laeq1m").textContent = fmt(v60);

  // Mood of the moment, driven by the 1-minute energy average.
  const ref = v60 ?? v1;
  const moodLabel = el("mood-label"), moodSub = el("mood-sub"), moodDot = el("mood-dot");
  if (ref === null || ref === undefined) {
    moodLabel.textContent = "–";
    moodSub.textContent = t("home.wait");
    moodDot.style.background = "var(--text-muted)";
  } else {
    const zone = zoneOf(ref);
    moodLabel.textContent = t("home.zone" + zone);
    moodSub.textContent = t("home.moodsub", { v: ref.toFixed(1) });
    moodDot.style.background = HOME_ZONES[zone].color;
    moodDot.style.boxShadow = `0 0 0 5px ${HOME_ZONES[zone].color}33`;
  }

  // Needle follows the latest value on the 30–90 dB barometer.
  const needle = el("home-needle");
  if (needle && lastValue !== null) {
    const frac = (Math.min(HOME_HI, Math.max(HOME_LO, lastValue)) - HOME_LO) / (HOME_HI - HOME_LO);
    const [x2, y2] = homePoint(frac, 76);
    needle.setAttribute("x2", x2.toFixed(1));
    needle.setAttribute("y2", y2.toFixed(1));
  }

  // House weather, driven by the same 1-minute reference as the mood.
  const wxIcon = el("weather-icon"), wxLabel = el("weather-label"), wxSub = el("weather-sub");
  if (ref === null || ref === undefined) {
    wxLabel.textContent = "–";
    wxSub.textContent = t("home.wait");
  } else {
    const zone = zoneOf(ref);
    wxIcon.innerHTML = WX_ICONS[zone];
    wxLabel.textContent = t("home.wx" + zone);
    wxLabel.style.color = HOME_ZONES[zone].color;
    wxSub.textContent = t("home.moodsub", { v: ref.toFixed(1) });
  }
  document.querySelectorAll("#weather-strip .wx").forEach((node) =>
    node.classList.toggle("is-active",
      ref !== null && ref !== undefined && Number(node.dataset.zone) === zoneOf(ref)));

  // Session percentiles.
  const s = state.liveStats || {};
  el("hm-l10").textContent = fmt(s.l10);
  el("hm-l50").textContent = fmt(s.l50);
  el("hm-l90").textContent = fmt(s.l90);
  el("hm-leq").textContent = fmt(s.leq);
  el("home-count-label").textContent =
    `${s.count || state.live.length} ${lang === "fr" ? "mesures" : "measurements"}`;

  // Dosimeter: time spent above 75 dB today.
  const sec = Math.round(dose.seconds);
  el("home-dose").textContent = sec >= 90
    ? t("home.dosemin", { n: Math.round(sec / 60) })
    : t("home.dosesec", { n: sec });

  // Benevolent coaching, most specific rule first.
  const coachText = el("coach-text"), coachDot = el("coach-dot");
  let key = null, vars = {}, color = "var(--text-muted)";
  const l10 = s.l10, l90 = s.l90;
  if (s.count && l10 !== undefined && l90 !== undefined) {
    if (sec >= 600) { key = "coach.red"; vars = { n: Math.round(sec / 60) }; color = "#f87171"; }
    else if (l90 > 55) { key = "coach.background"; vars = { v: Number(l90).toFixed(1) }; color = "#f5b544"; }
    else if (l10 - l90 > 20) { key = "coach.peaks"; vars = { v: Number(l10).toFixed(1) }; color = "#fb923c"; }
    else if (l10 < 55) { key = "coach.calm"; color = "#2dd4a7"; }
    else { key = "coach.steady"; color = "#2dd4a7"; }
  } else {
    key = "home.wait";
  }
  coachText.textContent = t(key, vars);
  coachDot.style.background = color;

  renderHomeChart();
}

function renderHomeChart() {
  if (!homeChart) return;
  const th = chartTheme();
  const data = state.live.slice(-MAX_POINTS);
  homeChart.setOption({
    xAxis: { data: data.map((r) => r.no), axisLabel: { color: th.text } },
    yAxis: { axisLabel: { color: th.text } },
    series: [{
      type: "line", data: data.map((r) => r.value), showSymbol: false, smooth: .18,
      lineStyle: { width: 2, color: "#38bdf8" }, itemStyle: { color: "#38bdf8" },
      areaStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
        { offset: 0, color: "rgba(56,189,248,.28)" },
        { offset: 1, color: "rgba(56,189,248,0)" }]) },
      markArea: { silent: true, itemStyle: { color: "rgba(248,113,113,.13)" },
        data: [[{ yAxis: HOME_RED }, { yAxis: HOME_HI }]] },
      markLine: { silent: true, symbol: "none",
        data: [{ yAxis: HOME_RED, lineStyle: { color: "#f87171", type: "dashed" },
          label: { formatter: String(HOME_RED), color: "#f87171", fontSize: 10,
            position: "insideEndTop" } }] },
    }],
  }, { replaceMerge: ["series"] });
}

/* ==========================================================================
   Maison+ : tendance, score cocon, mode sieste
   ========================================================================== */
const TREND_SVGS = {
  up: `<svg viewBox="0 0 24 24" fill="none" stroke="#fb923c" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>`,
  upFast: `<svg viewBox="0 0 24 24" fill="none" stroke="#f87171" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>`,
  flat: `<svg viewBox="0 0 24 24" fill="none" stroke="#2dd4a7" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="12" x2="20" y2="12"/><polyline points="13 5 20 12 13 19"/></svg>`,
  down: `<svg viewBox="0 0 24 24" fill="none" stroke="#38bdf8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/><polyline points="17 18 23 18 23 12"/></svg>`,
};

function trendSlope() {
  // Least-squares slope (dB per minute) over the trailing 5 minutes.
  const now = Date.now();
  const pts = state.live.filter((r) => r._t && now - r._t <= 5 * 60 * 1000);
  if (pts.length < 6) return null;
  const t0 = pts[0]._t;
  let sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (const r of pts) {
    const x = (r._t - t0) / 60000, y = Number(r.value);
    sx += x; sy += y; sxx += x * x; sxy += x * y;
  }
  const n = pts.length;
  const denom = n * sxx - sx * sx;
  return denom ? (n * sxy - sx * sy) / denom : 0;
}

function renderTrend() {
  const icon = el("trend-icon"), text = el("trend-text");
  if (!icon || !text) return;
  const slope = trendSlope();
  if (slope === null) {
    icon.innerHTML = "";
    text.textContent = t("home.wait");
    return;
  }
  let kind, key;
  if (slope > 6) { kind = "upFast"; key = "home.trendUpFast"; }
  else if (slope > 2.5) { kind = "up"; key = "home.trendUp"; }
  else if (slope < -2.5) { kind = "down"; key = "home.trendDown"; }
  else { kind = "flat"; key = "home.trendFlat"; }
  icon.innerHTML = TREND_SVGS[kind];
  text.textContent = t(key);
}

function cocoonScore() {
  // 0–100 comfort index. Penalises what the family actually feels:
  // background hum, red-zone time and peak dynamics.
  const s = state.liveStats || {};
  if (!s.count || s.l90 === undefined || s.l90 === null) return null;
  const l10 = s.l10 ?? s.l90;
  const parts = [
    { key: "Bg", pts: 1.8 * Math.max(0, s.l90 - 40) },
    { key: "Red", pts: Math.min(30, (dose.seconds / 60) * 2.0) },
    { key: "Dyn", pts: 0.8 * Math.max(0, l10 - s.l90 - 15) },
  ];
  const score = Math.max(0, Math.min(100,
    Math.round(100 - parts.reduce((a, p) => a + p.pts, 0))));
  const worst = parts.reduce((a, b) => (b.pts > a.pts ? b : a));
  return { score, worst: worst.pts > 1 ? worst.key : null };
}

function renderCocoon() {
  const scoreEl = el("cocoon-score"), label = el("cocoon-label"), why = el("cocoon-why");
  if (!scoreEl) return;
  const c = cocoonScore();
  if (!c) {
    scoreEl.textContent = "–";
    label.textContent = "–";
    why.textContent = t("home.wait");
    scoreEl.style.color = "var(--text-muted)";
    return;
  }
  scoreEl.textContent = c.score;
  const band = c.score >= 80 ? 0 : c.score >= 60 ? 1 : c.score >= 40 ? 2 : 3;
  scoreEl.style.color = HOME_ZONES[band].color;
  label.textContent = t("home.cocoon" + band);
  why.textContent = !c.worst ? "" : t("home.cocoonWhy" + c.worst);
}

const nap = { active: false, start: 0, lastPeak: 0 };

function fmtDur(ms) {
  const total = Math.floor(ms / 1000);
  const mm = String(Math.floor(total / 60)).padStart(2, "0");
  const ss = String(total % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

function renderNap() {
  const btn = el("btn-nap"), line1 = el("nap-line1"),
    line2 = el("nap-line2"), dot = el("nap-dot");
  if (!btn) return;
  btn.textContent = nap.active ? t("home.napStop") : t("home.napStart");
  btn.classList.toggle("btn-primary", !nap.active);
  if (!nap.active) {
    line1.textContent = t("home.napIdle");
    line2.textContent = "";
    dot.style.background = "var(--text-muted)";
    return;
  }
  const now = Date.now();
  line1.textContent = t("home.napElapsed", { t: fmtDur(now - nap.start) });
  const sincePeak = nap.lastPeak ? now - nap.lastPeak : Infinity;
  if (sincePeak < 10000) {
    line2.textContent = t("home.napPeak");
    dot.style.background = "#f87171";
  } else {
    const sec = nap.lastPeak ? Math.floor(sincePeak / 1000) : Math.floor((now - nap.start) / 1000);
    line2.textContent = (sec >= 90 ? t("home.napCalmMin", { n: Math.round(sec / 60) })
      : t("home.napCalmSec", { n: sec })) + " · " + napStability();
    dot.style.background = "#2dd4a7";
  }
}

function napStability() {
  // Share of the trailing 10 minutes spent under 60 dB.
  const now = Date.now();
  const pts = state.live.filter((r) => r._t && now - r._t <= 10 * 60 * 1000);
  if (!pts.length) return t("home.napStab", { p: "–" });
  const calm = pts.filter((r) => Number(r.value) < 60).length;
  return t("home.napStab", { p: Math.round((100 * calm) / pts.length) });
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
      // Backfill arrival timestamps so the LAeq windows work after a reload.
      const now = Date.now();
      const step = Math.max(200, Number((msg.settings || {}).interval || 1) * 1000);
      state.live.forEach((r, i) => { r._t = now - (state.live.length - 1 - i) * step; });
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
      if (msg.which === "live") {
        state.live = []; state.liveStats = {}; renderLive(); renderStats();
        renderTrend(); renderCocoon(); renderNap();
      }
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

function percentileAsc(sorted, q) {
  if (!sorted.length) return null;
  const rank = (sorted.length - 1) * (q / 100);
  const lo = Math.floor(rank), frac = rank - lo;
  return lo + 1 >= sorted.length ? sorted[lo] : sorted[lo] + frac * (sorted[lo + 1] - sorted[lo]);
}

function computeStats(records) {
  if (!records.length) return {};
  const values = records.map((r) => Number(r.value));
  const power = values.reduce((a, v) => a + Math.pow(10, v / 10), 0) / values.length;
  const sorted = [...values].sort((a, b) => a - b);
  return {
    count: values.length,
    min: Math.min(...values), max: Math.max(...values),
    avg: values.reduce((a, v) => a + v, 0) / values.length,
    leq: 10 * Math.log10(power),
    l10: percentileAsc(sorted, 90),
    l50: percentileAsc(sorted, 50),
    l90: percentileAsc(sorted, 10),
  };
}

function onMeasurement(record, stats, count) {
  record._t = Date.now();
  state.live.push(record);
  if (state.live.length > MAX_POINTS + 200) state.live = state.live.slice(-MAX_POINTS);
  state.liveStats = stats || computeStats(state.live);
  state.lastValue = record.value;
  state.haveMeasurement = true;

  // Red-zone dosimeter: accumulate the sampling interval while measuring.
  if (state.liveRunning && Number(record.value) > HOME_RED) {
    dose.add(Math.max(0.2, Number(state.settings.interval) || 1));
  }

  // Nap mode watches for peaks above the orange zone.
  if (nap.active && Number(record.value) > 65) nap.lastPeak = Date.now();

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
  renderHome();
  renderTrend();
  renderCocoon();
  renderNap();
  checkAlarm(record);
}

/* Alarm debouncing: a lone spike must not wake the house.
   - trigger only after ALARM_NEED consecutive out-of-range samples,
   - re-arm only once back inside the thresholds by ALARM_HYST dB,
   - repeat while the condition persists: first recall after 2 s, then 10 s. */
const ALARM_NEED = 3, ALARM_HYST = 2;
const alarm = {
  high: { count: 0, nextAt: 0, first: true },
  low: { count: 0, nextAt: 0, first: true },
};
function beep(file) {
  const audio = el("alarm-audio");
  audio.src = file;
  audio.currentTime = 0;
  audio.play().catch(() => {});
}
function checkAlarm(record) {
  if (!state.settings.sound_enabled) return;
  const now = Date.now();
  const v = Number(record.value);
  const high = state.settings.high_alarm, low = state.settings.low_alarm;
  if (v > high) {
    const a = alarm.high;
    alarm.low.count = 0; alarm.low.first = true; alarm.low.nextAt = 0;
    a.count++;
    if (a.count >= ALARM_NEED && now >= a.nextAt) {
      beep("assets/highalarm.wav");
      a.nextAt = now + (a.first ? 2000 : 10000);
      a.first = false;
    }
  } else if (v < low) {
    const a = alarm.low;
    alarm.high.count = 0; alarm.high.first = true; alarm.high.nextAt = 0;
    a.count++;
    if (a.count >= ALARM_NEED && now >= a.nextAt) {
      beep("assets/lowalarm.wav");
      a.nextAt = now + (a.first ? 2000 : 10000);
      a.first = false;
    }
  } else {
    // Hysteresis band: forget only once clearly back inside.
    if (v <= high - ALARM_HYST) {
      alarm.high.count = 0; alarm.high.first = true; alarm.high.nextAt = 0;
    }
    if (v >= low + ALARM_HYST) {
      alarm.low.count = 0; alarm.low.first = true; alarm.low.nextAt = 0;
    }
  }
}

/* ==========================================================================
   Rendering
   ========================================================================== */
function renderAll() {
  renderLive();
  renderImport();
  renderStats();
  renderImportMeta();
  renderHome();
  renderTrend();
  renderCocoon();
  renderNap();
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
  if (liveChart) { renderLiveChart(); renderImportChart(); renderHomeChart(); }
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
  renderStats(); renderImportMeta(); buildWeatherStrip(); renderHome();
  renderTrend(); renderCocoon(); renderNap();
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
  if (liveChart) { liveChart.resize(); importChart.resize(); if (homeChart) homeChart.resize(); }
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

  el("btn-nap").addEventListener("click", () => {
    nap.active = !nap.active;
    nap.start = nap.active ? Date.now() : 0;
    nap.lastPeak = 0;
    renderNap();
  });

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
  buildHomeGauge();
  buildWeatherStrip();
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
