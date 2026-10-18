/* ==========================================================================
   Analyse mobile — formules de la vue Maison

   Les valeurs de référence de ce fichier ont été calculées à la main ou en
   Python, jamais en relisant l'implémentation testée.
   ========================================================================== */

import assert from "node:assert/strict";
import test from "node:test";

import * as A from "../analysis.js";

const close = (actual, expected, digits = 6) =>
  assert.ok(
    Math.abs(actual - expected) < 10 ** -digits,
    `attendu ${expected}, obtenu ${actual}`
  );

const at = (seconds) => new Date(2026, 0, 1, 12, 0, 0).getTime() + seconds * 1000;

/** Série factice avec horodatage, une mesure par seconde. */
const series = (values, stepMs = 1000, endMs = 0) =>
  values.map((value, index) => ({
    value,
    _t: endMs - (values.length - 1 - index) * stepMs,
    time: "12:00:00",
    date: "2026-01-01",
  }));

test("les zones de confort basculent aux bonnes bornes", () => {
  assert.equal(A.zoneOf(54.9), 0);
  assert.equal(A.zoneOf(55), 1);
  assert.equal(A.zoneOf(64.9), 1);
  assert.equal(A.zoneOf(65), 2);
  assert.equal(A.zoneOf(74.9), 2);
  assert.equal(A.zoneOf(75), 3);
  assert.equal(A.HOME_LO, 30);
  assert.equal(A.HOME_HI, 90);
  assert.equal(A.HOME_RED, 75);
});

test("percentileAsc interpole comme la vue Maison du bureau", () => {
  const sorted = [30, 40, 46.7, 50, 55, 60, 70, 80];
  close(A.percentileAsc(sorted, 90), 73);
  close(A.percentileAsc(sorted, 50), 52.5);
  close(A.percentileAsc(sorted, 10), 37);
  assert.equal(A.percentileAsc([], 50), null);
  assert.equal(A.percentileAsc([42], 50), 42);
});

test("computeStats reproduit moyenne, extrêmes, Leq et L10/L50/L90", () => {
  const stats = A.computeStats(series([40, 50, 60, 46.7, 55, 70, 30, 80]));
  assert.equal(stats.count, 8);
  assert.equal(stats.min, 30);
  assert.equal(stats.max, 80);
  close(stats.avg, 53.9625);
  close(stats.leq, 71.44083603108287);
  close(stats.l10, 73);
  close(stats.l50, 52.5);
  close(stats.l90, 37);
  assert.deepEqual(A.computeStats([]), {});
});

test("leqWindow ne regarde que la fenêtre demandée et retombe sur la dernière valeur", () => {
  const now = at(300);
  const records = series([30, 30, 80, 80, 80], 60000, now); // -4 min … maintenant
  // Fenêtre de 60 s : seul le dernier point reste.
  close(A.leqWindow(records, 60000, { now }), 80);
  // Fenêtre de 2 min : les trois derniers.
  close(A.leqWindow(records, 120000, { now }), 80);
  // Aucun point dans la fenêtre : on retombe sur la valeur de repli.
  assert.equal(A.leqWindow([], 60000, { now, fallback: 42.5 }), 42.5);
  assert.equal(A.leqWindow([], 60000, { now }), null);
});

test("leqWindow combine deux niveaux selon la moyenne énergétique", () => {
  const now = at(10);
  const records = [
    { value: 40, _t: now - 5000 },
    { value: 50, _t: now - 1000 },
  ];
  // 10*log10((10^4 + 10^5)/2)
  close(A.leqWindow(records, 60000, { now }), 47.4036269, 6);
});

test("trendSlope retrouve une pente linéaire et rien du tout en dessous du seuil", () => {
  const now = at(300);
  const rising = series([40, 42, 44, 46, 48, 50], 60000, now);
  close(A.trendSlope(rising, { now }), 2);

  const falling = series([60, 58, 56, 54, 52, 50], 60000, now);
  close(A.trendSlope(falling, { now }), -2);

  // Trop peu de points : la tendance n'est pas affirmée.
  assert.equal(A.trendSlope(rising.slice(0, 3), { now }), null);
  // Points trop anciens : hors fenêtre.
  assert.equal(A.trendSlope(series([40, 42, 44, 46, 48, 50], 60000, now - 600000), { now }), null);
});

test("trendKind classe la tendance sur les seuils 2,5 et 6 dB/min", () => {
  assert.equal(A.trendKind(7), "upFast");
  assert.equal(A.trendKind(6.01), "upFast");
  assert.equal(A.trendKind(3), "up");
  assert.equal(A.trendKind(2.5), "flat");
  assert.equal(A.trendKind(0), "flat");
  assert.equal(A.trendKind(-2.6), "down");
  assert.equal(A.trendKind(null), null);
});

test("cocoonScore note le confort et sait dire ce qui pèse", () => {
  // Fond sous 40 dB, aucune zone rouge : cocon parfait.
  const quiet = A.cocoonScore({ count: 10, l10: 38, l50: 36, l90: 34 }, 0);
  assert.equal(quiet.score, 100);
  assert.equal(quiet.worst, null);
  assert.equal(A.cocoonBand(quiet.score), 0);

  // Fond à 45 dB et dynamique de 25 dB : 100 - 9 - 8 = 83.
  const lively = A.cocoonScore({ count: 10, l10: 70, l50: 50, l90: 45 }, 0);
  assert.equal(lively.score, 83);
  assert.equal(lively.worst, "Bg");
  assert.equal(A.cocoonBand(83), 0);

  // Dix minutes en zone rouge pèsent le plus lourd : 100 - 9 - 20 = 71.
  const redDay = A.cocoonScore({ count: 10, l10: 60, l50: 50, l90: 45 }, 600);
  assert.equal(redDay.score, 71);
  assert.equal(redDay.worst, "Red");
  assert.equal(A.cocoonBand(71), 1);

  // Le score ne descend jamais sous zéro.
  assert.equal(A.cocoonScore({ count: 10, l10: 95, l50: 90, l90: 90 }, 3600).score, 0);
  assert.equal(A.cocoonBand(0), 3);

  assert.equal(A.cocoonScore({ count: 0 }, 0), null);
});

