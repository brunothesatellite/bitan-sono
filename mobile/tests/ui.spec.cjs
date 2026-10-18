/* ==========================================================================
   bitan·sono mobile — test d'interface (Playwright, portrait Android)

   Verifie ce que les tests unitaires ne peuvent pas voir : que la page
   s'affiche sans erreur sur un ecran de telephone, que rien ne deborde
   horizontalement, que les onglets et la connexion demo fonctionnent depuis
   l'IHM elle-meme, que la valeur bouge, que l'alarme, la meteo, la sieste et
   la lecture du journal repondent, et que theme/langue survivent au
   rechargement.

   Prerequis :
     - le serveur de developpement en marche (mobile/serve.py) ;
     - la bibliotheque `playwright` resolvable (variable BITAN_PLAYWRIGHT ou
       NODE_PATH vers node_modules).

   Lancement :
     node --test mobile/tests/ui.spec.cjs
   ========================================================================== */

"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const SHOTS = path.resolve(__dirname, "..", "docs");
const BASE = process.env.BITAN_UI_URL || "http://127.0.0.1:8123/";
const relayUrl = process.env.BITAN_RELAY_URL || "";
const VIEWPORT = { width: 412, height: 915 };

/** Trouve la bibliotheque Playwright sans dependre d'un chemin absolu. */
function resolvePlaywright() {
  const candidates = [];
  if (process.env.BITAN_PLAYWRIGHT) candidates.push(process.env.BITAN_PLAYWRIGHT);
  candidates.push("playwright");
  if (process.env.TEMP) candidates.push(path.join(process.env.TEMP, "bitan-uicheck", "node_modules", "playwright"));
  for (const candidate of candidates) {
    try {
      return require(candidate);
    } catch {
      /* on essaie le suivant */
    }
  }
  return null;
}

const pw = resolvePlaywright();
const skip = pw
  ? false
  : "Playwright introuvable — installez-la (`npm i -D playwright`) ou pointez BITAN_PLAYWRIGHT dessus.";

