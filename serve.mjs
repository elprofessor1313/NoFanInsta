// Serveur de développement : reconstruit l'app à chaque chargement de page.
//
//   node serve.mjs            → http://localhost:5173
//
// Pour tester sur l'iPhone, connecte-le au même Wi-Fi et ouvre l'adresse
// « Réseau » affichée au démarrage.

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { networkInterfaces } from 'node:os';
import { dirname, join, normalize, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from './build.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), 'dist', 'web');
const PORT = Number(process.env.PORT) || 5173;
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.json': 'application/json',
  '.woff2': 'font/woff2', '.md': 'text/markdown; charset=utf-8',
};

build();

createServer(async (req, res) => {
  let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (path.endsWith('/')) path += 'index.html';
  if (path === '/index.html') {
    try { build({ quiet: true }); } catch (e) { console.error(e); }
  }
  const file = normalize(join(ROOT, path));
  if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
  try {
    const data = await readFile(file);
    res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(data);
  } catch (e) {
    res.writeHead(404).end('Introuvable');
  }
}).listen(PORT, () => {
  console.log(`\nT’as cru j’étais ton fan ? tourne sur :\n  Local   : http://localhost:${PORT}`);
  for (const list of Object.values(networkInterfaces())) {
    for (const a of list || []) {
      if (a.family === 'IPv4' && !a.internal) console.log(`  Réseau  : http://${a.address}:${PORT}`);
    }
  }
  console.log('\nModifie un fichier dans src/ puis recharge la page. Ctrl+C pour arrêter.\n');
});
