/* ==========================================================================
   Alarme sonore mobile — reprise de la règle de la v0.4 du bureau

     3 échantillons consécutifs hors seuil pour déclencher,
     ±2 dB d'hystérésis pour réarmer,
     rappel 2 s après le premier bip puis toutes les 10 s,
     les côtés haut et bas sont indépendants.

   L'horloge est injectée : aucun test ne dépend du temps réel.
   ========================================================================== */

import assert from "node:assert/strict";
import test from "node:test";

import { ALARM_HYST, ALARM_NEED, createAlarm } from "../alarm.js";

function harness({ enabled = true, highAlarm = 45, lowAlarm = 30 } = {}) {
  let clock = 1_000_000;
  const beeps = [];
  const vibrations = [];
  const alarm = createAlarm({
    now: () => clock,
    onBeep: (side) => beeps.push({ side, at: clock }),
    onVibrate: (side) => vibrations.push({ side, at: clock }),
  });
  return {
    alarm,
    beeps,
    vibrations,
    now: () => clock,
    wait: (ms) => {
      clock += ms;
    },
    check: (value, override = {}) =>
      alarm.check({ value }, { enabled, highAlarm, lowAlarm, ...override }),
    checkAt: (value, ms, override = {}) => {
      clock += ms;
      return alarm.check({ value }, { enabled, highAlarm, lowAlarm, ...override });
    },
  };
}

test("les constantes de la règle sont bien 3 échantillons et 2 dB", () => {
  assert.equal(ALARM_NEED, 3);
  assert.equal(ALARM_HYST, 2);
});

test("un pic isolé ne déclenche rien", () => {
  const h = harness();
  assert.equal(h.check(80), null);
  assert.equal(h.check(80), null);
  assert.equal(h.beeps.length, 0);
  assert.equal(h.alarm.state.high.count, 2);
});

test("trois échantillons consécutifs au-dessus du seuil déclenchent un bip", () => {
  const h = harness();
  h.check(50);
  h.check(51);
  assert.equal(h.beeps.length, 0);
  const event = h.check(52);
  assert.deepEqual(event, { side: "high", value: 52 });
  assert.equal(h.beeps.length, 1);
  assert.equal(h.beeps[0].side, "high");
  assert.equal(h.vibrations.length, 1);
  // Un quatrième échantillon immédiat ne rejoue pas le son.
  h.check(53);
  assert.equal(h.beeps.length, 1);
});

test("un retour franc sous le seuil réarme le compteur", () => {
  const h = harness();
  h.check(50);
  h.check(50);
  h.check(40); // 40 <= 45 - 2 : épisode oublié
  assert.equal(h.alarm.state.high.count, 0);
  h.check(50);
  h.check(50);
  assert.equal(h.beeps.length, 0);
});

test("dans la bande d'hystérésis, le compteur continue de monter", () => {
  const h = harness();
  h.check(50);
  h.check(50);
  h.check(44); // 44 > 45 - 2 : on ne réarme pas
  assert.equal(h.alarm.state.high.count, 2);
  h.check(50);
  assert.equal(h.beeps.length, 1);
});

test("les seuils sont stricts : ni 45 ni 30 ne déclenchent", () => {
  const h = harness();
  h.check(45);
  h.check(45);
  h.check(45);
  h.check(30);
  h.check(30);
  h.check(30);
  assert.equal(h.beeps.length, 0);
});

test("le côté bas est indépendant et symétrique", () => {
  const h = harness();
  h.check(20);
  h.check(21);
  assert.equal(h.beeps.length, 0);
  assert.deepEqual(h.check(19), { side: "low", value: 19 });
  assert.equal(h.beeps[0].side, "low");

  // Un pôle efface le compteur de l'autre.
  const g = harness();
  g.check(50);
  g.check(50);
  g.check(20); // le côté haut est oublié
  assert.equal(g.alarm.state.high.count, 0);
  g.check(20);
  g.check(20);
  assert.equal(g.beeps.length, 1);
  assert.equal(g.beeps[0].side, "low");
});

test("le rappel sonne 2 s après le premier bip puis toutes les 10 s", () => {
  const h = harness();
  h.check(50);
  h.check(50);
  h.check(50);
  assert.equal(h.beeps.length, 1);
  const first = h.now();

  // Juste avant la première échéance : silence.
  h.checkAt(50, 1_500);
  assert.equal(h.beeps.length, 1);

  // À 2 s : rappel.
  h.checkAt(50, 600);
  assert.equal(h.beeps.length, 2);
  const second = h.now();

  // Entre 2 s et 10 s après le rappel : silence.
  h.checkAt(50, 5_000);
  assert.equal(h.beeps.length, 2);

  // À 10 s : nouveau rappel.
  h.checkAt(50, 5_100);
  assert.equal(h.beeps.length, 3);
  assert.equal(h.now() - first, 12_200);
  assert.equal(h.now() - second, 10_100);
});

test("son désactivé : aucun bip et compteur figé", () => {
  const h = harness({ enabled: false });
  h.check(80);
  h.check(80);
  h.check(80);
  h.check(80);
  assert.equal(h.beeps.length, 0);
  assert.equal(h.alarm.state.high.count, 0);

  // À la réactivation, il faut trois nouveaux échantillons.
  h.check(80, { enabled: true });
  h.check(80, { enabled: true });
  assert.equal(h.beeps.length, 0);
  h.check(80, { enabled: true });
  assert.equal(h.beeps.length, 1);
});

test("reset() remet les deux côtés à zéro", () => {
  const h = harness();
  h.check(50);
  h.check(50);
  h.check(20);
  h.check(20);
  h.alarm.reset();
  assert.equal(h.alarm.state.high.count, 0);
  assert.equal(h.alarm.state.low.count, 0);
  assert.equal(h.alarm.armed, true);
  h.check(50);
  h.check(50);
  assert.equal(h.beeps.length, 0);
});

test("des seuils différents sont pris en compte à chaque mesure", () => {
  const h = harness({ highAlarm: 70, lowAlarm: 20 });
  h.check(60);
  h.check(60);
  h.check(60);
  assert.equal(h.beeps.length, 0);
  h.check(75);
  h.check(75);
  h.check(75);
  assert.equal(h.beeps.length, 1);
});
