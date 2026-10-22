// Génère les icônes PNG de l'app (src/icons/) à partir du logo de la page.
//
//   node icons.mjs        (ou npm run icons)
//
// Le logo (panneau d'interdiction sur 😍 + sous-panneau « FAN ZONE ») est dessiné une seule fois :
// balisage dans src/body.html (.app-logo), styles dans src/style.css. L'en-tête de l'app l'affiche en
// version compacte ; ce script le reprend en entier, sur le fond en dégradé de l'app.
//
// Les emojis viennent ici de la police Noto Color Emoji (Google, licence SIL OFL, libre d'utilisation),
// chargée depuis Google Fonts : il faut une connexion internet. Les emojis d'Apple ne peuvent pas être
// repris dans une image (droits d'Apple) ; dans la page, ils restent des caractères et s'affichent
// donc avec les emojis d'Apple sur iPhone.
//
// Le rendu est fait par Chrome ou Edge en headless (tools/chrome.mjs) : Node.js 22 ou plus.
// Après un changement du logo ou des couleurs de style.css : npm run icons, puis npm run build.

import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { launchBrowser, missingRequirement, wait } from './tools/chrome.mjs';

const SRC = join(dirname(fileURLToPath(import.meta.url)), 'src');
const EMOJI_FONT = 'https://fonts.googleapis.com/css2?family=Noto+Color+Emoji&display=block';

// [fichier, taille en px, échelle du logo]
// L'icône « maskable » (Android) est recadrée en cercle : le logo y est plus petit.
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

// Logo tel qu'il est dans la page, sans la variante compacte de l'en-tête
const body = readFileSync(join(SRC, 'body.html'), 'utf8');
const found = body.match(/<span class="app-logo[^"]*">([\s\S]*?)<\/span><!-- \/app-logo -->/);
if (!found) {
  console.error('Logo introuvable dans src/body.html (<span class="app-logo"> … <!-- /app-logo -->).');
  process.exit(1);
}
const logo = `<span class="app-logo">${found[1]}</span>`;

const css = readFileSync(join(SRC, 'style.css'), 'utf8');
// polices de l'app (sous-panneau « FAN ZONE »), servies depuis src/fonts/
const fontsCss = readFileSync(join(SRC, 'fonts', 'fonts.css'), 'utf8').replaceAll('url(fonts/', `url(${pathToFileURL(join(SRC, 'fonts'))}/`);

// Page d'une icône : fond en dégradé de l'app, logo centré. Thème clair forcé pour des couleurs stables.
const page = (n, scale) => `<!doctype html><html data-theme="light"><head><meta charset="utf-8">
<link rel="stylesheet" href="${EMOJI_FONT}"><style>${fontsCss}${css}
html, body { margin: 0; padding: 0; background: none !important; }
body::before { display: none; }
.ico { position: relative; overflow: hidden; width: ${n}px; height: ${n}px; background: var(--grad); }
.ico .app-logo { font-size: ${n / 100}px; transform: scale(${scale}); transform-origin: center; }
.ico .emo { font-family: "Noto Color Emoji"; }
</style></head><body><div class="ico">${logo}</div></body></html>`;

const work = mkdtempSync(join(tmpdir(), 'tascru-icons-'));
const browser = await launchBrowser();
try {
  for (const [name, n, scale] of ICONS) {
    const file = join(work, 'icone.html');
    writeFileSync(file, page(n, scale));
    await browser.send('Emulation.setDeviceMetricsOverride', { width: n, height: n, deviceScaleFactor: 1, mobile: false });
    await browser.send('Page.navigate', { url: pathToFileURL(file).href });
    await wait(300);
    // attendre les polices ; sans elles, le navigateur prendrait celles du système
    const loaded = await browser.evaluate(`Promise.all([
      document.fonts.load('40px "Noto Color Emoji"', '😍'),
      document.fonts.load('800 40px "Bricolage Grotesque"', 'FAN ZONE'),
    ]).then(() => document.fonts.check('40px "Noto Color Emoji"', '😍') && document.fonts.check('800 40px "Bricolage Grotesque"', 'FAN ZONE'))`);
    if (!loaded) throw new Error('polices non chargées (connexion internet ?)');
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
