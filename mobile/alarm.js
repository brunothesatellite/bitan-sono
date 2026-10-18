/* ==========================================================================
   bitan·sono mobile — alarme sonore (module ES, sans DOM)
   --------------------------------------------------------------------------
   Regle reprise de web/app.js (v0.4) : plus de bip sur un micro-pic.

     - declenchement apres ALARM_NEED echantillons consecutifs hors seuils,
     - rearmement seulement une fois revenu a ±ALARM_HYST dB du seuil,
     - rappel progressif : 2 s apres le premier bip, puis toutes les 10 s,
       les deux cotes (haut / bas) etant totalement independants.

   L'horloge et les sorties (son, vibration) sont injectees : la machine
   d'etat reste pure et testable.
   ========================================================================== */

export const ALARM_NEED = 3;
export const ALARM_HYST = 2;
export const ALARM_FIRST_DELAY = 2000;
export const ALARM_REPEAT_DELAY = 10000;

export function createAlarm({ now = () => Date.now(), onBeep = () => {}, onVibrate = () => {} } = {}) {
  const state = {
    high: { count: 0, nextAt: 0, first: true },
    low: { count: 0, nextAt: 0, first: true },
  };

  const resetSide = (side) => {
    state[side].count = 0;
    state[side].first = true;
    state[side].nextAt = 0;
  };

  /** A appeler pour chaque mesure live. Renvoie la mesure d'alerte eventuelle. */
  function check(record, { enabled = true, highAlarm = 45, lowAlarm = 30 } = {}) {
    if (!enabled) return null;
    const v = Number(record.value);
    const high = Number(highAlarm);
    const low = Number(lowAlarm);

    if (v > high) {
      resetSide("low");
      const a = state.high;
      a.count += 1;
      if (a.count >= ALARM_NEED && now() >= a.nextAt) {
        onBeep("high");
        onVibrate("high");
        a.nextAt = now() + (a.first ? ALARM_FIRST_DELAY : ALARM_REPEAT_DELAY);
        a.first = false;
        return { side: "high", value: v };
      }
      return null;
    }

    if (v < low) {
      resetSide("high");
      const a = state.low;
      a.count += 1;
      if (a.count >= ALARM_NEED && now() >= a.nextAt) {
        onBeep("low");
        onVibrate("low");
        a.nextAt = now() + (a.first ? ALARM_FIRST_DELAY : ALARM_REPEAT_DELAY);
        a.first = false;
        return { side: "low", value: v };
      }
      return null;
    }

    // Bande d'hysteresis : on n'oublie l'episode qu'une fois vraiment rentre.
    if (v <= high - ALARM_HYST) resetSide("high");
    if (v >= low + ALARM_HYST) resetSide("low");
    return null;
  }

  return {
    state,
    check,
    reset() {
      resetSide("high");
      resetSide("low");
    },
    /** Nombre de bips depuis le dernier rearmement (informatif). */
    get armed() {
      return state.high.first && state.low.first;
    },
  };
}
