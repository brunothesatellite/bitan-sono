/* ==========================================================================
   bitan·sono mobile — analyse (module ES, sans DOM)
   --------------------------------------------------------------------------
   Memes formules que web/app.js (vue Maison) pour que les deux interfaces
   racontent exactement la meme histoire. Fonctions pures : l'horloge est
   injectable pour que les tests soient deterministes.
   ========================================================================== */

/* Zone de confort, commune au barometre et a la meteo. */
export const HOME_LO = 30;
export const HOME_HI = 90;
export const HOME_RED = 75;
export const HOME_ZONES = [
  { to: 55, color: "#2dd4a7" },
  { to: 65, color: "#f5b544" },
  { to: 75, color: "#fb923c" },
  { to: 90, color: "#f87171" },
];

export const zoneOf = (v) => (v < 55 ? 0 : v < 65 ? 1 : v < 75 ? 2 : 3);
export const WX_RANGES = ["< 55 dB", "55 – 65 dB", "65 – 75 dB", "> 75 dB"];

/** Percentile sur une serie deja triee (`q` en %, 90 -> L10). */
export function percentileAsc(sorted, q) {
  if (!sorted.length) return null;
  const rank = (sorted.length - 1) * (q / 100);
  const lo = Math.floor(rank);
  const frac = rank - lo;
  return lo + 1 >= sorted.length ? sorted[lo] : sorted[lo] + frac * (sorted[lo + 1] - sorted[lo]);
}

/** Statistiques de session : moyenne, min, max, Leq et L10/L50/L90. */
export function computeStats(records) {
  if (!records.length) return {};
  const values = records.map((r) => Number(r.value));
  const power = values.reduce((a, v) => a + Math.pow(10, v / 10), 0) / values.length;
  const sorted = [...values].sort((a, b) => a - b);
  return {
    count: values.length,
    min: Math.min(...values),
    max: Math.max(...values),
    avg: values.reduce((a, v) => a + v, 0) / values.length,
    leq: 10 * Math.log10(power),
    l10: percentileAsc(sorted, 90),
    l50: percentileAsc(sorted, 50),
    l90: percentileAsc(sorted, 10),
  };
}

/** Moyenne energetique (LAeq) sur une fenetre glissante, en ms. */
export function leqWindow(records, ms, { now = Date.now(), fallback = null } = {}) {
  const values = records
    .filter((r) => r._t && now - r._t <= ms)
    .map((r) => Number(r.value));
  const use = values.length ? values : fallback === null || fallback === undefined ? [] : [fallback];
  if (!use.length) return null;
  const power = use.reduce((a, v) => a + Math.pow(10, v / 10), 0) / use.length;
  return 10 * Math.log10(power);
}

/** Pente (dB/min) par moindres carres sur la fenetre glissante. */
export function trendSlope(records, { now = Date.now(), windowMs = 5 * 60 * 1000, minPoints = 6 } = {}) {
  const pts = records.filter((r) => r._t && now - r._t <= windowMs);
  if (pts.length < minPoints) return null;
  const t0 = pts[0]._t;
  let sx = 0;
  let sy = 0;
  let sxx = 0;
  let sxy = 0;
  for (const r of pts) {
    const x = (r._t - t0) / 60000;
    const y = Number(r.value);
    sx += x;
    sy += y;
    sxx += x * x;
    sxy += x * y;
  }
  const n = pts.length;
  const denom = n * sxx - sx * sx;
  return denom ? (n * sxy - sx * sy) / denom : 0;
}

export const TREND_KINDS = { upFast: "upFast", up: "up", flat: "flat", down: "down" };

/** Classe la tendance : ca monte fort, ca s'anime, stable, ca se calme. */
export function trendKind(slope) {
  if (slope === null) return null;
  if (slope > 6) return "upFast";
  if (slope > 2.5) return "up";
  if (slope < -2.5) return "down";
  return "flat";
}

/**
 * Score cocon 0-100 : index de confort familial.
 * Penalise ce que la famille ressent vraiment — bruit de fond, temps en zone
 * rouge, dynamique des pics.
 */
