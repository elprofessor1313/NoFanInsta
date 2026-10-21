/*
 * Point d'entrée de « T’as cru j’étais ton fan ? » : état de l'app, accès aux exports enregistrés,
 * réglages de l'utilisateur, navigation entre onglets et démarrage.
 * L'affichage des onglets est dans audit.js (Résultats) et exports.js (Exports) ; l'Aide est statique.
 */
(function () {
  'use strict';

  const C = window.DesabosCompare;
  const Storage = window.DesabosStorage;
  const Demo = window.DesabosDemo;
  const { $, fillIcons, toast } = window.DesabosDom;

  const VIEWS = ['audit', 'exports', 'help'];

  const state = {
    store: null,
    metas: [],             // exports enregistrés (fiches), du plus ancien au plus récent
    demo: false,           // aucun export : données d'exemple
    demoSnaps: new Map(),
    cache: new Map(),      // exports complets déjà chargés, par id
    // période comparée
    from: null,
    to: null,
    preset: 'last',        // 'last' | 'all' | nombre de jours (texte) | null si choix libre
    rangeExact: true,
    // affichage des résultats
    seg: 'lost',           // 'lost' | 'gained' | 'noBack' (Fan Zone)
    noBackView: 'list',    // Fan Zone : 'list' | 'excluded' | 'ghosts'
    q: '',
    onlyFollowing: false,
    result: null,
    renderToken: 0,
    // réglages de l'utilisateur : { pseudo: date (ms) }
    done: {},
    excluded: {},
    ghosts: {},
    // onglet Exports
    draft: null,
    pendingDelete: null,
    view: 'audit',
  };

  /* ---------- Données ---------- */

  async function getSnap(id) {
    if (state.demo) return state.demoSnaps.get(id);
    if (state.cache.has(id)) return state.cache.get(id);
    const s = await state.store.load(id);
    if (s) state.cache.set(id, s);
    return s;
  }

  /** Relit la liste des exports (ou l'exemple s'il n'y en a aucun), puis réaffiche. */
  async function refresh() {
    let metas = [];
    try { metas = await state.store.list(); } catch (e) { metas = []; }
    state.demo = metas.length === 0;
    if (state.demo) {
      const snaps = Demo.build();
      state.demoSnaps = new Map(snaps.map((s) => [s.id, s]));
      metas = snaps.map(Storage.metaOf);
    }
    state.metas = metas;
    const ids = new Set(metas.map((m) => m.id));
    if (!ids.has(state.from) || !ids.has(state.to)) applyPreset(state.preset || 'last');
    render();
  }

  function applyPreset(preset) {
    const r = C.pickRange(state.metas, preset);
    state.preset = preset;
    state.rangeExact = r ? r.exact : true;
    state.from = r ? r.from : null;
    state.to = r ? r.to : null;
  }

  /* ---------- Réglages ---------- */

  const settings = () => ({ done: state.done, excluded: state.excluded, ghosts: state.ghosts });

  function loadSettings(s) {
    state.done = (s && s.done) || {};
    state.excluded = (s && s.excluded) || {};
    state.ghosts = (s && s.ghosts) || {};
  }

  async function saveSettings() {
    if (state.demo) return;
    try { await state.store.setSettings(settings()); } catch (e) { /* non bloquant */ }
  }

  /** Résultat d'un enregistrement de fichier (Files.saveFile) → message. */
  function reportSave(result, ok) {
    const msg = {
      saved: ok,
      busy: 'Un enregistrement est déjà en cours. Réessaie dans un instant.',
      failed: 'L\'enregistrement de fichiers n\'est pas possible ici.',
    }[result];
    if (msg) toast(msg);
  }

  /* ---------- Navigation et affichage ---------- */

  function setView(view) {
    state.view = view;
    for (const b of document.querySelectorAll('.view-tab')) b.setAttribute('aria-selected', String(b.dataset.view === view));
    for (const v of VIEWS) $('view-' + v).hidden = view !== v;
    renderBanner();
    window.scrollTo(0, 0);
  }

  // bandeau « Exemple » : seulement sans export, et pas dans l'Aide
  const renderBanner = () => { $('demo-banner').hidden = !state.demo || state.view === 'help'; };

  function render() {
    renderBanner();
    $('exports-count').textContent = state.demo ? '' : String(state.metas.length);
    audit.render();
    exportsView.render();
  }

  const ctx = { state, getSnap, refresh, applyPreset, render, setView, settings, loadSettings, saveSettings, reportSave };
  const audit = window.DesabosAudit.create(ctx);
  const exportsView = window.DesabosExports.create(ctx);

  function bind() {
    for (const b of document.querySelectorAll('.view-tab')) b.addEventListener('click', () => setView(b.dataset.view));
    // liens « aller à l'onglet… » (Aide, Exports)
    document.addEventListener('click', (e) => {
      const g = e.target.closest('[data-goto]');
      if (g) setView(g.dataset.goto);
    });
    $('demo-import').addEventListener('click', () => { setView('exports'); $('file-input').click(); });
    audit.bind();
    exportsView.bind();
  }

  /* ---------- Démarrage ---------- */

  async function loadAll() {
    try { loadSettings(await state.store.getSettings()); } catch (e) { loadSettings({}); }
    await refresh();
  }

  async function start() {
    fillIcons(document);
    if (window.DESABOS_VERSION) $('app-version').textContent = 'Version ' + window.DESABOS_VERSION;
    bind();
    state.store = Storage.createStore();
    await state.store.init(loadAll); // rappelé quand la base du compte Claude devient disponible
    await loadAll();
  }

  start();
})();
