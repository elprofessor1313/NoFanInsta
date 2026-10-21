// Génère les icônes PNG de l'app (src/icons/) : l'emoji 😎 sur fond --accent.
//
//   node icons.mjs        (ou npm run icons)
//
// L'emoji vient de la police Noto Color Emoji (Google, licence SIL OFL, libre d'utilisation),
// chargée depuis Google Fonts : il faut une connexion internet. Les emojis d'Apple, eux,
// ne peuvent pas être repris dans une image (droits d'Apple) ; dans la page, 😎 et 🧐 sont
// écrits en caractères et s'affichent donc avec les emojis d'Apple sur iPhone.
//
// Le rendu est fait par Chrome ou Edge en headless (tools/chrome.mjs) : Node.js 22 ou plus.
// Après un changement d'emoji (EMOJI) ou de --accent : npm run icons, puis npm run build.

import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { launchBrowser, missingRequirement, wait } from './tools/chrome.mjs';

const SRC = join(dirname(fileURLToPath(import.meta.url)), 'src');

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

const problem = missingRequirement();
if (problem) {
  console.error(problem);
  process.exit(1);
}

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
const browser = await launchBrowser();
try {
  for (const [name, n, part] of ICONS) {
    const file = join(work, 'icone.html');
    writeFileSync(file, page(n, part));
    await browser.send('Emulation.setDeviceMetricsOverride', { width: n, height: n, deviceScaleFactor: 1, mobile: false });
    await browser.send('Page.navigate', { url: pathToFileURL(file).href });
    await wait(300);
    // attendre la police ; sans elle, le navigateur prendrait l'emoji du système
    const loaded = await browser.evaluate(`document.fonts.load('40px "Noto Color Emoji"', '${EMOJI}').then(() => document.fonts.check('40px "Noto Color Emoji"', '${EMOJI}'))`);
    if (!loaded) throw new Error('police Noto Color Emoji non chargée (connexion internet ?)');
    await wait(200);
    const shot = await browser.send('Page.captureScreenshot', { clip: { x: 0, y: 0, width: n, height: n, scale: 1 } });
    writeFileSync(join(SRC, 'icons', name), Buffer.from(shot.data, 'base64'));
    console.log(`  ✓ src/icons/${name}`);
  }
  console.log('Icônes générées. Lance npm run build pour les intégrer à dist/.');
} catch (e) {
  console.error('Échec de la génération des icônes :', e.message);
  process.exitCode = 1;
} finally {
  await browser.close();
  rmSync(work, { recursive: true, force: true });
}