export function cocoonScore(stats, doseSeconds = 0) {
  const s = stats || {};
  if (!s.count || s.l90 === undefined || s.l90 === null) return null;
  const l10 = s.l10 ?? s.l90;
  const parts = [
    { key: "Bg", pts: 1.8 * Math.max(0, s.l90 - 40) },
    { key: "Red", pts: Math.min(30, (doseSeconds / 60) * 2.0) },
    { key: "Dyn", pts: 0.8 * Math.max(0, l10 - s.l90 - 15) },
  ];
  const score = Math.max(0, Math.min(100, Math.round(100 - parts.reduce((a, p) => a + p.pts, 0))));
  const worst = parts.reduce((a, b) => (b.pts > a.pts ? b : a));
  return { score, worst: worst.pts > 1 ? worst.key : null };
}

export const cocoonBand = (score) => (score >= 80 ? 0 : score >= 60 ? 1 : score >= 40 ? 2 : 3);

/** Part de la fenetre passee sous 60 dB (stabilite de la sieste). */
export function napStability(records, { now = Date.now(), windowMs = 10 * 60 * 1000 } = {}) {
  const pts = records.filter((r) => r._t && now - r._t <= windowMs);
  if (!pts.length) return null;
  const calm = pts.filter((r) => Number(r.value) < 60).length;
  return Math.round((100 * calm) / pts.length);
}

/** mm:ss a partir d'une duree en ms. */
export function fmtDuration(ms) {
  const total = Math.floor(ms / 1000);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

/* --------------------------------------------------------------------------
   Dosimetre « zone rouge » — cumul quotidien persiste
   -------------------------------------------------------------------------- */

export const DOSE_KEY = "bitan-sono-redday";

const pad2 = (n) => String(n).padStart(2, "0");

/** Jour civil **local** (c'est celui que la famille vit, pas celui d'UTC). */
const dayKey = (now) => {
  const d = new Date(now);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};

/**
 * Compteur de temps passe au-dessus de 75 dB, remis a zero chaque jour.
 * `storage` est injecte (localStorage en production, un faux objet en test).
 */
export function createDoseTracker({ storage = null, key = DOSE_KEY, now = () => Date.now() } = {}) {
  let data = { date: dayKey(now()), sec: 0 };
  if (storage) {
    try {
      const raw = JSON.parse(storage.getItem(key) || "null");
      if (raw && raw.date === dayKey(now()) && typeof raw.sec === "number") data = raw;
    } catch {
      /* donnees corrompues : on repart de zero */
    }
  }
  return {
    add(sec) {
      if (dayKey(now()) !== data.date) data = { date: dayKey(now()), sec: 0 };
      data.sec += sec;
      if (storage) {
        try {
          storage.setItem(key, JSON.stringify(data));
        } catch {
          /* quota / navigation privee : on continue en memoire */
        }
      }
    },
    reset() {
      data = { date: dayKey(now()), sec: 0 };
      if (storage) {
        try {
          storage.setItem(key, JSON.stringify(data));
        } catch {
          /* ignore */
        }
      }
    },
    get seconds() {
      return dayKey(now()) !== data.date ? 0 : data.sec;
    },
  };
}

/* --------------------------------------------------------------------------
   Conseil bienveillant : regle la plus specifique d'abord
   -------------------------------------------------------------------------- */

export function coachKey(stats, doseSeconds) {
  const s = stats || {};
  if (!s.count || s.l10 === undefined || s.l90 === undefined) return { key: "home.wait", vars: {}, color: "var(--text-muted)" };
  if (doseSeconds >= 600) {
    return { key: "coach.red", vars: { n: Math.round(doseSeconds / 60) }, color: "#f87171" };
  }
  if (s.l90 > 55) return { key: "coach.background", vars: { v: Number(s.l90).toFixed(1) }, color: "#f5b544" };
  if (s.l10 - s.l90 > 20) return { key: "coach.peaks", vars: { v: Number(s.l10).toFixed(1) }, color: "#fb923c" };
  if (s.l10 < 55) return { key: "coach.calm", vars: {}, color: "#2dd4a7" };
  return { key: "coach.steady", vars: {}, color: "#2dd4a7" };
}
