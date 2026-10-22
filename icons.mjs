// Génère les icônes PNG de l'app (src/icons/) : un appareil photo qui flashe, l'emoji 😎 dans l'objectif.
//
//   node icons.mjs        (ou npm run icons)
//
// L'emoji vient de la police Noto Color Emoji (Google, licence SIL OFL, libre d'utilisation),
// chargée depuis Google Fonts : il faut une connexion internet. Les emojis d'Apple, eux,
// ne peuvent pas être repris dans une image (droits d'Apple) ; dans la page, 😎 et 🧐 sont
// écrits en caractères et s'affichent donc avec les emojis d'Apple sur iPhone.
//
// Le rendu est fait par Chrome ou Edge en headless (tools/chrome.mjs) : Node.js 22 ou plus.
// Après un changement du dessin, de l'emoji (EMOJI) ou des couleurs de style.css : npm run icons, puis npm run build.

import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { launchBrowser, missingRequirement, wait } from './tools/chrome.mjs';

const SRC = join(dirname(fileURLToPath(import.meta.url)), 'src');

const EMOJI = '😎';
const FONT = 'https://fonts.googleapis.com/css2?family=Noto+Color+Emoji&display=block';

// [fichier, taille en px, échelle du dessin]
// L'icône « maskable » (Android) est recadrée en cercle : le dessin y est plus petit.
const ICONS = [
  ['icon-180.png', 180, 1],
  ['icon-192.png', 192, 1],
  ['icon-512.png', 512, 1],
  ['icon-maskable-512.png', 512, 0.8],
];

const problem = missingRequirement();
if (problem) {
  console.error(problem);
  process.exit(1);
}

const css = readFileSync(join(SRC, 'style.css'), 'utf8');

/*
 * Dessin de l'icône : un appareil photo dans le style de l'app (bords épais, ombre décalée),
 * l'emoji dans l'objectif, et le flash qui se déclenche en haut à droite.
 * Volontairement différent du logo d'Instagram (marque de Meta) : boîtier d'appareil classique
 * avec viseur, couleurs de l'app. Coordonnées en em sur une grille de 100 × 100.
 */
const RAYS = Array.from({ length: 8 }, (_, i) => `<i class="ray" style="transform: rotate(${i * 45}deg)"></i>`).join('');
const page = (n, scale) => `<!doctype html><html data-theme="light"><head><meta charset="utf-8">
<link rel="stylesheet" href="${FONT}"><style>${css}
html, body { margin: 0; padding: 0; background: none !important; }
body::before { display: none; }
.ico {
  position: relative; overflow: hidden; width: ${n}px; height: ${n}px; font-size: ${n / 100}px;
  background: var(--grad); /* magenta → violet, sans le jaune-orange qui signe le logo d'Instagram */
}
.art { position: absolute; inset: 0; transform: scale(${scale}); }
.art > * { position: absolute; box-sizing: border-box; }
.viewfinder { left: 22em; top: 21em; width: 24em; height: 14em; border-radius: 5em 5em 0 0;
  background: var(--bg); border: 3.5em solid var(--edge); }
.body { left: 10em; top: 30em; width: 80em; height: 54em; border-radius: 13em;
  background: var(--bg); border: 3.5em solid var(--edge); box-shadow: 3.5em 3.5em 0 var(--edge); }
.glow { left: 50em; top: 14em; width: 46em; height: 46em; border-radius: 50%;
  background: radial-gradient(circle, #fff 0 14%, var(--pop) 30%, color-mix(in srgb, var(--pop) 40%, transparent) 48%, transparent 68%); }
.rays { left: 73em; top: 37em; width: 0; height: 0; }
.ray { position: absolute; left: -1.6em; top: -21em; width: 3.2em; height: 13em; border-radius: 2em; background: var(--pop);
  transform-origin: 1.6em 21em; border: .8em solid var(--edge); }
.flash { left: 66em; top: 33.5em; width: 14em; height: 7em; border-radius: 2.5em;
  background: radial-gradient(ellipse at center, #fff 35%, var(--pop) 100%); border: 2.5em solid var(--edge); }
.lens { left: 29em; top: 37em; width: 42em; height: 42em; border-radius: 50%;
  background: var(--edge); display: grid; place-items: center; }
.lens::before { content: ""; position: absolute; inset: 4.5em; border-radius: 50%; background: var(--accent-soft); }
.lens span { position: relative; font: 26em/1 "Noto Color Emoji"; }
</style></head><body><div class="ico"><div class="art">
  <div class="glow"></div><div class="rays">${RAYS}</div>
  <div class="viewfinder"></div><div class="body"></div><div class="flash"></div>
  <div class="lens"><span>${EMOJI}</span></div>
</div></div></body></html>`;

const work = mkdtempSync(join(tmpdir(), 'tascru-icons-'));
const browser = await launchBrowser();
try {
  for (const [name, n, scale] of ICONS) {
    const file = join(work, 'icone.html');
    writeFileSync(file, page(n, scale));
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
