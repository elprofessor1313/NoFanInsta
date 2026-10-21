/*
 * Onglet « Résultats » : choix de la période, grand chiffre, listes Départs / Arrivées / Fan Zone,
 * actions sur la Fan Zone et export CSV de la liste affichée.
 */
(function (root) {
  'use strict';

  const C = root.DesabosCompare;
  const F = root.DesabosFormat;
  const Files = root.DesabosFiles;
  const { $, el, inlineIcon, ICONS, toast } = root.DesabosDom;

  /*
   * Actions sur un compte de la Fan Zone. Chacune bascule la présence du pseudo dans une liste
   * de l'utilisateur (state[key] = { pseudo: date }).
   */
  const ACTIONS = {
    ghost: {
      key: 'ghosts', icon: 'ghost',
      label: (u, on) => (on ? `Faire revenir @${u} dans les listes` : `Ranger @${u} dans les fantômes : compte introuvable`),
      title: (on) => (on ? 'Faire revenir' : 'Fantôme (compte introuvable)'),
      toast: (u, on) => (on ? `@${u} rangé dans les fantômes.` : `@${u} revient dans les listes.`),
    },
    exclude: {
      key: 'excluded', icon: 'eyeOff',
      label: (u, on) => (on ? `Remettre @${u} dans la liste` : `Exclure @${u} : c’est normal qu’il ne te suive pas`),
      title: (on) => (on ? 'Remettre dans la liste' : 'Exclure (c’est normal)'),
      toast: (u, on) => (on ? `@${u} exclu : il n’apparaîtra plus ici.` : `@${u} est de retour dans la liste.`),
    },
    done: {
      key: 'done', icon: 'check',
      label: (u, on) => (on ? `Marquer @${u} comme à traiter` : `Marquer @${u} comme traité`),
      title: (on) => (on ? 'Traité' : 'Marquer comme traité'),
      toast: null,
    },
  };

  /** Actions proposées selon la liste affichée : seule la Fan Zone en a. */
  function actionsFor(seg, view) {
    if (seg !== 'noBack') return [];
    if (view === 'excluded') return ['exclude'];
    if (view === 'ghosts') return ['ghost'];
    return ['ghost', 'exclude', 'done'];
  }

  const HELP = {
    lost: 'Ils te suivaient au début de la période, plus à la fin. Ceux que tu suis encore sont en tête : à toi de voir.',
    gained: 'Ils se sont abonnés pendant la période. Bienvenue à eux.',
    noBack: `Tu les suis, ils ne te suivent pas. Une star ? Touche ${inlineIcon('eyeOff')} pour l’exclure. Un compte introuvable sur Instagram ? Touche ${inlineIcon('ghost')}.`,
    excluded: `Tes exclus : c’est normal qu’ils ne te suivent pas. Touche ${inlineIcon('eyeOff')} pour remettre un compte dans la liste.`,
    ghosts: `Tes fantômes : comptes introuvables sur Instagram, masqués de toutes les listes. Touche ${inlineIcon('ghost')} pour en faire revenir un.`,
  };

  // Nom du fichier CSV selon la liste affichée
  const CSV_NAMES = { lost: 'departs', gained: 'arrivees', noBack: 'fan-zone', excluded: 'fan-zone-exclus', ghosts: 'fantomes' };

  const profileUrl = (u) => `https://www.instagram.com/${encodeURIComponent(u)}/`;

  /**
   * ctx : { state, getSnap, saveSettings }.
   * state.result = { base (compareRange), res (après applyUserLists), older, newer, single }.
   */
  function create(ctx) {
    const { state } = ctx;

    /** Liste affichée : 'lost', 'gained', 'noBack', ou pour la Fan Zone 'excluded' / 'ghosts'. */
    const listKey = () => (state.seg === 'noBack' && state.noBackView !== 'list' ? state.noBackView : state.seg);

    /** Filtre « Seulement ceux que je suis encore » actif et applicable. */
    const onlyStill = () => state.onlyFollowing && !!state.result && state.result.res.hasFollowing;

    /* ---------- Période ---------- */

    function renderPeriod() {
      const metas = state.metas;
      const many = metas.length >= 2;
      $('period').hidden = metas.length === 0;
      for (const id of ['sel-from', 'sel-to']) {
        const sel = $(id);
        sel.textContent = '';
        for (const m of metas) sel.append(el('option', { value: m.id, text: F.snapLabel(m, metas) }));
        sel.disabled = !many;
      }
      $('sel-from').value = state.from || '';
      $('sel-to').value = state.to || '';
      $('presets').hidden = !many;
      for (const c of document.querySelectorAll('[data-preset]')) {
        c.setAttribute('aria-pressed', String(c.dataset.preset === state.preset));
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
      if (a.id === b.id) {
        note.append('Choisis deux exports différents pour comparer.');
        return;
      }
      const days = C.daysBetween(a.takenAt, b.takenAt);
      note.append('Période comparée : ', el('strong', { text: days ? F.count(days, 'jour', 'jours') : 'le même jour' }), '.');
      if (!state.rangeExact) note.append(' Aucun export assez ancien : la comparaison part du plus ancien disponible.');
    }

    /* ---------- Calcul ---------- */

    /** Compare les deux exports choisis, puis affiche. */
    async function compute() {
      const token = ++state.renderToken;
      if (state.metas.length === 0) return;
      const a = await ctx.getSnap(state.from);
      const b = await ctx.getSnap(state.to);
      if (token !== state.renderToken || !a || !b) return; // un calcul plus récent a pris la main

      const [older, newer] = C.snapOrder(a, b) <= 0 ? [a, b] : [b, a];
      const single = older.id === newer.id;
      state.result = { base: C.compareRange(older, newer), res: null, older, newer, single };
      if (single) state.seg = 'noBack';
      renderSegments();
      applyLists();
    }

    /** Applique fantômes et exclus au dernier calcul, puis met tout l'affichage à jour. */
    function applyLists() {
      const r = state.result;
      r.res = C.applyUserLists(r.base, state);
      if ((state.noBackView === 'excluded' && !r.res.noBackExcluded.length) ||
          (state.noBackView === 'ghosts' && !r.res.ghostRows.length)) {
        state.noBackView = 'list';
      }
      const { res, single } = r;
      $('n-lost').textContent = single ? '–' : F.num(onlyStill() ? res.stillCount : res.lost.length);
      $('n-gained').textContent = single ? '–' : F.num(res.gained.length);
      $('n-noBack').textContent = F.num(res.noBack.length);
      renderHeadline();
      renderList();
    }

    function renderSegments() {
      const single = state.result && state.result.single;
      for (const s of document.querySelectorAll('.seg')) {
        s.setAttribute('aria-selected', String(s.dataset.seg === state.seg));
        s.disabled = !!single && s.dataset.seg !== 'noBack';
      }
    }

    /* ---------- Grand chiffre ---------- */

    function renderHeadline() {
      const h = $('headline');
      const { res, older, newer, single } = state.result;
      h.textContent = '';
      h.className = 'headline is-' + state.seg;
      const show = (kicker, n, label, sub) => h.append(
        el('p', { class: 'kicker', text: kicker }),
        el('div', { class: 'headline-num' }, [
          el('span', { class: 'big', text: F.num(n) }),
          el('span', { class: 'big-label', text: label }),
        ]),
        sub
      );
      const period = single ? '' : F.periodText(older, newer);

      if (state.seg === 'noBack') {
        const n = res.noBack.length;
        const hidden = [];
        if (res.noBackExcluded.length) hidden.push(F.count(res.noBackExcluded.length, 'exclu', 'exclus'));
        if (res.noBackGhosts) hidden.push(F.count(res.noBackGhosts, 'fantôme', 'fantômes'));
        const text = `Tu les suis, eux non. D’après ton export du ${F.dateLabel(newer.takenAt, true)}.` +
          (hidden.length ? ` Masqués : ${hidden.join(' et ')}.` : '');
        show('🙄 T’as cru ?', n, F.plural(n, 'ne te suit pas en retour', 'ne te suivent pas en retour'),
          el('p', { class: 'headline-sub', text }));
        return;
      }

      if (state.seg === 'gained') {
        const n = res.gained.length;
        show('🎉 Nouveaux fans', n, F.plural(n, 'arrivée', 'arrivées'), el('p', { class: 'headline-sub', text: period + '.' }));
        return;
      }

      const total = res.lost.length;
      const sub = el('p', { class: 'headline-sub' }, period);
      if (onlyStill()) {
        sub.append(`, sur ${F.count(total, 'départ', 'départs')} en tout.`);
        const n = res.stillCount;
        show('🧐 Aah ouais, ils sont partis ?', n, F.plural(n, 'départ que tu suis encore', 'départs que tu suis encore'), sub);
        return;
      }
      if (total > 0 && res.hasFollowing) {
        sub.append(', dont ', el('span', { class: 'hot', text: `${F.num(res.stillCount)} que tu suis encore` }));
      }
      sub.append('.');
      show('🧐 Aah ouais, ils sont partis ?', total, F.plural(total, 'départ', 'départs'), sub);
    }

    /* ---------- Liste ---------- */

    function currentRows() {
      const { res } = state.result;
      const rows = { lost: res.lost, gained: res.gained, noBack: res.noBack, excluded: res.noBackExcluded, ghosts: res.ghostRows }[listKey()];
      const q = state.q.trim().toLowerCase().replace(/^@/, '');
      return rows.filter((r) => (!onlyStill() || state.seg !== 'lost' || r.stillFollowing) && (!q || r.u.includes(q)));
    }

    function emptyMessage(res) {
      if (state.q) return ['🔎', 'Aucun compte ne correspond à cette recherche.'];
      if (state.seg === 'lost') return ['🥰', onlyStill() ? 'Aucun départ parmi les comptes que tu suis.' : 'Aucun départ sur cette période. Ils t’aiment.'];
      if (state.seg === 'gained') return ['🦗', 'Aucun nouvel abonné sur cette période.'];
      if (!res.hasFollowing) return ['🤷', 'Cet export ne contient pas la liste des comptes que tu suis.'];
      if (res.noBackExcluded.length || res.noBackGhosts) return ['😌', 'Personne d’autre à surveiller : le reste est dans tes exclus ou tes fantômes.'];
      return ['🏆', 'Tout le monde te suit en retour. Respect.'];
    }

    function renderList() {
      const { res } = state.result;
      const nx = res.noBackExcluded.length;
      const ng = res.ghostRows.length;

      $('only-following-wrap').hidden = state.seg !== 'lost' || !res.hasFollowing;
      $('noback-views').hidden = state.seg !== 'noBack' || !(nx || ng);
      $('n-excluded').textContent = F.num(nx);
      $('n-ghosts').textContent = F.num(ng);
      for (const c of document.querySelectorAll('[data-nbv]')) {
        c.setAttribute('aria-pressed', String(c.dataset.nbv === state.noBackView));
        c.hidden = (c.dataset.nbv === 'excluded' && !nx) || (c.dataset.nbv === 'ghosts' && !ng);
      }
      $('seg-help').innerHTML = HELP[listKey()];

      const rows = currentRows();
      const list = $('list');
      list.textContent = '';
      list.append(...rows.map(rowEl));

      const empty = $('list-empty');
      let emoji = null;
      let msg = '';
      if (!rows.length) [emoji, msg] = emptyMessage(res);
      else if (state.seg === 'lost' && !res.hasFollowing) msg = 'L\'export de fin ne contient pas following.json : impossible de savoir lesquels tu suis encore.';
      empty.textContent = msg;
      if (emoji) empty.dataset.emoji = emoji; else delete empty.dataset.emoji;
      empty.hidden = !msg;
      $('export-csv').hidden = rows.length === 0;
    }

    /** Badges et précisions sous le pseudo. */
    function rowDetails(r, view, done) {
      const parts = [];
      const badge = (cls, text) => parts.push(el('span', { class: 'badge' + (cls ? ' ' + cls : ''), text }));
      const since = F.sinceLabel(r.since);
      if (view === 'ghosts') {
        badge('ghost', 'Fantôme');
        if (state.ghosts[r.u]) parts.push(el('span', { text: `rangé le ${F.dateLabel(state.ghosts[r.u], true)}` }));
      } else if (state.seg === 'lost') {
        if (r.stillFollowing) badge('', 'Tu le suis encore');
        if (since) parts.push(el('span', { text: `abonné depuis ${since}` }));
      } else if (state.seg === 'gained') {
        if (r.followBack) badge('soft', 'Tu le suis');
        if (r.since) parts.push(el('span', { text: `le ${F.dateLabel(r.since * 1000)}` }));
      } else {
        if (view === 'excluded') badge('excl', 'Exclu');
        if (done) badge('soft', 'Traité');
        if (since) parts.push(el('span', { text: `suivi depuis ${since}` }));
      }
      return parts;
    }

    function rowEl(r) {
      const view = state.seg === 'noBack' ? state.noBackView : 'list';
      const actions = actionsFor(state.seg, view);
      const done = actions.includes('done') && !!state.done[r.u];
      const hot = state.seg === 'lost' && r.stillFollowing;
      const url = profileUrl(r.u);

      const buttons = actions.map((name) => {
        const a = ACTIONS[name];
        const on = !!state[a.key][r.u];
        return el('button', {
          type: 'button', class: 'icon-btn', 'data-action': name, 'data-u': r.u,
          'aria-pressed': String(on), 'aria-label': a.label(r.u, on), title: a.title(on), html: ICONS[a.icon],
        });
      });

      return el('li', {
        class: 'row' + (hot ? ' is-hot' : '') + (done ? ' is-done' : '') + (buttons.length >= 3 ? ' is-stacked' : ''),
      }, [
        el('span', { class: 'avatar av-' + F.avatarTone(r.u), 'aria-hidden': 'true', text: r.u.replace(/[^a-z0-9]/g, '').charAt(0) || '@' }),
        el('div', { class: 'who' }, [
          el('a', { class: 'handle', href: url, target: '_blank', rel: 'noopener noreferrer', text: '@' + r.u }),
          el('span', { class: 'sub' }, rowDetails(r, view, done)),
        ]),
        el('div', { class: 'row-actions' }, [
          el('a', { class: 'open', href: url, target: '_blank', rel: 'noopener noreferrer', text: 'Ouvrir' }),
          ...buttons,
        ]),
      ]);
    }

    /** Bascule un compte dans la liste d'une action, enregistre, puis réaffiche. */
    function toggle(name, u) {
      const a = ACTIONS[name];
      const list = state[a.key];
      const on = !list[u];
      if (on) list[u] = Date.now(); else delete list[u];
      if (a.toast) toast(a.toast(u, on));
      ctx.saveSettings();
      applyLists();
    }

    /* ---------- Export CSV ---------- */

    async function exportCsv() {
      if (!state.result) return;
      const key = listKey();
      const status = (r) => {
        let s = {
          lost: r.stillFollowing ? 'parti, tu le suis encore' : 'parti',
          gained: r.followBack ? 'arrivé, tu le suis' : 'arrivé',
          noBack: 'ne te suit pas',
          excluded: 'ne te suit pas (exclu, normal)',
          ghosts: 'fantôme (compte introuvable)',
        }[key];
        if (key === 'noBack' && state.done[r.u]) s += ' (traité)';
        return s;
      };
      const rows = [['compte', 'lien', 'statut', 'depuis']].concat(currentRows().map((r) => [
        r.u, `https://www.instagram.com/${r.u}/`, status(r), r.since ? F.isoDay(r.since * 1000) : '',
      ]));
      const { older, newer, single } = state.result;
      const dates = single ? F.isoDay(newer.takenAt) : `${F.isoDay(older.takenAt)}_${F.isoDay(newer.takenAt)}`;
      const r = await Files.saveFile(`tas-cru-${CSV_NAMES[key]}-${dates}.csv`, Files.csv(rows), 'text/csv');
      ctx.reportSave(r, 'Liste exportée.');
    }

    /* ---------- Événements ---------- */

    function changeRange(update) {
      update();
      renderPeriod();
      compute();
    }

    function bind() {
      $('sel-from').addEventListener('change', (e) => changeRange(() => { state.from = e.target.value; state.preset = null; state.rangeExact = true; }));
      $('sel-to').addEventListener('change', (e) => changeRange(() => { state.to = e.target.value; state.preset = null; state.rangeExact = true; }));
      $('presets').addEventListener('click', (e) => {
        const c = e.target.closest('[data-preset]');
        if (c) changeRange(() => ctx.applyPreset(c.dataset.preset));
      });

      $('segments').addEventListener('click', (e) => {
        const s = e.target.closest('.seg');
        if (!s || s.disabled) return;
        state.seg = s.dataset.seg;
        renderSegments();
        applyLists();
      });
      $('search').addEventListener('input', (e) => { state.q = e.target.value; if (state.result) renderList(); });
      $('only-following').addEventListener('change', (e) => { state.onlyFollowing = e.target.checked; if (state.result) applyLists(); });
      $('noback-views').addEventListener('click', (e) => {
        const c = e.target.closest('[data-nbv]');
        if (!c || !state.result) return;
        state.noBackView = c.dataset.nbv;
        renderList();
      });
      $('list').addEventListener('click', (e) => {
        const b = e.target.closest('[data-action]');
        if (b) toggle(b.dataset.action, b.dataset.u);
      });
      $('export-csv').addEventListener('click', exportCsv);
    }

    /** Affiche l'onglet (période puis calcul). */
    function render() {
      renderPeriod();
      compute();
    }

    return { render, bind };
  }

  root.DesabosAudit = { create };
})(window);
