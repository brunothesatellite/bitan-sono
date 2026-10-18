/* ==========================================================================
   bitan·sono — shim de la passerelle native (côté page)
   --------------------------------------------------------------------------
   Java expose `window.__bitanNative` (addJavascriptInterface) dont les
   méthodes sont synchrones et ne peuvent pas rendre de promesse. Ce fichier
   construit par-dessus l'objet `window.BitanBridge` attendu par le transport
   « passerelle native » de la webapp :

     window.BitanBridge = {
       open(): Promise<string>,          // libellé de l'appareil
       send(bytes: number[]): void,      // 8 octets utiles
       close(): void,
       onData(bytes: number[]): void,    // posé par la webapp
       onError(message: string): void,   // posé par la webapp
     }

   Java rappelle la page par `window.__bitanBridge.event(type, charge)` :
     event('open',  libellé)   l'appareil est ouvert et l'interface revendiquée
     event('error', message)   échec d'ouverture, d'écriture ou de lecture
     event('data',  [octets])  un rapport reçu

   Le fichier est injecté dans l'en-tête de la page par la coquille, et
   rejoué au démarrage : la garde ci-dessous le rend idempotent.
   ========================================================================== */

(function () {
  const native = window.__bitanNative;
  if (!native) return; // page ouverte hors de la coquille : rien à faire
  if (window.BitanBridge) return; // déjà installé

  let pending = null; // promesse d'ouverture en cours

  window.__bitanBridge = {
    event(type, payload) {
      if (type === "open") {
        const waiting = pending;
        pending = null;
        if (waiting) waiting.resolve(payload || "Sonomètre (OTG)");
        return;
      }
      if (type === "error") {
        const message = payload || "Erreur USB";
        const waiting = pending;
        pending = null;
        if (waiting) waiting.reject(new Error(message));
        else if (window.BitanBridge && window.BitanBridge.onError) window.BitanBridge.onError(message);
        return;
      }
      if (type === "data" && window.BitanBridge && window.BitanBridge.onData) {
        window.BitanBridge.onData(payload || []);
      }
    },
  };

  window.BitanBridge = {
    onData: null,
    onError: null,

    open() {
      if (pending) return Promise.reject(new Error("ouverture déjà en cours"));
      return new Promise((resolve, reject) => {
        pending = { resolve, reject };
        try {
          native.open();
        } catch (err) {
          pending = null;
          reject(err);
        }
      });
    },

    send(bytes) {
      // Asynchrone côté Java : on ne bloque jamais le pont.
      native.send(JSON.stringify(Array.from(bytes)));
    },

    close() {
      try {
        native.close();
      } catch {
        /* ignore */
      }
    },
  };
})();
