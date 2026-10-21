// Pilote Chrome ou Edge en mode headless par le protocole de débogage (CDP), sans dépendance npm.
// Utilisé par icons.mjs (rendu des icônes) et tests/e2e.mjs (test de l'interface).
// Il faut Node.js 22 ou plus (WebSocket intégré). Navigateur ailleurs : variable CHROME=/chemin/vers/chrome
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

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

export const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** Vérifie les prérequis ; renvoie un message d'erreur, ou null si tout est là. */
export function missingRequirement() {
  if (typeof WebSocket === 'undefined') return `Node.js 22 ou plus est nécessaire (version actuelle : ${process.version}).`;
  if (!BROWSERS.some((p) => p && existsSync(p))) return 'Chrome ou Edge introuvable. Indique son chemin : CHROME=/chemin/vers/chrome';
  return null;
}

/**
 * Lance un navigateur vierge (profil temporaire) et se connecte à son onglet.
 * Renvoie { send(méthode, params), on(événement, fn), evaluate(expression), close() }.
 */
export async function launchBrowser() {
  const problem = missingRequirement();
  if (problem) throw new Error(problem);
  const profile = mkdtempSync(join(tmpdir(), 'tascru-chrome-'));
  const port = 9300 + Math.floor(Math.random() * 600);
  const proc = spawn(BROWSERS.find((p) => p && existsSync(p)), [
    '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
    `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, 'about:blank',
  ], { stdio: 'ignore' });

  const close = async () => {
    proc.kill();
    await wait(300);
    try { rmSync(profile, { recursive: true, force: true }); } catch (e) { /* fichier encore tenu par le navigateur */ }
  };

  try {
    let target;
    for (let i = 0; i < 60 && !target; i++) {
      await wait(250);
      try {
        target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === 'page');
      } catch (e) { /* navigateur pas encore prêt */ }
    }
    if (!target) throw new Error('le navigateur n\'a pas démarré');

    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { ws.addEventListener('open', resolve); ws.addEventListener('error', reject); });
    let id = 0;
    const pending = new Map();
    const listeners = new Map();
    ws.addEventListener('message', (e) => {
      const m = JSON.parse(e.data);
      if (m.id && pending.has(m.id)) {
        const { resolve, reject } = pending.get(m.id);
        pending.delete(m.id);
        if (m.error) reject(new Error(`${m.error.message} (${m.error.code})`)); else resolve(m.result);
      } else if (m.method && listeners.has(m.method)) {
        for (const fn of listeners.get(m.method)) fn(m.params);
      }
    });

    const send = (method, params = {}) => new Promise((resolve, reject) => {
      const i = ++id;
      pending.set(i, { resolve, reject });
      ws.send(JSON.stringify({ id: i, method, params }));
    });
    const on = (method, fn) => listeners.set(method, [...(listeners.get(method) || []), fn]);
    /** Évalue une expression dans la page (promesses attendues) et renvoie sa valeur. */
    async function evaluate(expression) {
      const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) throw new Error('Erreur dans la page : ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
      return r.result.value;
    }

    return { send, on, evaluate, close: async () => { ws.close(); await close(); } };
  } catch (e) {
    await close();
    throw e;
  }
}
