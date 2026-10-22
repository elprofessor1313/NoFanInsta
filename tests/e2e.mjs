// Test de l'interface dans un vrai navigateur (Chrome ou Edge en headless) :
// démarre le serveur de développement, ouvre l'app à la taille d'un iPhone et rejoue les parcours.
//   node tests/e2e.mjs        (ou npm run test:e2e) — Node.js 22 ou plus, Chrome ou Edge installé
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { launchBrowser, missingRequirement, wait } from '../tools/chrome.mjs';
import { instagramZip, dos } from './zip.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const problem = missingRequirement();
if (problem) {
  console.error('Test d’interface impossible : ' + problem);
  process.exit(1);
}

let passed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.error('  ✗ ' + name + '\n    ' + (e.stack || e)); process.exitCode = 1; }
}

// --- Serveur de développement sur un port libre ---
const PORT = 5200 + Math.floor(Math.random() * 500);
const BASE = `http://localhost:${PORT}/`;
const server = spawn(process.execPath, ['serve.mjs'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
const work = mkdtempSync(join(tmpdir(), 'tascru-e2e-'));
let browser = null;

try {
  for (let i = 0; i < 40; i++) {
    try { if ((await fetch(BASE)).ok) break; } catch (e) { /* serveur pas encore prêt */ }
    await wait(250);
  }

  browser = await launchBrowser();
  const { send, on, evaluate: js } = browser;
  const errors = [];
  on('Runtime.exceptionThrown', (p) => errors.push(p.exceptionDetails.exception?.description || p.exceptionDetails.text));
  await send('Runtime.enable');
  await send('Emulation.setTimezoneOverride', { timezoneId: 'Europe/Paris' });
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });

  /** Attend qu'une expression soit vraie dans la page. */
  async function until(expr, what, timeout = 5000) {
    for (const end = Date.now() + timeout; Date.now() < end; await wait(100)) {
      if (await js(expr)) return;
    }
    throw new Error('Délai dépassé : ' + what);
  }
  const text = (sel) => js(`document.querySelector(${JSON.stringify(sel)}).textContent.trim()`);
  const click = (sel) => js(`document.querySelector(${JSON.stringify(sel)}).click()`);
  const counts = async () => ({ lost: await text('#n-lost'), gained: await text('#n-gained'), noBack: await text('#n-noBack') });
  const handles = () => js(`[...document.querySelectorAll('#list .handle')].map((a) => a.textContent)`);
  const rowActions = () => js(`[...document.querySelectorAll('#list .row')].map((r) => [...r.querySelectorAll('[data-action]')].map((b) => b.dataset.action).join('+'))`);
  async function open() {
    await send('Page.navigate', { url: BASE });
    await until(`document.getElementById('n-noBack').textContent !== '0'`, 'affichage des résultats');
  }

  await open();
  console.log('Interface (données d’exemple)');

  await test('Compteurs et grand chiffre', async () => {
    assert.deepEqual(await counts(), { lost: '5', gained: '3', noBack: '7' });
    assert.equal(await text('.big'), '5');
    assert.match(await text('.headline-sub'), /^Entre le .* dont 3 que tu suis encore\.$/);
  });

  await test('Onglets : libellé puis compteur dessous, sur une ligne chacun', async () => {
    const layout = await js(`[...document.querySelectorAll('.seg')].map((s) => {
      const l = s.querySelector('.seg-label').getBoundingClientRect(), n = s.querySelector('.seg-n').getBoundingClientRect();
      return n.top >= l.bottom - 1 && l.height < 30;
    })`);
    assert.deepEqual(layout, [true, true, true]);
    assert.equal(await js('document.documentElement.scrollWidth'), 390);
  });

  await test('Filtre « Seulement ceux que je suis encore »', async () => {
    await click('#only-following');
    assert.equal(await text('#n-lost'), '3');
    assert.equal(await text('.big'), '3');
    assert.equal((await handles()).length, 3);
    await click('#only-following');
    assert.equal(await text('#n-lost'), '5');
  });

  await test('Actions seulement dans la Fan Zone', async () => {
    assert.ok((await rowActions()).every((a) => a === ''), 'Départs sans action');
    await click('[data-seg="gained"]');
    assert.ok((await rowActions()).every((a) => a === ''), 'Arrivées sans action');
    await click('[data-seg="noBack"]');
    assert.ok((await rowActions()).every((a) => a === 'ghost+exclude+done'), 'Fan Zone : fantôme, exclure, traité');
  });

  await test('Fantôme : masqué de toutes les listes, puis rétabli', async () => {
    await click('#list .row:first-child [data-action="ghost"]'); // @jules.vrn, aussi parmi les départs
    assert.deepEqual(await counts(), { lost: '4', gained: '3', noBack: '6' });
    assert.match(await text('.headline-sub'), /Masqués : 1 fantôme\./);
    await click('[data-nbv="ghosts"]');
    assert.deepEqual(await handles(), ['@jules.vrn']);
    await click('#list [data-action="ghost"]');
    assert.deepEqual(await counts(), { lost: '5', gained: '3', noBack: '7' });
    assert.equal(await js(`document.getElementById('noback-views').hidden`), true);
  });

  await test('Exclure : masqué de la Fan Zone seulement, puis rétabli', async () => {
    const first = (await handles())[0];
    await click('#list .row:first-child [data-action="exclude"]');
    assert.equal(await text('#n-noBack'), '6');
    assert.equal(await text('#n-lost'), '5');
    await click('[data-nbv="excluded"]');
    assert.deepEqual(await handles(), [first]);
    await click('#list [data-action="exclude"]');
    assert.equal(await text('#n-noBack'), '7');
  });

  await test('Traité : coche et barre le compte', async () => {
    await click('#list .row:first-child [data-action="done"]');
    assert.equal(await js(`document.querySelector('#list .row').classList.contains('is-done')`), true);
    await click('#list .row:first-child [data-action="done"]');
    assert.equal(await js(`document.querySelector('#list .row').classList.contains('is-done')`), false);
  });

  await test('Aide : icônes affichées, lien vers les exports', async () => {
    await click('#tab-help');
    assert.equal(await js(`document.getElementById('demo-banner').hidden`), true);
    assert.equal(await js(`[...document.querySelectorAll('#view-help [data-icon]')].every((n) => n.querySelector('svg'))`), true);
    await click('#view-help [data-goto="exports"]');
    assert.equal(await js(`!document.getElementById('view-exports').hidden`), true);
  });

  console.log('Import d’exports');

  await test('Deux exports du même jour importés dans le désordre : rangés par heure de création', async () => {
    // Instagram date les deux archives du 21 oct. ; heures de création 13:55 et 15:07 (Californie)
    const first = join(work, 'instagram-test.compte-2026-10-21-AAAA.zip');
    const second = join(work, 'instagram-test.compte-2026-10-21-BBBB.zip');
    writeFileSync(first, instagramZip(['ami.un', 'ami.deux', 'parti.vite'], ['ami.un', 'ami.deux'], dos(2026, 10, 21, 13, 55)));
    writeFileSync(second, instagramZip(['ami.un', 'ami.deux'], ['ami.un', 'ami.deux', 'star.mondiale'], dos(2026, 10, 21, 15, 7)));
    const { root } = await send('DOM.getDocument');
    const { nodeId } = await send('DOM.querySelector', { nodeId: root.nodeId, selector: '#file-input' });
    // date proposée : jour réel de création à Paris (15:07 en Californie = 00:07 le 22 à Paris)
    for (const [file, day] of [[second, '2026-10-22'], [first, '2026-10-21']]) {
      await send('DOM.setFileInputFiles', { nodeId, files: [file] });
      await until(`!document.getElementById('draft').hidden`, 'vérification de l’export');
      assert.equal(await js(`document.getElementById('draft-date').value`), day);
      await click('#draft-save');
      await until(`document.getElementById('draft').hidden`, 'enregistrement');
    }
    await until(`document.getElementById('n-lost').textContent === '1'`, 'départ détecté');
    assert.deepEqual(await counts(), { lost: '1', gained: '0', noBack: '1' });
    assert.deepEqual(await handles(), ['@parti.vite']);
    assert.equal(await js(`document.getElementById('sel-from').selectedOptions[0].text`), '21 oct. 2026');
    assert.equal(await js(`document.getElementById('sel-to').selectedOptions[0].text`), '22 oct. 2026');
    assert.equal(await text('#period-note'), 'Période comparée : 1 h 12 min.');
    assert.equal(await text('.headline-sub'), 'Entre le 21 oct. à 22:55 et le 22 oct. 2026 à 00:07, dont 0 que tu suis encore.');
    await click('#tab-exports');
    assert.deepEqual(await js(`[...document.querySelectorAll('.snap-date')].map((d) => d.textContent)`),
      ['jeu. 22 oct. 2026 · 00:07', 'mer. 21 oct. 2026 · 22:55']);
  });

  console.log('Version installée');

  await test('Service worker actif et app disponible hors connexion', async () => {
    await send('Page.reload');
    await until(`!!navigator.serviceWorker.controller`, 'service worker aux commandes', 8000);
    await send('Network.enable');
    await send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    await send('Page.reload');
    await until(`document.getElementById('n-lost') && document.getElementById('n-lost').textContent === '1'`, 'app hors connexion', 8000);
    await send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  });

  await test('Aucune requête vers un autre site (polices comprises)', async () => {
    const external = await js(`performance.getEntriesByType('resource').map((r) => r.name).filter((u) => !u.startsWith(location.origin))`);
    assert.deepEqual(external, []);
  });

  await test('Aucune erreur JavaScript pendant les parcours', async () => {
    assert.deepEqual(errors, []);
  });
} finally {
  if (browser) await browser.close();
  server.kill();
  rmSync(work, { recursive: true, force: true });
}

console.log(`\n${passed} tests d’interface réussis.`);