test("IHM mobile en portrait — parcours complet en mode demo", { skip }, async (t) => {
  fs.mkdirSync(SHOTS, { recursive: true });

  const browser = await pw.chromium.launch({ channel: "msedge", headless: true });
  t.after(() => browser.close());

  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    locale: "fr-FR",
    colorScheme: "dark",
  });
  const page = await context.newPage();

  // On veut detecter la moindre erreur JavaScript : c'est le seul filet de
  // securite sur une page ou tout est cable a la main.
  const problems = [];
  page.on("pageerror", (err) => problems.push(`pageerror: ${err.message}`));
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const text = msg.text();
    if (/favicon|Download the React/i.test(text)) return;
    problems.push(`console: ${text}`);
  });

  // `#main` defile : une simple capture pleine page ne montrerait que l'ecran
  // visible. Le temps de la photo, on redonne a la page sa hauteur naturelle et
  // on remet la barre d'onglets dans le flux (sinon, en `position: fixed`, elle
  // se retrouve au milieu de l'image), puis on restaure a l'identique.
  const SHOT_STYLES = [
    ["html", { height: "auto", maxHeight: "none", overflow: "visible" }],
    ["body", { height: "auto", maxHeight: "none", overflow: "visible" }],
    ["#main", { height: "auto", maxHeight: "none", overflow: "visible", flex: "none" }],
    [".tabbar", { position: "static" }],
    // Les messages passagers (toast, bandeau) se retrouveraient figes au milieu
    // de l'image : on les masque le temps de la photo.
    ["#toast", { display: "none" }],
    ["#banner-error", { display: "none" }],
  ];
  const shot = async (name, view = null) => {
    const file = path.join(SHOTS, `${name}.png`);
    if (view) await page.click(`.tab[data-view="${view}"]`);
    await page.evaluate((specs) => {
      for (const [selector, overrides] of specs) {
        const node = document.querySelector(selector);
        node.dataset.shotStyle = node.getAttribute("style") || "";
        Object.assign(node.style, overrides);
      }
    }, SHOT_STYLES);
    await page.screenshot({ path: file, fullPage: true });
    await page.evaluate((specs) => {
      for (const [selector] of specs) {
        const node = document.querySelector(selector);
        const previous = node.dataset.shotStyle || "";
        if (previous) node.setAttribute("style", previous);
        else node.removeAttribute("style");
        delete node.dataset.shotStyle;
      }
    }, SHOT_STYLES);
  };

  const overflow = () =>
    page.evaluate(() => ({
      scroll: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
      inner: window.innerWidth,
    }));

  await page.goto(BASE, { waitUntil: "load" });
  await page.waitForFunction(() => Boolean(window.__bitan));
  await page.waitForTimeout(400);

  /* ---------------------------------------------------------- chargement */
  await t.test("la page se charge sans erreur", async () => {
    assert.equal(await page.title(), "bitan·sono");
    assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), "dark");
    assert.deepEqual(problems, []);
  });

  await t.test("rien ne deborde en largeur", async () => {
    const { scroll, inner } = await overflow();
    assert.ok(scroll <= inner + 1, `debordement horizontal : ${scroll}px pour ${inner}px`);
  });

  /* -------------------------------------------------------------- onglets */
  await t.test("les quatre onglets s'affichent et reviennent en haut", async () => {
    // On descend franchement dans la page : le changement d'onglet doit
    // ramener en haut du nouvel onglet, sans glissement.
    await page.evaluate(() => {
      document.getElementById("main").scrollTop = 400;
    });
    for (const view of ["live", "home", "memory", "settings"]) {
      await page.click(`.tab[data-view="${view}"]`);
      await page.waitForTimeout(120);
      assert.equal(
        await page.isVisible(`#view-${view}`),
        true,
        `la vue ${view} devrait etre visible`
      );
      assert.equal(await page.getAttribute(`#view-${view}`, "class"), "view is-active");
      assert.equal(
        await page.evaluate(() => document.getElementById("main").scrollTop),
        0,
        `la vue ${view} devrait s'ouvrir en haut`
      );
      const { scroll, inner } = await overflow();
      assert.ok(scroll <= inner + 1, `vue ${view} : debordement ${scroll}px > ${inner}px`);
    }
    await page.click('.tab[data-view="live"]');
  });

  /* -------------------------------------------------------------- i18n */
  // Filet de securite : un prefixe de traduction dans un <span> est le signe
  // qu'une cle existe d'un cote et pas de l'autre. Il tourne avant *et* apres
  // la connexion, car le diagnostic n'affiche certaines lignes qu'une fois
  // la liaison etablie.
  const rawKeys = () =>
    page.evaluate(() => {
      const pattern = /^(settings|home|live|memory|diag|error|toast|transport|demo|conn|status|action|about|otg|app)\.[A-Za-z0-9_.]+$/;
      const found = new Set();
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        const text = (walker.currentNode.nodeValue || "").trim();
        if (pattern.test(text)) found.add(text);
      }
      for (const node of document.querySelectorAll("[placeholder],[title],[aria-label]")) {
        for (const attr of ["placeholder", "title", "aria-label"]) {
          const value = (node.getAttribute(attr) || "").trim();
          if (pattern.test(value)) found.add(`${attr}=${value}`);
        }
      }
      return [...found].sort();
    });

  await t.test("aucun libelle n'affiche une cle de traduction brute", async () => {    await page.click('.tab[data-view="settings"]');
    assert.deepEqual(await rawKeys(), [], "clefs brutes en francais");
    await page.click('#seg-lang button[data-value="en"]');
    assert.deepEqual(await rawKeys(), [], "clefs brutes en anglais");
    await page.click('#seg-lang button[data-value="fr"]');
  });

  /* ----------------------------------------------- connexion depuis l'IHM */
  await t.test("on se connecte au mode demo depuis Reglages", async () => {
    await page.click('.tab[data-view="settings"]');
    await page.selectOption("#sel-transport", "sim");
    await page.click("#btn-connect");
    await page.waitForFunction(() => window.__bitan.state.connected === true, null, { timeout: 8000 });
    assert.equal(await page.evaluate(() => window.__bitan.state.transportKind), "sim");
    assert.equal(await page.locator("#device-pill").getAttribute("class"), "pill is-sim");
    // Le champ du serveur distant ne concerne que la liaison « relais » : la
    // regle `[hidden]` doit tenir tete au `display` de `.field`.
    assert.equal(await page.locator("#field-relay").isVisible(), false, "champ relais visible en mode demo");
    await page.selectOption("#sel-transport", "relay");
    assert.equal(await page.locator("#field-relay").isVisible(), true, "champ relais absent en mode relais");
    assert.equal(await page.locator("#relay-hint").isVisible(), true, "aide relais absente en mode relais");
    await page.selectOption("#sel-transport", "sim");
    assert.equal(await page.locator("#field-relay").isVisible(), false);
    // Le diagnostic doit nommer la liaison reellement utilisee.
    const diag = await page.locator("#diag-list").innerText();
    assert.ok(diag.includes("Liaison utilisée"), `liaison non nommee : ${diag}`);
    assert.ok(diag.includes("Contexte sécurisé"), `diagnostic inattendu : ${diag}`);
    assert.equal(await page.evaluate(() => window.__bitan.state.transportDetail.length > 0), true);
    await shot("reglages", "settings");
  });

  /* ------------------------ plus aucune cle brute, diagnostic compris */
  await t.test("aucune cle brute apres connexion, diagnostic compris", async () => {
    await page.click('.tab[data-view="settings"]');
    assert.deepEqual(await rawKeys(), [], "clefs brutes apres connexion");
    await page.click('#seg-lang button[data-value="en"]');
    assert.deepEqual(await rawKeys(), [], "clefs brutes apres connexion (en)");
    await page.click('#seg-lang button[data-value="fr"]');
  });

  /* ------------------------------------------- diagnostic d'un refus HID */
  await t.test("un refus d'interface affiche la carte des interfaces USB", async () => {
    await page.click('.tab[data-view="settings"]');
    const MAP = "IF 0.0 classe 0x03/0x00/0x00 HID · IN 0x81 interrupt, OUT 0x01 interrupt";
    await page.evaluate((detail) => {
      const err = new Error("Unable to claim interface");
      err.name = "NetworkError";
      err.code = "claim";
      err.detail = detail;
      window.__bitan.noteError(err);
    }, MAP);

    const diag = await page.locator("#diag-list").innerText();
    // Le message doit dire *quoi faire*, pas seulement que ca a echoue.
    assert.match(diag, /Serveur distant/, "le diagnostic doit orienter vers le relais");
    assert.match(diag, /Interfaces USB/);
    assert.equal(await page.locator("#diag-list code.diag-map").innerText(), MAP);
    assert.equal(await page.locator("#diag-list code.diag-map").isVisible(), true);
    await shot("diagnostic-hid", "settings");

    // On remet le diagnostic au propre pour la suite du parcours.
    await page.evaluate(() => {
      window.__bitan.state.lastError = "";
      window.__bitan.state.lastErrorDetail = "";
      window.__bitan.noteError(new Error(""));
    });
    assert.equal(await page.locator("#diag-list code.diag-map").count(), 0);
  });

  /* --------------------------------------------------- mesure qui bouge */
  await t.test("Demarrer produit des mesures qui evoluent", async () => {
    await page.click('.tab[data-view="live"]');
    assert.equal(await page.locator("#demo-card").isVisible(), true, "la carte demo doit etre visible");
    await page.click("#btn-live");
    await page.waitForFunction(() => window.__bitan.state.live.length >= 3, null, { timeout: 12000 });
    const first = await page.textContent("#live-value");
    await page.waitForFunction(
      (start) => window.__bitan.state.live.filter((r) => r.value !== null).length >= start + 3,
      await page.evaluate(() => window.__bitan.state.live.length),
      { timeout: 12000 }
    );
    const state = await page.evaluate(() => {
      const values = window.__bitan.state.live.map((r) => Number(r.value));
      return {
        running: window.__bitan.state.liveRunning,
        count: values.length,
        distinct: new Set(values.map((v) => v.toFixed(1))).size,
        min: Math.min(...values),
        max: Math.max(...values),
        stats: window.__bitan.state.liveStats,
      };
    });
    assert.equal(state.running, true);
    assert.ok(state.count >= 6, `seulement ${state.count} mesures`);
    assert.ok(state.distinct >= 2, "la valeur affichee ne bouge pas");
    assert.ok(state.stats.count === state.count, "les statistiques ne suivent pas");
    assert.ok(state.min <= state.max);
    const shown = Number(await page.textContent("#live-value"));
    assert.ok(Number.isFinite(shown) && shown > 0 && shown < 130, `valeur affichee suspecte : ${shown}`);
    assert.notEqual(first, "–");

    // Regression : `canvas.height` reecrit l'attribut `height` ; le relire au
    // dessin suivant faisait doubler le graphe a chaque mesure.
    const chart = await page.evaluate(() => {
      const node = document.getElementById("chart-live");
      return { box: node.getBoundingClientRect().height, bitmap: node.height, width: node.width };
    });
    assert.ok(chart.box > 100 && chart.box < 220, `le graphe du direct mesure ${chart.box}px de haut`);
    assert.ok(chart.bitmap <= chart.box * 2 + 1, `bitmap ${chart.bitmap}px pour une boite de ${chart.box}px`);

    await shot("direct", "live");
  });

  /* ------------------------------------------- drapeaux et alarme sonore */
  await t.test("les drapeaux et l'alarme reagissent aux seuils", async () => {
    await page.click("#btn-live"); // on arrete la demo pour injecter a la main
    await page.waitForFunction(() => window.__bitan.state.liveRunning === false, null, { timeout: 5000 });

    await page.evaluate(() => window.__bitan.ingest(20));
    await page.waitForTimeout(60);
    assert.equal(await page.locator("#flag-under").getAttribute("class"), "flag is-on");

    await page.evaluate(() => window.__bitan.ingest(90));
    await page.waitForTimeout(60);
    assert.equal(await page.locator("#flag-over").getAttribute("class"), "flag is-on");
    assert.equal(await page.locator("#flag-under").getAttribute("class"), "flag");

    // Son active : il faut trois mesures consecutives hors seuil pour bipper.
    await page.click('.tab[data-view="settings"]');
    await page.check("#chk-sound");
    await page.evaluate(() => {
      window.__bitan.reset();
      for (let i = 0; i < 3; i += 1) window.__bitan.ingest(95);
    });
    await page.waitForTimeout(80);
    const afterHigh = await page.evaluate(() => window.__bitan.alarmState().high.count);
    assert.ok(afterHigh >= 3, `compteur haut = ${afterHigh}`);

    await page.evaluate(() => {
      window.__bitan.ingest(95); // dans la bande d'hysteresis : on n'oublie pas l'episode
    });
    assert.equal(await page.evaluate(() => window.__bitan.alarmState().high.count), afterHigh + 1);
    await page.evaluate(() => window.__bitan.ingest(40)); // retour franc sous le seuil
    assert.equal(await page.evaluate(() => window.__bitan.alarmState().high.count), 0);
    await page.uncheck("#chk-sound");
  });

  /* ---------------------------------------------------- meteo / barometre */
  await t.test("la meteo et le barometre s'animent", async () => {
    await page.evaluate(() => {
      window.__bitan.reset();
      for (let i = 0; i < 12; i += 1) {
        window.__bitan.ingest(56 + (i % 3), Date.now() - (11 - i) * 1000);
      }
    });
    await page.click('.tab[data-view="home"]');
    await page.waitForTimeout(150);
    assert.notEqual(await page.textContent("#weather-label"), "–");
    assert.notEqual(await page.textContent("#mood-label"), "–");
    const laeq1s = await page.textContent("#home-laeq1s");
    assert.match(laeq1s, /^\d+[.,]\d$/, `LAeq 1 s inattendu : ${laeq1s}`);
    assert.notEqual(await page.textContent("#trend-text"), "");
    assert.ok((await page.textContent("#cocoon-score")) !== "–", "le score cocon devrait etre calcule");
    await shot("maison", "home");
  });

  /* ------------------------------------------------------------- sieste */
  await t.test("le mode sieste se lance et s'arrete", async () => {
    const startLabel = await page.textContent("#btn-nap");
    await page.click("#btn-nap");
    await page.waitForTimeout(150);
    assert.notEqual(await page.textContent("#btn-nap"), startLabel);
    assert.notEqual(await page.textContent("#nap-line1"), "");
    await page.click("#btn-nap");
    await page.waitForTimeout(120);
    assert.equal(await page.textContent("#btn-nap"), startLabel);
  });

  /* -------------------------------------------------- journal et export */
  await t.test("on lit le journal demo et on l'exporte en CSV", async () => {
    await page.click('.tab[data-view="memory"]');
    await page.click("#btn-history");
    await page.waitForFunction(() => window.__bitan.state.history.length > 0, null, { timeout: 20000 });
    const count = await page.evaluate(() => window.__bitan.state.history.length);
    assert.equal(await page.textContent("#memory-count"), String(count));
    assert.ok(count >= 10, `journal trop court : ${count}`);
    assert.ok((await page.locator("#history-rows .row").count()) === Math.min(500, count));
    await shot("memoire", "memory");

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.click("#btn-export-csv"),
    ]);
    assert.match(download.suggestedFilename(), /^bitan-sono-.*\.csv$/);
    const csv = fs.readFileSync(await download.path(), "utf8");
    assert.ok(csv.charCodeAt(0) === 0xfeff, "le CSV doit porter un BOM UTF-8");
    const lines = csv.replace(/^\ufeff/, "").trim().split("\r\n");
    assert.equal(lines[0], "NO.;MeaValue;Weighting;Time;Date");
    assert.equal(lines.length, count + 1);
    assert.match(lines[1], /^\d+;\d+\.\d;[AC];\d{2}:\d{2}:\d{2};\d{4}-\d{2}-\d{2}$/);
  });

  /* --------------------------------------- theme et langue persistants */
  await t.test("theme clair et anglais survivent au rechargement", async () => {
    await page.click('.tab[data-view="settings"]');
    await page.click('#seg-theme button[data-value="light"]');
    assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), "light");
    await page.click('#seg-lang button[data-value="en"]');
    assert.equal(await page.evaluate(() => document.documentElement.lang), "en");
    assert.equal(await page.textContent("#tab-live"), "Live");

    // Les libelles ecrits en dur dans index.html doivent eux aussi suivre la
    // langue : sans traduction, ces boutons restaient en francais.
    for (const [selector, expected] of [
      ["#btn-connect", "Connect"],
      ["#btn-disconnect", "Disconnect"],
      ["#btn-send-device", "Send to device"],
      ["#btn-read-device", "Read from device"],
      ["#btn-test-sound", "Test"],
      ["#btn-history", "Read meter"],
      ["#btn-export-csv", "Export CSV"],
      ["#btn-clear-history", "Clear"],
    ]) {
      assert.equal(await page.textContent(selector), expected, `${selector} non traduit`);
    }
    assert.equal(await page.getAttribute("#banner-error-close", "aria-label"), "Close");

    await page.reload({ waitUntil: "load" });
    await page.waitForFunction(() => Boolean(window.__bitan));
    await page.waitForTimeout(300);
    assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), "light");
    assert.equal(await page.evaluate(() => document.documentElement.lang), "en");
    assert.equal(await page.textContent("#tab-memory"), "Memory");
    assert.equal(await page.evaluate(() => window.__bitan.settings.language), "en");
    // Apres un rechargement on retombe sur l'onglet Direct : il faut revenir
    // aux Reglages pour continuer a cliquer dedans.
    assert.equal(await page.isVisible("#view-live"), true);
    await page.click('.tab[data-view="settings"]');
    await shot("reglages-clair", "settings");

    // On remet la langue par defaut pour ne pas laisser de preferences batardes.
    await page.click('#seg-lang button[data-value="fr"]');
    await page.click('#seg-theme button[data-value="dark"]');
  });

  /* ------------------------------------------------- seuils des zones */
  await t.test("les seuils des zones se configurent et survivent au rechargement", async () => {
    await page.click('.tab[data-view="settings"]');
    assert.equal(await page.locator("#set-zones .thr-row").count(), 3, "trois seuils attendus");
    assert.equal(await page.locator("#set-zones-preview .zseg").count(), 4, "quatre zones attendues");

    // Descendre le premier seuil à 50 : la bande annonce « < 50 dB ».
    await page.fill("#set-ht1", "50");
    await page.dispatchEvent("#set-ht1", "change");
    assert.deepEqual(await page.evaluate(() => window.__bitan.settings.homeT), [50, 65, 75]);
    const strip = await page.locator("#weather-strip .wx span").allInnerTexts();
    assert.ok(strip[0].includes("< 50 dB"), `bande inattendue : ${strip.join(" / ")}`);

    // L'ordre est imposé : un seuil 2 sous le seuil 1 se coince à 51.
    await page.fill("#set-ht2", "40");
    await page.dispatchEvent("#set-ht2", "change");
    assert.deepEqual(await page.evaluate(() => window.__bitan.settings.homeT), [50, 51, 75]);

    // Persistance après rechargement.
    await page.reload({ waitUntil: "load" });
    await page.waitForFunction(() => Boolean(window.__bitan));
    await page.waitForTimeout(300);
    assert.deepEqual(await page.evaluate(() => window.__bitan.settings.homeT), [50, 51, 75]);

    // On remet les valeurs d'origine pour ne pas laisser de préférences bâtardes.
    await page.click('.tab[data-view="settings"]');
    await page.click("#btn-reset-zones");
    assert.deepEqual(await page.evaluate(() => window.__bitan.settings.homeT), [55, 65, 75]);
    const stripBack = await page.locator("#weather-strip .wx span").allInnerTexts();
    assert.ok(stripBack[0].includes("< 55 dB"), `bande inattendue : ${stripBack.join(" / ")}`);
  });

  /* ----------------------------------------------------------------- relais */
  // Ne s'execute que si un serveur de bureau tourne :
  //   BITAN_RELAY_URL=http://192.168.1.20:8765/ node --test tests/ui.spec.cjs
  await t.test(
    "le mode relais recoit les mesures du serveur de bureau",
    { skip: relayUrl ? false : "BITAN_RELAY_URL non defini" },
    async () => {
      await page.click('.tab[data-view="settings"]');
      await page.selectOption("#sel-transport", "relay");
      await page.fill("#inp-relay", relayUrl);
      await page.click("#btn-connect");
      await page.waitForFunction(() => window.__bitan.state.connected === true, null, { timeout: 10000 });
      assert.equal(await page.evaluate(() => window.__bitan.state.transportKind), "relay");

      await page.click('.tab[data-view="live"]');
      await page.evaluate(() => window.__bitan.reset());
      // Liaison en flux : la mesure demarre des la connexion, sans « Demarrer ».
      await page.waitForFunction(() => window.__bitan.state.live.length >= 3, null, { timeout: 15000 });
      assert.equal(await page.evaluate(() => window.__bitan.state.liveRunning), true);
      const value = Number(await page.textContent("#live-value"));
      assert.ok(Number.isFinite(value) && value > 0 && value < 130, `valeur relais suspecte : ${value}`);
      await shot("relais", "live");

      await page.click('.tab[data-view="settings"]');
      await page.click("#btn-disconnect");
      await page.waitForFunction(() => window.__bitan.state.connected === false, null, { timeout: 8000 });
      await page.selectOption("#sel-transport", "sim");
    }
  );

  await t.test("aucune erreur JavaScript sur l'ensemble du parcours", () => {
    assert.deepEqual(problems, []);
  });
});
