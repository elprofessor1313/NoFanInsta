// Construit l'application à partir de src/.
//
//   node build.mjs
//
// Produit :
//   dist/web/                 l'app à mettre en ligne (GitHub Pages, Netlify…) :
//                             index.html autonome + manifest + service worker + icônes + polices
//   dist/claude-artifact.html la même app, au format d'une page Claude
//
// Aucune dépendance : seul Node.js (18 ou plus) est nécessaire.

import { readFileSync, writeFileSync, mkdirSync, copyFileSync, readdirSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const SRC = join(ROOT, 'src');
const DIST = join(ROOT, 'dist');
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));

// L'ordre compte : chaque fichier s'appuie sur les précédents.
//   logique (sans DOM, testée) : parser, compare, storage, format, files, demo
//   interface                  : dom, audit (onglet Résultats), exports (onglet Exports), app (démarrage)
const SCRIPTS = ['parser.js', 'compare.js', 'storage.js', 'format.js', 'files.js', 'demo.js', 'dom.js', 'audit.js', 'exports.js', 'app.js'];

const APP_NAME = 'T’as cru j’étais ton fan ?';
const SHORT_NAME = 'T’as cru ?'; // nom sous l'icône de l'écran d'accueil (12 caractères au plus)
const THEME_LIGHT = '#fff7f4';
const THEME_DARK = '#170e14';
const FONTS = 'https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,700;12..96,800&family=IBM+Plex+Mono:wght@500&family=Instrument+Sans:wght@400;500;600;700&display=swap';

const read = (p) => readFileSync(join(SRC, p), 'utf8');
const inlineScript = (code) => '<script>\n' + code.replace(/<\/script/gi, '<\\/script') + '\n</script>';

export function build({ quiet = false } = {}) {
  const css = read('style.css');
  const body = read('body.html');
  const js = SCRIPTS.map((f) => `/* ${f} */\n` + read(join('js', f))).join('\n');
  const fontsCss = read(join('fonts', 'fonts.css'));
  const fontFiles = readdirSync(join(SRC, 'fonts')).filter((f) => f.endsWith('.woff2'));
  const icons = readdirSync(join(SRC, 'icons')).filter((f) => f.endsWith('.png'));
  // la version change dès qu'un fichier publié change (sinon le service worker garderait l'ancien en cache)
  const hash = createHash('sha256').update(css + body + js + fontsCss + read('sw.js') + read('sw-register.js'));
  for (const f of icons) hash.update(readFileSync(join(SRC, 'icons', f)));
  for (const f of fontFiles) hash.update(readFileSync(join(SRC, 'fonts', f)));
  const version = pkg.version + '-' + hash.digest('hex').slice(0, 8);

  const head = (fonts) => [
    `<title>${APP_NAME}</title>`,
    '<meta name="claude:viewport-fit-sides" content="cover">',
    `<meta name="description" content="Qui ne te suit pas en retour sur Instagram, qui s'est désabonné, et lesquels tu suis encore. À partir de tes exports officiels. Non affilié à Instagram ni à Meta.">`,
    fonts,
    `<style>\n${css}\n</style>`,
  ].join('\n');
  // Page Claude : polices Google (elle ne peut pas embarquer de fichiers)
  const googleFonts = [
    '<link rel="preconnect" href="https://fonts.googleapis.com">',
    '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>',
    `<link rel="stylesheet" href="${FONTS}">`,
  ].join('\n');
  // Version web : polices hébergées avec l'app, aucune requête vers Google
  const localFonts = [
    ...fontFiles.filter((f) => f.endsWith('-latin.woff2')).map((f) => `<link rel="preload" href="fonts/${f}" as="font" type="font/woff2" crossorigin>`),
    `<style>\n${fontsCss}</style>`,
  ].join('\n');

  const scripts = inlineScript(`window.DESABOS_VERSION = ${JSON.stringify(version)};\n` + js);

  rmSync(DIST, { recursive: true, force: true });
  mkdirSync(join(DIST, 'web', 'icons'), { recursive: true });
  mkdirSync(join(DIST, 'web', 'fonts'), { recursive: true });

  // 1) Version web installable (PWA)
  const pwaHead = [
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">',
    '<link rel="manifest" href="manifest.webmanifest">',
    '<meta name="apple-mobile-web-app-capable" content="yes">',
    '<meta name="mobile-web-app-capable" content="yes">',
    '<meta name="apple-mobile-web-app-status-bar-style" content="default">',
    `<meta name="apple-mobile-web-app-title" content="${SHORT_NAME}">`,
    '<link rel="apple-touch-icon" href="icons/icon-180.png">',
    '<link rel="icon" type="image/png" sizes="192x192" href="icons/icon-192.png">',
    `<meta name="theme-color" media="(prefers-color-scheme: light)" content="${THEME_LIGHT}">`,
    `<meta name="theme-color" media="(prefers-color-scheme: dark)" content="${THEME_DARK}">`,
  ].join('\n');
  const swRegister = inlineScript(read('sw-register.js'));
  const web = `<!doctype html>\n<html lang="fr" class="pwa">\n<head>\n${pwaHead}\n${head(localFonts)}\n</head>\n<body>\n${body}\n${scripts}\n${swRegister}\n</body>\n</html>\n`;
  writeFileSync(join(DIST, 'web', 'index.html'), web);

  const manifest = {
    name: APP_NAME,
    short_name: SHORT_NAME,
    description: 'Qui ne te suit pas en retour sur Instagram, à partir des exports officiels.',
    lang: 'fr',
    start_url: './',
    scope: './',
    display: 'standalone',
    background_color: THEME_LIGHT,
    theme_color: THEME_LIGHT,
    icons: [
      { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
  writeFileSync(join(DIST, 'web', 'manifest.webmanifest'), JSON.stringify(manifest, null, 2));

  for (const f of icons) copyFileSync(join(SRC, 'icons', f), join(DIST, 'web', 'icons', f));
  for (const f of [...fontFiles, 'LICENSES.md']) copyFileSync(join(SRC, 'fonts', f), join(DIST, 'web', 'fonts', f));

  const sw = read('sw.js')
    .replace('__VERSION__', version)
    .replace('__ASSETS__', JSON.stringify(['./', 'index.html', 'manifest.webmanifest', ...icons.map((f) => 'icons/' + f), ...fontFiles.map((f) => 'fonts/' + f)]));
  // un marqueur oublié casse le service worker (plus de hors connexion ni de mise à jour) : refuser le build
  if (/__VERSION__|__ASSETS__/.test(sw)) throw new Error('sw.js : marqueur __VERSION__ ou __ASSETS__ non remplacé');
  writeFileSync(join(DIST, 'web', 'sw.js'), sw);

  // 2) Version page Claude (sans doctype ni <head> : Claude ajoute le squelette)
  writeFileSync(join(DIST, 'claude-artifact.html'), `${head(googleFonts)}\n${body}\n${scripts}\n`);

  if (!quiet) console.log(`Build ${version} terminé → dist/web/ et dist/claude-artifact.html`);
  return version;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) build();
