// Génère les icônes PNG de l'app (src/icons/) : l'emoji 😎 sur fond --accent.
//
//   node icons.mjs        (ou npm run icons)
//
// L'emoji vient de la police Noto Color Emoji (Google, licence SIL OFL, libre d'utilisation),
// chargée depuis Google Fonts : il faut une connexion internet. Les emojis d'Apple, eux,
// ne peuvent pas être repris dans une image (droits d'Apple) ; dans la page, 😎 et 🧐 sont
// écrits en caractères et s'affichent donc avec les emojis d'Apple sur iPhone.
//
// Le rendu est fait par Chrome ou Edge en mode headless, piloté par le protocole de débogage :
// aucune dépendance npm. Il faut Node.js 22 ou plus (WebSocket intégré) et Chrome ou Edge installé.
// Navigateur ailleurs : CHROME=/chemin/vers/chrome npm run icons
//
// Après un changement d'emoji (EMOJI) ou de --accent : npm run icons, puis npm run build.

import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, existsSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const SRC = join(ROOT, 'src');

const EMOJI = '😎';
const FONT = 'https://fonts.googleapis.com/css2?family=Noto+Color+Emoji&display=block';

// [fichier, taille en px, part de l'icône occupée par l'emoji]
// L'icône « maskable » (Android) est recadrée en cercle : l'emoji y est plus petit.
const ICONS = [
  ['icon-180.png', 180, 0.68],
  ['icon-192.png', 192, 0.68],
  ['icon-512.png', 512, 0.68],
  ['icon-maskable-512.png', 512, 0.54],
];

const BROWSERS = [
  process.env.CHROME,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
];

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

if (typeof WebSocket === 'undefined') fail(`Node.js 22 ou plus est nécessaire pour cette commande (version actuelle : ${process.version}).`);
const browser = BROWSERS.find((p) => p && existsSync(p));
if (!browser) fail('Chrome ou Edge introuvable. Indique son chemin : CHROME=/chemin/vers/chrome npm run icons');

const css = readFileSync(join(SRC, 'style.css'), 'utf8');

// Page d'une icône : fond --accent, emoji centré. Thème clair forcé pour des couleurs stables.
const page = (n, part) => `<!doctype html><html data-theme="light"><head><meta charset="utf-8">
<link rel="stylesheet" href="${FONT}"><style>${css}
html, body { margin: 0; padding: 0; background: var(--accent) !important; background-image: none !important; }
body::before { display: none; }
.ico { width: ${n}px; height: ${n}px; display: grid; place-items: center; background: var(--accent); }
.ico span { font: ${Math.round(n * part)}px/1 "Noto Color Emoji"; }
</style></head><body><div class="ico"><span>${EMOJI}</span></div></body></html>`;

const work = mkdtempSync(join(tmpdir(), 'tascru-icons-'));
const PORT = 9300 + Math.floor(Math.random() * 600);
const proc = spawn(browser, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars', `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${join(work, 'profil')}`, 'about:blank',
], { stdio: 'ignore' });

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

try {
  let target;
  for (let i = 0; i < 60 && !target; i++) {
    await wait(250);
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
      target = list.find((t) => t.type === 'page');
    } catch (e) { /* navigateur pas encore prêt */ }
  }
  if (!target) throw new Error('le navigateur n\'a pas démarré');

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.addEventListener('open', r); ws.addEventListener('error', j); });
  let id = 0;
  const pending = new Map();
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); }
  });
  const send = (method, params = {}) => new Promise((r) => {
    const i = ++id;
    pending.set(i, r);
    ws.send(JSON.stringify({ id: i, method, params }));
  });

  for (const [name, n, part] of ICONS) {
    const file = join(work, 'icone.html');
    writeFileSync(file, page(n, part));
    await send('Emulation.setDeviceMetricsOverride', { width: n, height: n, deviceScaleFactor: 1, mobile: false });
    await send('Page.navigate', { url: pathToFileURL(file).href });
    await wait(300);
    // attendre la police ; sans elle, le navigateur prendrait l'emoji du système
    const font = await send('Runtime.evaluate', {
      expression: `document.fonts.load('40px "Noto Color Emoji"', '${EMOJI}').then(() => document.fonts.check('40px "Noto Color Emoji"', '${EMOJI}'))`,
      awaitPromise: true,
      returnByValue: true,
    });
    if (!font.result || font.result.value !== true) throw new Error('police Noto Color Emoji non chargée (connexion internet ?)');
    await wait(200);
    const shot = await send('Page.captureScreenshot', { clip: { x: 0, y: 0, width: n, height: n, scale: 1 } });
    writeFileSync(join(SRC, 'icons', name), Buffer.from(shot.data, 'base64'));
    console.log(`  ✓ src/icons/${name}`);
  }
  ws.close();
  console.log('Icônes générées. Lance npm run build pour les intégrer à dist/.');
} catch (e) {
  console.error('Échec de la génération des icônes :', e.message);
  process.exitCode = 1;
} finally {
  proc.kill();
  await wait(300);
  try { rmSync(work, { recursive: true, force: true }); } catch (e) { /* le navigateur peut encore tenir un fichier */ }
}
