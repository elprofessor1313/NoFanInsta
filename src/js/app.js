/*
 * Interface de « T’as cru j’étais ton fan ? ».
 */
(function () {
  'use strict';

  const P = window.DesabosParser;
  const C = window.DesabosCompare;
  const Storage = window.DesabosStorage;
  const Files = window.DesabosFiles;
  const Demo = window.DesabosDemo;

  const $ = (id) => document.getElementById(id);
  const nf = new Intl.NumberFormat('fr-FR');
  const fmtDay = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
  const fmtDayNoYear = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' });
  const fmtMonth = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' });
  const fmtSelect = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

  const EYE_OFF_SVG = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1.5 8s2.4-4.5 6.5-4.5S14.5 8 14.5 8s-2.4 4.5-6.5 4.5S1.5 8 1.5 8z"/><circle cx="8" cy="8" r="2"/><path d="M2.5 2.5l11 11"/></svg>';
  const GHOST_SVG = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" aria-hidden="true"><path d="M3 14.2V7.2a5 5 0 0 1 10 0v7L11.3 13l-1.6 1.2L8 13l-1.7 1.2L4.7 13z"/><circle cx="6.2" cy="7.4" r="1" fill="currentColor" stroke="none"/><circle cx="9.8" cy="7.4" r="1" fill="currentColor" stroke="none"/></svg>';
  const ico = (svg) => `<span class="inline-ico">${svg}</span>`;
  const CHECK_SVG = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 8.5l3.2 3L13 4.5"/></svg>';

  const state = {
    store: null,
    metas: [],
    demo: false,
    demoSnaps: new Map(),
    cache: new Map(),
    from: null,
    to: null,
    preset: 'last',
    seg: 'lost',
    q: '',
    onlyFollowing: false,
    done: {},
    excluded: {},
    ghosts: {},
    noBackView: 'list', // « Sans retour » : list | excluded | ghosts
    draft: null,
    view: 'audit',
    pendingDelete: null,
    result: null,
    renderToken: 0,
  };

  /* ---------------- Utilitaires ---------------- */

  function plural(n, one, many) { return n === 1 ? one : many; }

  function dateLabel(ms, withYear) {
    const d = new Date(ms);
    const sameYear = d.getFullYear() === new Date().getFullYear();
    return (withYear || !sameYear ? fmtDay : fmtDayNoYear).format(d);
  }

  function sinceLabel(ts) {
    if (!ts) return '';
    return fmtMonth.format(new Date(ts * 1000));
  }

  function isoDay(ms) {
    const d = new Date(ms);
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }

  // Libellé d'un export ; plusieurs exports le même jour sont numérotés n°1, n°2… (ordre de création)
  function snapLabel(m, fmt) {
    const day = isoDay(m.takenAt);
    const same = state.metas.filter((x) => isoDay(x.takenAt) === day);
    const label = (fmt || fmtDay).format(new Date(m.takenAt));
    return same.length > 1 ? `${label} · n°${same.indexOf(m) + 1}` : label;
  }

  function msFromIso(iso) {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d, 12, 0, 0, 0).getTime();
  }

  let toastTimer = null;
  function toast(msg) {
    const el = $('toast');
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 3200);
  }

  function el(tag, attrs, children) {
    const n = document.createElement(tag);
    if (attrs) {
      for (const k of Object.keys(attrs)) {
        const v = attrs[k];
        if (v === null || v === undefined || v === false) continue;
        if (k === 'class') n.className = v;
        else if (k === 'text') n.textContent = v;
        else if (k === 'html') n.innerHTML = v;
        else n.setAttribute(k, v === true ? '' : v);
      }
    }
    for (const c of [].concat(children || [])) if (c) n.append(c);
    return n;
  }

  /* ---------------- Données ---------------- */

  async function getSnap(id) {
    if (state.demo) return state.demoSnaps.get(id);
    if (state.cache.has(id)) return state.cache.get(id);
    const s = await state.store.load(id);
    if (s) state.cache.set(id, s);
    return s;
  }

  async function refresh() {
    let metas = [];
    try { metas = await state.store.list(); } catch (e) { metas = []; }
    if (metas.length === 0) {
      state.demo = true;
      const snaps = Demo.build();
      state.demoSnaps = new Map(snaps.map((s) => [s.id, s]));
      state.metas = snaps.map((s) => Object.assign(Storage.metaOf(s), { where: 'demo' }));
    } else {
      state.demo = false;
      state.metas = metas;
    }
    const ids = new Set(state.metas.map((m) => m.id));
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

  async function saveSettings() {
    if (state.demo) return;
    try { await state.store.setSettings({ done: state.done, excluded: state.excluded, ghosts: state.ghosts }); } catch (e) { /* non bloquant */ }
  }

  /* ---------------- Rendu : navigation ---------------- */

  function setView(view) {
    state.view = view;
    for (const b of document.querySelectorAll('.view-tab')) {
      b.setAttribute('aria-selected', String(b.dataset.view === view));
    }
    for (const v of ['audit', 'exports', 'help']) $('view-' + v).hidden = view !== v;
    $('demo-banner').hidden = !state.demo || view === 'help';
    window.scrollTo(0, 0);
  }

  function render() {
    $('demo-banner').hidden = !state.demo || state.view === 'help';
    $('exports-count').textContent = state.demo ? '' : String(state.metas.length);
    renderPeriod();
    renderAudit();
    renderExports();
  }

  /* ---------------- Rendu : période ---------------- */

  function renderPeriod() {
    const metas = state.metas;
    const many = metas.length >= 2;
    $('period').hidden = metas.length === 0;
    for (const id of ['sel-from', 'sel-to']) {
      const sel = $(id);
      sel.textContent = '';
      for (const m of metas) {
        sel.append(el('option', { value: m.id, text: snapLabel(m) }));
      }
      sel.disabled = !many;
    }
    $('sel-from').value = state.from || '';
    $('sel-to').value = state.to || '';
    $('presets').hidden = !many;
    for (const c of document.querySelectorAll('.chip')) {
      c.setAttribute('aria-pressed', String(c.dataset.preset === String(state.preset)));
    }

    const note = $('period-note');
    note.textContent = '';
    if (!many) {
      note.append('Un seul export pour l\'instant. Ajoute un export plus récent pour voir qui est parti entre les deux.');
      return;
    }
    const a = metas.find((m) => m.id === state.from);
    const b = metas.find((m) => m.id === state.to);
    if (!a || !b) return;
    const days = C.daysBetween(a.takenAt, b.takenAt);
    if (a.id === b.id) {
      note.append('Choisis deux exports différents pour comparer.');
    } else {
      note.append('Période comparée : ', el('strong', { text: days ? `${nf.format(days)} ${plural(days, 'jour', 'jours')}` : 'le même jour' }), '.');
      if (!state.rangeExact) note.append(' Aucun export assez ancien : la comparaison part du plus ancien disponible.');
    }
  }

  /* ---------------- Rendu : audit ---------------- */

  async function renderAudit() {
    const token = ++state.renderToken;
    const metas = state.metas;
    if (metas.length === 0) return;

    const a = await getSnap(state.from);
    const b = await getSnap(state.to);
    if (token !== state.renderToken || !a || !b) return;

    const [older, newer] = C.snapOrder(a, b) <= 0 ? [a, b] : [b, a];
    const single = metas.length < 2 || older.id === newer.id;
    const res = single
      ? { lost: [], gained: [], noBack: C.notFollowingBack(newer), stillCount: 0, hasFollowing: newer.following.length > 0 }
      : C.diff(older, newer);
    res.lostAll = res.lost;
    res.gainedAll = res.gained;
    res.noBackAll = res.noBack;
    state.result = { res, older, newer, single };

    if (single && state.seg !== 'noBack') state.seg = 'noBack';

    for (const s of document.querySelectorAll('.seg')) {
      s.setAttribute('aria-selected', String(s.dataset.seg === state.seg));
      s.disabled = single && s.dataset.seg !== 'noBack';
    }

    renderFilters();
  }

  // Applique les listes de l'utilisateur : fantômes masqués partout, exclus masqués de « Sans retour ».
  // Les comptes masqués restent consultables avec les filtres « Exclus » (œil barré) et « Fantômes ».
  function renderFilters() {
    const { res, single } = state.result;
    const ghosts = state.ghosts;
    res.lost = C.splitExcluded(res.lostAll, ghosts).kept;
    res.gained = C.splitExcluded(res.gainedAll, ghosts).kept;
    res.stillCount = res.lost.filter((r) => r.stillFollowing).length;
    const nb = C.splitExcluded(res.noBackAll, ghosts);
    const ex = C.splitExcluded(nb.kept, state.excluded);
    res.noBack = ex.kept;
    res.noBackExcluded = ex.hidden;
    res.noBackGhosts = nb.hidden.length;
    res.ghostRows = Object.keys(ghosts).sort().map((u) => ({ u, since: 0 }));
    if ((state.noBackView === 'excluded' && !ex.hidden.length) || (state.noBackView === 'ghosts' && !res.ghostRows.length)) {
      state.noBackView = 'list';
    }

    $('n-lost').textContent = single ? '–' : nf.format(onlyStill() ? res.stillCount : res.lost.length);
    $('n-gained').textContent = single ? '–' : nf.format(res.gained.length);
    $('n-noBack').textContent = nf.format(res.noBack.length);
    renderHeadline();
    renderList();
  }

  // Filtre « Seulement ceux que je suis encore » actif (et applicable) sur les départs
  function onlyStill() {
    return state.onlyFollowing && state.result && state.result.res.hasFollowing;
  }

  function renderHeadline() {
    const h = $('headline');
    h.textContent = '';
    const { res, older, newer, single } = state.result;
    const seg = state.seg;
    h.className = 'headline is-' + seg;

    let period = '';
    if (!single && isoDay(older.takenAt) === isoDay(newer.takenAt)) period = `Le ${dateLabel(newer.takenAt, true)}, entre deux exports`;
    else if (!single) period = `Entre le ${dateLabel(older.takenAt)} et le ${dateLabel(newer.takenAt, true)}`;
    const head = (kicker, n, label, sub) => h.append(
      el('p', { class: 'kicker', text: kicker }),
      el('div', { class: 'headline-num' }, [
        el('span', { class: 'big', text: nf.format(n) }),
        el('span', { class: 'big-label', text: label }),
      ]),
      sub
    );

    if (seg === 'noBack') {
      const n = res.noBack.length;
      const x = res.noBackExcluded.length;
      const g = res.noBackGhosts;
      const parts = [];
      if (x) parts.push(`${nf.format(x)} ${plural(x, 'exclu', 'exclus')}`);
      if (g) parts.push(`${nf.format(g)} ${plural(g, 'fantôme', 'fantômes')}`);
      const hidden = parts.length ? ` Masqués : ${parts.join(' et ')}.` : '';
      head('🙄 T’as cru ?', n, plural(n, 'ne te suit pas en retour', 'ne te suivent pas en retour'),
        el('p', { class: 'headline-sub', text: `Tu les suis, eux non. D’après ton export du ${dateLabel(newer.takenAt, true)}.${hidden}` }));
      return;
    }

    if (seg === 'gained') {
      const n = res.gained.length;
      head('🎉 Nouveaux fans', n, plural(n, 'arrivée', 'arrivées'), el('p', { class: 'headline-sub', text: period + '.' }));
      return;
    }

    const total = res.lost.length;
    const sub = el('p', { class: 'headline-sub' });
    sub.append(period);
    if (onlyStill()) {
      const n = res.stillCount;
      sub.append(`, sur ${nf.format(total)} ${plural(total, 'départ', 'départs')} en tout.`);
      head('🧐 Aah ouais, ils sont partis ?', n, plural(n, 'départ que tu suis encore', 'départs que tu suis encore'), sub);
      return;
    }
    const n = total;
    if (n > 0 && res.hasFollowing) {
      sub.append(', dont ');
      sub.append(el('span', { class: 'hot', text: `${nf.format(res.stillCount)} que tu suis encore` }));
    }
    sub.append('.');
    head('🧐 Aah ouais, ils sont partis ?', n, plural(n, 'départ', 'départs'), sub);
  }

  function currentRows() {
    const { res } = state.result;
    let rows = res[state.seg] || [];
    if (state.seg === 'noBack' && state.noBackView === 'excluded') rows = res.noBackExcluded;
    if (state.seg === 'noBack' && state.noBackView === 'ghosts') rows = res.ghostRows;
    if (state.seg === 'lost' && state.onlyFollowing) rows = rows.filter((r) => r.stillFollowing);
    const q = state.q.trim().toLowerCase().replace(/^@/, '');
    if (q) rows = rows.filter((r) => r.u.includes(q));
    return rows;
  }

  function renderList() {
    const list = $('list');
    const empty = $('list-empty');
    const { res } = state.result;
    list.textContent = '';

    $('only-following-wrap').hidden = state.seg !== 'lost' || !res.hasFollowing;
    const nx = res.noBackExcluded.length;
    const ng = res.ghostRows.length;
    $('noback-views').hidden = state.seg !== 'noBack' || !(nx || ng);
    $('n-excluded').textContent = nf.format(nx);
    $('n-ghosts').textContent = nf.format(ng);
    for (const c of document.querySelectorAll('[data-nbv]')) {
      c.setAttribute('aria-pressed', String(c.dataset.nbv === state.noBackView));
      c.hidden = (c.dataset.nbv === 'excluded' && !nx) || (c.dataset.nbv === 'ghosts' && !ng);
    }
    const help = {
      lost: 'Ils te suivaient au début de la période, plus à la fin. Ceux que tu suis encore sont en tête : à toi de voir.',
      gained: 'Ils se sont abonnés pendant la période. Bienvenue à eux.',
      noBack: `Tu les suis, ils ne te suivent pas. Une star ? Touche ${ico(EYE_OFF_SVG)} pour l’exclure. Un compte introuvable sur Instagram ? Touche ${ico(GHOST_SVG)}.`,
      excluded: `Tes exclus : c’est normal qu’ils ne te suivent pas. Touche ${ico(EYE_OFF_SVG)} pour remettre un compte dans la liste.`,
      ghosts: `Tes fantômes : comptes introuvables sur Instagram, masqués de toutes les listes. Touche ${ico(GHOST_SVG)} pour en faire revenir un.`,
    };
    $('seg-help').innerHTML = help[state.seg === 'noBack' && state.noBackView !== 'list' ? state.noBackView : state.seg];

    const rows = currentRows();
    const frag = document.createDocumentFragment();
    for (const r of rows) frag.append(rowEl(r));
    list.append(frag);

    let msg = '';
    let emoji = null;
    if (rows.length === 0) {
      if (state.q) { msg = 'Aucun compte ne correspond à cette recherche.'; emoji = '🔎'; }
      else if (state.seg === 'lost') { msg = state.onlyFollowing ? 'Aucun départ parmi les comptes que tu suis.' : 'Aucun départ sur cette période. Ils t’aiment.'; emoji = '🥰'; }
      else if (state.seg === 'gained') { msg = 'Aucun nouvel abonné sur cette période.'; emoji = '🦗'; }
      else if (res.hasFollowing && (res.noBackExcluded.length || res.noBackGhosts)) { msg = 'Personne d’autre à surveiller : le reste est dans tes exclus ou tes fantômes.'; emoji = '😌'; }
      else if (res.hasFollowing) { msg = 'Tout le monde te suit en retour. Respect.'; emoji = '🏆'; }
      else { msg = 'Cet export ne contient pas la liste des comptes que tu suis.'; emoji = '🤷'; }
    }
    if (state.seg === 'lost' && !res.hasFollowing && rows.length) {
      msg = 'L\'export de fin ne contient pas following.json : impossible de savoir lesquels tu suis encore.';
    }
    empty.textContent = msg;
    if (emoji) empty.dataset.emoji = emoji; else delete empty.dataset.emoji;
    empty.hidden = !msg;
    $('export-csv').hidden = rows.length === 0;
  }

  function rowEl(r) {
    const seg = state.seg;
    const view = seg === 'noBack' ? state.noBackView : 'list';
    const hot = seg === 'lost' && r.stillFollowing;
    // les actions (fantôme, exclure, traité) n'existent que sur « Sans retour »
    const actionable = seg === 'noBack' && view === 'list';
    const done = actionable && !!state.done[r.u];

    const li = el('li', { class: 'row' + (hot ? ' is-hot' : '') + (done ? ' is-done' : '') });
    li.dataset.u = r.u;

    const sub = el('span', { class: 'sub' });
    const since = sinceLabel(r.since);
    if (view === 'ghosts') {
      sub.append(el('span', { class: 'badge ghost', text: 'Fantôme' }));
      if (state.ghosts[r.u]) sub.append(el('span', { text: `rangé le ${dateLabel(state.ghosts[r.u], true)}` }));
    } else if (seg === 'lost') {
      if (hot) sub.append(el('span', { class: 'badge', text: 'Tu le suis encore' }));
      if (since) sub.append(el('span', { text: `abonné depuis ${since}` }));
    } else if (seg === 'gained') {
      if (r.followBack) sub.append(el('span', { class: 'badge soft', text: 'Tu le suis' }));
      if (r.since) sub.append(el('span', { text: `le ${dateLabel(r.since * 1000)}` }));
    } else {
      if (view === 'excluded') sub.append(el('span', { class: 'badge excl', text: 'Exclu' }));
      if (done) sub.append(el('span', { class: 'badge soft', text: 'Traité' }));
      if (since) sub.append(el('span', { text: `suivi depuis ${since}` }));
    }

    const url = `https://www.instagram.com/${encodeURIComponent(r.u)}/`;
    const actions = el('div', { class: 'row-actions' }, [
      el('a', { class: 'open', href: url, target: '_blank', rel: 'noopener noreferrer', text: 'Ouvrir' }),
    ]);
    if (seg === 'noBack' && view !== 'excluded') {
      const ghost = view === 'ghosts';
      actions.append(el('button', {
        type: 'button',
        class: 'ghost-btn',
        'aria-pressed': String(ghost),
        'aria-label': ghost ? `Faire revenir @${r.u} dans les listes` : `Ranger @${r.u} dans les fantômes : compte introuvable`,
        title: ghost ? 'Faire revenir' : 'Fantôme (compte introuvable)',
        html: GHOST_SVG,
        'data-u': r.u,
      }));
    }
    if (seg === 'noBack' && view !== 'ghosts') {
      const excluded = view === 'excluded';
      actions.append(el('button', {
        type: 'button',
        class: 'excl-btn',
        'aria-pressed': String(excluded),
        'aria-label': excluded ? `Remettre @${r.u} dans la liste` : `Exclure @${r.u} : c’est normal qu’il ne te suive pas`,
        title: excluded ? 'Remettre dans la liste' : 'Exclure (c’est normal)',
        html: EYE_OFF_SVG,
        'data-u': r.u,
      }));
    }
    if (actionable) {
      actions.append(el('button', {
        type: 'button',
        class: 'done-btn',
        'aria-pressed': String(done),
        'aria-label': done ? `Marquer @${r.u} comme à traiter` : `Marquer @${r.u} comme traité`,
        title: done ? 'Traité' : 'Marquer comme traité',
        html: CHECK_SVG,
        'data-u': r.u,
      }));
    }
    // 4 actions : sur écran étroit, elles passent sous le pseudo
    if (actions.childElementCount >= 4) li.classList.add('is-stacked');

    li.append(
      el('span', { class: 'avatar av-' + avatarTone(r.u), 'aria-hidden': 'true', text: r.u.replace(/[^a-z0-9]/g, '').charAt(0) || '@' }),
      el('div', { class: 'who' }, [
        el('a', { class: 'handle', href: url, target: '_blank', rel: 'noopener noreferrer', text: '@' + r.u }),
        sub,
      ]),
      actions
    );
    return li;
  }

  // Couleur d'avatar stable pour un même pseudo (6 teintes, voir --av1…--av6)
  function avatarTone(u) {
    let h = 0;
    for (let i = 0; i < u.length; i++) h = (h * 31 + u.charCodeAt(i)) >>> 0;
    return (h % 6) + 1;
  }

  /* ---------------- Rendu : exports ---------------- */

  function renderExports() {
    const list = $('snap-list');
    list.textContent = '';
    const real = state.demo ? [] : state.metas.slice().reverse();
    $('snaps-empty').hidden = real.length > 0;

    for (const m of real) {
      const confirming = state.pendingDelete === m.id;
      const meta = `${nf.format(m.nFollowers)} abonnés · ${nf.format(m.nFollowing)} abonnements` +
        (m.account ? ` · @${m.account}` : '');
      const actions = el('div', { class: 'snap-actions' });
      if (confirming) {
        actions.append(
          el('span', { class: 'snap-confirm', text: 'Supprimer ?' }),
          el('button', { type: 'button', class: 'btn btn-small btn-ghost', 'data-cancel': m.id, text: 'Non' }),
          el('button', { type: 'button', class: 'btn btn-small btn-danger', 'data-confirm': m.id, text: 'Oui' })
        );
      } else {
        actions.append(el('button', { type: 'button', class: 'btn btn-small btn-ghost', 'data-delete': m.id, 'aria-label': `Supprimer l'export du ${dateLabel(m.takenAt, true)}`, text: 'Supprimer' }));
      }
      list.append(el('li', { class: 'snap' }, [
        el('div', {}, [
          el('div', { class: 'snap-date', text: snapLabel(m, fmtSelect) }),
          el('div', { class: 'snap-meta', text: meta }),
        ]),
        actions,
      ]));
    }

    const mode = state.store ? state.store.mode() : 'local';
    const pill = { cloud: 'Compte Claude', local: 'Cet appareil', memory: 'Non conservé' }[mode];
    $('store-pill').textContent = pill;
    $('store-note').textContent = {
      cloud: 'Tes exports sont enregistrés de façon privée dans ton compte Claude : tu les retrouves sur tous tes appareils. Une sauvegarde reste utile pour les garder ailleurs.',
      local: 'Tes exports sont enregistrés dans ce navigateur, sur cet appareil uniquement. Fais une sauvegarde de temps en temps : si les données du site sont effacées, elle permet de tout restaurer.',
      memory: 'Ce navigateur ne permet pas d\'enregistrer les exports (navigation privée ?). Ils seront perdus à la fermeture : exporte une sauvegarde avant de partir.',
    }[mode];
    $('backup-export').disabled = state.demo;

    let standalone = false;
    try { standalone = window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches; } catch (e) { /* */ }
    let framed = false;
    try { framed = window.self !== window.top; } catch (e) { framed = true; }
    $('install-hint').hidden = !(Files.isIOS() && !standalone && !framed);
  }

  /* ---------------- Import ---------------- */

  async function handleFiles(fileList) {
    const files = [...fileList];
    if (!files.length) return;
    setView('exports');
    toast('Lecture du fichier…');
    let parsed;
    try {
      const items = await Promise.all(files.map(async (f) => ({
        name: f.name,
        bytes: new Uint8Array(await f.arrayBuffer()),
        lastModified: f.lastModified,
      })));
      parsed = await P.parseInputs(items);
    } catch (e) {
      const msg = String(e && e.message || e);
      if (msg.startsWith('zip_unsupported')) toast('Ce navigateur ne sait pas ouvrir les .zip. Décompresse-le et choisis les fichiers .json.');
      else if (msg.startsWith('zip')) toast('Ce .zip est illisible. Télécharge à nouveau l\'export depuis Instagram.');
      else if (msg.startsWith('json_invalid')) toast('Un des fichiers .json est abîmé. Télécharge à nouveau l\'export.');
      else toast('Fichier illisible : ' + msg);
      return;
    }

    if (parsed.backup) { await restoreBackup(parsed.backup); return; }

    if (!parsed.hasFollowers) {
      toast('Aucune liste d\'abonnés trouvée. Il faut le fichier followers_1.json (ou le .zip complet).');
      return;
    }

    const warnings = [];
    if (!parsed.hasFollowing) warnings.push('following.json est absent : tu verras les départs, mais pas lesquels tu suis encore.');
    if (parsed.followers.size === 0) warnings.push('La liste d\'abonnés est vide. Vérifie que l\'export couvre la période « Depuis le début ».');

    const date = parsed.date || isoDay(Date.now());
    const sameDay = state.demo ? null : state.metas.find((m) => isoDay(m.takenAt) === date);
    if (sameDay && parsed.stamp) warnings.push(`Tu as déjà un export daté du ${dateLabel(sameDay.takenAt, true)} : pas de souci, ils seront comparés dans l'ordre où Instagram les a créés.`);
    else if (sameDay) warnings.push(`Tu as déjà un export daté du ${dateLabel(sameDay.takenAt, true)}. Vérifie la date : deux exports du même jour sont rangés dans l'ordre où tu les ajoutes.`);

    state.draft = {
      followers: [...parsed.followers],
      following: [...parsed.following],
      account: parsed.account,
      stamp: parsed.stamp,
    };
    $('draft-followers').textContent = nf.format(parsed.followers.size);
    $('draft-following').textContent = parsed.hasFollowing ? nf.format(parsed.following.size) : '–';
    $('draft-date').value = date;
    $('draft-date').max = isoDay(Date.now());
    const wl = $('draft-warnings');
    wl.textContent = '';
    for (const w of warnings) wl.append(el('li', { text: w }));
    $('draft').hidden = false;
    $('toast').hidden = true;
    $('draft').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function saveDraft() {
    const d = state.draft;
    if (!d) return;
    const iso = $('draft-date').value;
    if (!iso) { toast('Indique la date de l\'export.'); return; }
    const takenAt = msFromIso(iso);
    const snap = {
      id: 's' + takenAt.toString(36) + Math.random().toString(36).slice(2, 7),
      takenAt,
      stamp: d.stamp || null,
      account: d.account || null,
      createdAt: Date.now(),
      followers: d.followers,
      following: d.following,
    };
    $('draft-save').disabled = true;
    try {
      await state.store.save(snap);
    } catch (e) {
      toast('Enregistrement impossible : ' + (e && e.message || e));
      $('draft-save').disabled = false;
      return;
    }
    $('draft-save').disabled = false;
    state.cache.set(snap.id, snap);
    state.draft = null;
    $('draft').hidden = true;
    $('file-input').value = '';
    await refresh();
    // toujours le dernier écart : un export ajouté après coup peut être plus ancien que les autres
    applyPreset('last');
    state.seg = state.metas.length >= 2 ? 'lost' : 'noBack';
    render();
    toast(`Export du ${dateLabel(takenAt, true)} enregistré.`);
    if (state.metas.length >= 2) setView('audit');
  }

  async function restoreBackup(data) {
    let n = 0;
    const known = new Set(state.demo ? [] : state.metas.map((m) => m.id));
    for (const s of data.snapshots) {
      if (!s || !s.id || !Array.isArray(s.followers) || known.has(s.id)) continue;
      const snap = {
        id: String(s.id), takenAt: Number(s.takenAt), stamp: Number(s.stamp) || null, account: s.account || null, createdAt: s.createdAt || Date.now(),
        followers: s.followers.filter((x) => Array.isArray(x) && P.normUser(x[0])),
        following: (s.following || []).filter((x) => Array.isArray(x) && P.normUser(x[0])),
      };
      await state.store.save(snap);
      state.cache.set(snap.id, snap);
      n++;
    }
    if (data.settings && (data.settings.done || data.settings.excluded || data.settings.ghosts)) {
      state.done = Object.assign({}, data.settings.done, state.done);
      state.excluded = Object.assign({}, data.settings.excluded, state.excluded);
      state.ghosts = Object.assign({}, data.settings.ghosts, state.ghosts);
      await saveSettings();
    }
    $('file-input').value = '';
    state.from = state.to = null;
    await refresh();
    toast(n ? `${n} ${plural(n, 'export restauré', 'exports restaurés')}.` : 'Tous les exports de cette sauvegarde sont déjà présents.');
  }

  async function exportBackup() {
    if (state.demo) return;
    const snapshots = [];
    for (const m of state.metas) {
      const s = await getSnap(m.id);
      if (s) snapshots.push({ id: s.id, takenAt: s.takenAt, stamp: s.stamp || null, account: s.account, createdAt: s.createdAt, followers: s.followers, following: s.following });
    }
    // « desabos » : identifiant du format de sauvegarde (ancien nom de l'app), à garder pour relire les anciennes sauvegardes
    const body = JSON.stringify({ app: 'desabos', version: 1, exportedAt: Date.now(), settings: { done: state.done, excluded: state.excluded, ghosts: state.ghosts }, snapshots });
    const r = await Files.saveFile(`tas-cru-sauvegarde-${isoDay(Date.now())}.json`, body, 'application/json');
    reportSave(r, 'Sauvegarde exportée.');
  }

  function reportSave(r, ok) {
    if (r === 'saved') toast(ok);
    else if (r === 'busy') toast('Un enregistrement est déjà en cours. Réessaie dans un instant.');
    else if (r === 'failed') toast('L\'enregistrement de fichiers n\'est pas possible ici.');
  }

  async function exportCsv() {
    if (!state.result) return;
    const rows = currentRows();
    const esc = (v) => /[",\n;]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
    const lines = [['compte', 'lien', 'statut', 'depuis'].join(',')];
    for (const r of rows) {
      let status = '';
      if (state.seg === 'lost') status = r.stillFollowing ? 'parti, tu le suis encore' : 'parti';
      else if (state.seg === 'gained') status = r.followBack ? 'arrivé, tu le suis' : 'arrivé';
      else if (state.noBackView === 'ghosts') status = 'fantôme (compte introuvable)';
      else status = state.excluded[r.u] ? 'ne te suit pas (exclu, normal)' : 'ne te suit pas';
      if (state.done[r.u] && state.seg === 'noBack') status += ' (traité)';
      lines.push([r.u, `https://www.instagram.com/${r.u}/`, status, r.since ? isoDay(r.since * 1000) : ''].map(esc).join(','));
    }
    const { older, newer, single } = state.result;
    const name = single
      ? `tas-cru-${state.seg}-${isoDay(newer.takenAt)}.csv`
      : `tas-cru-${state.seg}-${isoDay(older.takenAt)}_${isoDay(newer.takenAt)}.csv`;
    const r = await Files.saveFile(name, '﻿' + lines.join('\n'), 'text/csv');
    reportSave(r, 'Liste exportée.');
  }

  /* ---------------- Événements ---------------- */

  function bind() {
    for (const b of document.querySelectorAll('.view-tab')) {
      b.addEventListener('click', () => setView(b.dataset.view));
    }
    $('demo-import').addEventListener('click', () => { setView('exports'); $('file-input').click(); });
    // liens « aller à l'onglet… » (aide, exports)
    document.addEventListener('click', (e) => {
      const g = e.target.closest('[data-goto]');
      if (g) setView(g.dataset.goto);
    });

    $('sel-from').addEventListener('change', (e) => { state.from = e.target.value; state.preset = null; state.rangeExact = true; renderPeriod(); renderAudit(); });
    $('sel-to').addEventListener('change', (e) => { state.to = e.target.value; state.preset = null; state.rangeExact = true; renderPeriod(); renderAudit(); });
    $('presets').addEventListener('click', (e) => {
      const c = e.target.closest('.chip');
      if (!c) return;
      applyPreset(c.dataset.preset === 'last' || c.dataset.preset === 'all' ? c.dataset.preset : Number(c.dataset.preset));
      state.preset = c.dataset.preset;
      renderPeriod();
      renderAudit();
    });

    $('segments').addEventListener('click', (e) => {
      const s = e.target.closest('.seg');
      if (!s || s.disabled) return;
      state.seg = s.dataset.seg;
      for (const x of document.querySelectorAll('.seg')) x.setAttribute('aria-selected', String(x === s));
      renderHeadline();
      renderList();
    });
    $('search').addEventListener('input', (e) => { state.q = e.target.value; if (state.result) renderList(); });
    $('only-following').addEventListener('change', (e) => { state.onlyFollowing = e.target.checked; if (state.result) renderFilters(); });
    $('noback-views').addEventListener('click', (e) => {
      const c = e.target.closest('[data-nbv]');
      if (!c || !state.result) return;
      state.noBackView = c.dataset.nbv;
      renderList();
    });

    $('list').addEventListener('click', (e) => {
      const x = e.target.closest('.excl-btn');
      if (x) {
        const u = x.dataset.u;
        if (state.excluded[u]) { delete state.excluded[u]; toast(`@${u} est de retour dans la liste.`); }
        else { state.excluded[u] = Date.now(); toast(`@${u} exclu : il n’apparaîtra plus ici.`); }
        saveSettings();
        renderFilters();
        return;
      }
      const g = e.target.closest('.ghost-btn');
      if (g) {
        const u = g.dataset.u;
        if (state.ghosts[u]) { delete state.ghosts[u]; toast(`@${u} revient dans les listes.`); }
        else { state.ghosts[u] = Date.now(); toast(`@${u} rangé dans les fantômes.`); }
        saveSettings();
        renderFilters();
        return;
      }
      const b = e.target.closest('.done-btn');
      if (!b) return;
      const u = b.dataset.u;
      if (state.done[u]) delete state.done[u]; else state.done[u] = Date.now();
      const li = b.closest('.row');
      li.replaceWith(rowEl(Object.assign({}, findRow(u))));
      saveSettings();
    });

    $('export-csv').addEventListener('click', exportCsv);
    $('backup-export').addEventListener('click', exportBackup);

    $('file-input').addEventListener('change', (e) => handleFiles(e.target.files));
    $('draft-cancel').addEventListener('click', () => { state.draft = null; $('draft').hidden = true; $('file-input').value = ''; });
    $('draft-save').addEventListener('click', saveDraft);

    $('snap-list').addEventListener('click', async (e) => {
      const t = e.target.closest('button');
      if (!t) return;
      if (t.dataset.delete) { state.pendingDelete = t.dataset.delete; renderExports(); return; }
      if (t.dataset.cancel) { state.pendingDelete = null; renderExports(); return; }
      if (t.dataset.confirm) {
        const id = t.dataset.confirm;
        state.pendingDelete = null;
        try { await state.store.remove(id); } catch (err) { toast('Suppression impossible.'); }
        state.cache.delete(id);
        await refresh();
        toast('Export supprimé.');
      }
    });

    const dz = $('dropzone');
    ['dragenter', 'dragover'].forEach((t) => dz.addEventListener(t, (e) => { e.preventDefault(); dz.classList.add('is-over'); }));
    ['dragleave', 'drop'].forEach((t) => dz.addEventListener(t, (e) => { e.preventDefault(); dz.classList.remove('is-over'); }));
    dz.addEventListener('drop', (e) => { if (e.dataTransfer && e.dataTransfer.files.length) handleFiles(e.dataTransfer.files); });
    // éviter que le navigateur ouvre un fichier lâché à côté de la zone
    window.addEventListener('dragover', (e) => e.preventDefault());
    window.addEventListener('drop', (e) => e.preventDefault());
  }

  function findRow(u) {
    const list = (state.result && state.result.res[state.seg]) || [];
    return list.find((r) => r.u === u);
  }

  function loadSettings(s) {
    state.done = (s && s.done) || {};
    state.excluded = (s && s.excluded) || {};
    state.ghosts = (s && s.ghosts) || {};
  }

  /* ---------------- Démarrage ---------------- */

  async function start() {
    bind();
    state.store = Storage.createStore();
    await state.store.init(async () => {
      try { loadSettings(await state.store.getSettings()); } catch (e) { /* */ }
      await refresh();
    });
    try { loadSettings(await state.store.getSettings()); } catch (e) { loadSettings({}); }
    await refresh();
  }

  start();
})();