test("napStability mesure la part de temps sous 60 dB", () => {
  const now = at(10);
  const records = series([50, 55, 59, 65, 70, 45, 48, 52, 58, 61], 1000, now);
  // 70 % des points sont sous 60 dB.
  assert.equal(A.napStability(records, { now }), 70);
  assert.equal(A.napStability([], { now }), null);
});

test("fmtDuration affiche mm:ss", () => {
  assert.equal(A.fmtDuration(0), "00:00");
  assert.equal(A.fmtDuration(65_000), "01:05");
  assert.equal(A.fmtDuration(3_599_000), "59:59");
});

test("le conseil suit un ordre de priorite precis", () => {
  assert.equal(A.coachKey({}, 0).key, "home.wait");
  assert.equal(A.coachKey({ count: 5, l10: 50, l90: 40 }, 600).key, "coach.red");
  assert.equal(A.coachKey({ count: 5, l10: 60, l90: 56 }, 0).key, "coach.background");
  assert.equal(A.coachKey({ count: 5, l10: 75, l90: 50 }, 0).key, "coach.peaks");
  assert.equal(A.coachKey({ count: 5, l10: 50, l90: 40 }, 0).key, "coach.calm");
  assert.equal(A.coachKey({ count: 5, l10: 60, l90: 52 }, 0).key, "coach.steady");
  assert.equal(A.coachKey({ count: 5, l10: 50, l90: 40 }, 900).vars.n, 15);
});

test("le dosimetre cumule, persiste et repart a zero chaque jour", () => {
  const store = new Map();
  const storage = {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, value),
  };
  let clock = new Date(2026, 0, 1, 23, 59, 0).getTime();

  const dose = A.createDoseTracker({ storage, now: () => clock });
  dose.add(30);
  dose.add(30);
  assert.equal(dose.seconds, 60);

  // Nouvelle instance : le cumul est relu depuis le stockage.
  assert.equal(A.createDoseTracker({ storage, now: () => clock }).seconds, 60);

  // Passage de minuit : le compteur du jour repart de zéro.
  clock = new Date(2026, 0, 2, 0, 1, 0).getTime();
  assert.equal(dose.seconds, 0);
  dose.add(10);
  assert.equal(dose.seconds, 10);

  dose.reset();
  assert.equal(dose.seconds, 0);
});

test("le dosimetre survit a un stockage deffectueux", () => {
  const storage = {
    getItem: () => "{ pas du json",
    setItem: () => {
      throw new Error("quota");
    },
  };
  const dose = A.createDoseTracker({ storage, now: () => at(0) });
  dose.add(5);
  assert.equal(dose.seconds, 5);
});

test("les seuils configurables deplacent les zones", () => {
  const t = [50, 62, 78];
  assert.equal(A.zoneOf(49.9, t), 0);
  assert.equal(A.zoneOf(50, t), 1);
  assert.equal(A.zoneOf(61.9, t), 1);
  assert.equal(A.zoneOf(62, t), 2);
  assert.equal(A.zoneOf(77.9, t), 2);
  assert.equal(A.zoneOf(78, t), 3);
  // Sans seuils, les défauts historiques s'appliquent.
  assert.equal(A.zoneOf(55), 1);
  assert.deepEqual(A.DEFAULT_HOME_T, [55, 65, 75]);
});

test("les zones et les plages suivent les seuils", () => {
  const t = [50, 62, 78];
  assert.deepEqual(
    A.homeZones(t).map((z) => z.to),
    [50, 62, 78, 90]
  );
  // Les couleurs ne bougent pas : seuls les seuils sont configurables.
  assert.deepEqual(
    A.homeZones(t).map((z) => z.color),
    A.HOME_ZONES.map((z) => z.color)
  );
  assert.deepEqual(A.wxRanges(t), ["< 50 dB", "50 – 62 dB", "62 – 78 dB", "> 78 dB"]);
  assert.deepEqual(A.wxRanges(), A.WX_RANGES);
});

test("l'assainissement des seuils repare sans casser", () => {
  assert.deepEqual(A.sanitizeHomeT([55, 65, 75]), [55, 65, 75]);
  assert.deepEqual(A.sanitizeHomeT([70, 60, 50]), [70, 71, 72]);
  assert.deepEqual(A.sanitizeHomeT([0, 0, 999]), [31, 32, 89]);
  assert.deepEqual(A.sanitizeHomeT([null, "x", undefined]), [55, 65, 75]);
  assert.deepEqual(A.sanitizeHomeT([]), [55, 65, 75]);
  assert.deepEqual(A.sanitizeHomeT("n'importe quoi"), [55, 65, 75]);
  const once = A.sanitizeHomeT([90, 10, "non"]);
  assert.deepEqual(A.sanitizeHomeT(once), once);
  // Le dosimètre garde son seuil : il n'est pas piloté par ces nombres.
  assert.equal(A.HOME_RED, 75);
});
