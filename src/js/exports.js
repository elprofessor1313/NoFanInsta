/*
 * Onglet « Exports » : liste des exports enregistrés, import d'un export Instagram (avec vérification
 * avant enregistrement), sauvegarde et restauration.
 */
(function (root) {
  'use strict';

  const P = root.DesabosParser;
  const F = root.DesabosFormat;
  const Files = root.DesabosFiles;
  const Storage = root.DesabosStorage;
  const { $, el, toast } = root.DesabosDom;

  // Erreurs de lecture (préfixe du message d'erreur du parser) → message pour l'utilisateur
  const READ_ERRORS = [
    ['zip_unsupported', 'Ce navigateur ne sait pas ouvrir les .zip. Décompresse-le et choisis les fichiers .json.'],
    ['zip', 'Ce .zip est illisible. Télécharge à nouveau l\'export depuis Instagram.'],
    ['json_invalid', 'Un des fichiers .json est abîmé. Télécharge à nouveau l\'export.'],
  ];

  const STORE_TEXTS = {
    cloud: ['Compte Claude', 'Tes exports sont enregistrés de façon privée dans ton compte Claude : tu les retrouves sur tous tes appareils. Une sauvegarde reste utile pour les garder ailleurs.'],
    local: ['Cet appareil', 'Tes exports sont enregistrés dans ce navigateur, sur cet appareil uniquement. Fais une sauvegarde de temps en temps : si les données du site sont effacées, elle permet de tout restaurer.'],
    memory: ['Non conservé', 'Ce navigateur ne permet pas d\'enregistrer les exports (navigation privée ?). Ils seront perdus à la fermeture : exporte une sauvegarde avant de partir.'],
  };

  /**
   * ctx : { state, getSnap, refresh, applyPreset, render, setView, saveSettings, loadSettings, settings, reportSave }.
   */
  function create(ctx) {
    const { state } = ctx;

    /* ---------- Liste des exports ---------- */

    function snapItem(m) {
      const { date, time } = F.snapDateTime(m, state.metas);
      const meta = `${F.num(m.nFollowers)} abonnés · ${F.num(m.nFollowing)} abonnements` + (m.account ? ` · @${m.account}` : '');
      const actions = state.pendingDelete === m.id
        ? [
          el('span', { class: 'snap-confirm', text: 'Supprimer ?' }),
          el('button', { type: 'button', class: 'btn btn-small', 'data-cancel': m.id, text: 'Non' }),
          el('button', { type: 'button', class: 'btn btn-small btn-danger', 'data-confirm': m.id, text: 'Oui' }),
        ]
        : [el('button', { type: 'button', class: 'btn btn-small', 'data-delete': m.id, 'aria-label': `Supprimer l'export du ${F.dateLabel(m.takenAt, true)}`, text: 'Supprimer' })];
      return el('li', { class: 'snap' }, [
        el('div', {}, [
          el('div', { class: 'snap-date' }, time ? [date + ' ', el('span', { class: 'snap-time', text: time })] : date),
          el('div', { class: 'snap-meta', text: meta }),
        ]),
        el('div', { class: 'snap-actions' }, actions),
      ]);
    }

    function render() {
      const real = state.demo ? [] : state.metas.slice().reverse(); // le plus récent en haut
      const list = $('snap-list');
      list.textContent = '';
      list.append(...real.map(snapItem));
      $('snaps-empty').hidden = real.length > 0;

      const [pill, note] = STORE_TEXTS[state.store ? state.store.mode() : 'local'];
      $('store-pill').textContent = pill;
      $('store-note').textContent = note;
      $('backup-export').disabled = state.demo;
      $('install-hint').hidden = !canSuggestInstall();
    }

    /** Proposer l'installation : Safari sur iPhone, hors app installée et hors page intégrée. */
    function canSuggestInstall() {
      let standalone = false;
      try { standalone = navigator.standalone === true || matchMedia('(display-mode: standalone)').matches; } catch (e) { /* ancien navigateur */ }
      let framed = false;
      try { framed = root.self !== root.top; } catch (e) { framed = true; }
      return Files.isIOS() && !standalone && !framed;
    }

    /* ---------- Import ---------- */

    async function handleFiles(fileList) {
      const files = [...fileList];
      if (!files.length) return;
      ctx.setView('exports');
      toast('Lecture du fichier…');
      let parsed;
      try {
        const items = await Promise.all(files.map(async (f) => ({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) })));
        parsed = await P.parseInputs(items);
      } catch (e) {
        const msg = String((e && e.message) || e);
        const known = READ_ERRORS.find(([prefix]) => msg.startsWith(prefix));
        toast(known ? known[1] : 'Fichier illisible : ' + msg);
        return;
      }

      if (parsed.backup) { await restoreBackup(parsed.backup); return; }
      if (!parsed.hasFollowers) {
        toast('Aucune liste d\'abonnés trouvée. Il faut le fichier followers_1.json (ou le .zip complet).');
        return;
      }
      showDraft(parsed);
    }

    /** Affiche l'export lu pour vérification, avec ses avertissements. */
    function showDraft(parsed) {
      const date = parsed.date || F.isoDay(Date.now());
      const warnings = [];
      if (!parsed.hasFollowing) warnings.push('following.json est absent : tu verras les départs, mais pas lesquels tu suis encore.');
      if (parsed.followers.size === 0) warnings.push('La liste d\'abonnés est vide. Vérifie que l\'export couvre la période « Depuis le début ».');
      const sameDay = state.demo ? null : state.metas.find((m) => F.isoDay(m.takenAt) === date);
      if (sameDay) {
        const day = F.dateLabel(sameDay.takenAt, true);
        warnings.push(parsed.stamp
          ? `Tu as déjà un export daté du ${day} : pas de souci, ils seront comparés dans l'ordre où Instagram les a créés.`
          : `Tu as déjà un export daté du ${day}. Vérifie la date : deux exports du même jour sont rangés dans l'ordre où tu les ajoutes.`);
      }

      state.draft = { followers: [...parsed.followers], following: [...parsed.following], account: parsed.account, stamp: parsed.stamp };
      $('draft-followers').textContent = F.num(parsed.followers.size);
      $('draft-following').textContent = parsed.hasFollowing ? F.num(parsed.following.size) : '–';
      $('draft-date').value = date;
      $('draft-date').max = F.isoDay(Date.now());
      $('draft-warnings').replaceChildren(...warnings.map((w) => el('li', { text: w })));
      $('draft').hidden = false;
      $('toast').hidden = true;
      $('draft').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function closeDraft() {
      state.draft = null;
      $('draft').hidden = true;
      $('file-input').value = '';
    }

    async function saveDraft() {
      const d = state.draft;
      if (!d) return;
      const iso = $('draft-date').value;
      if (!iso) { toast('Indique la date de l\'export.'); return; }
      const takenAt = F.msFromIso(iso);
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
        toast('Enregistrement impossible : ' + ((e && e.message) || e));
        return;
      } finally {
        $('draft-save').disabled = false;
      }
      state.cache.set(snap.id, snap);
      closeDraft();
      await ctx.refresh();
      // toujours le dernier écart : un export ajouté après coup peut être plus ancien que les autres
      ctx.applyPreset('last');
      state.seg = state.metas.length >= 2 ? 'lost' : 'noBack';
      ctx.render();
      toast(`Export du ${F.dateLabel(takenAt, true)} enregistré.`);
      if (state.metas.length >= 2) ctx.setView('audit');
    }

    /* ---------- Sauvegarde ---------- */

    async function restoreBackup(data) {
      const known = new Set(state.demo ? [] : state.metas.map((m) => m.id));
      const clean = (list) => (list || []).filter((x) => Array.isArray(x) && P.normUser(x[0]));
      let n = 0;
      for (const s of data.snapshots) {
        if (!s || !s.id || !Array.isArray(s.followers) || known.has(s.id)) continue;
        const snap = {
          id: String(s.id), takenAt: Number(s.takenAt), stamp: Number(s.stamp) || null,
          account: s.account || null, createdAt: s.createdAt || Date.now(),
          followers: clean(s.followers), following: clean(s.following),
        };
        await state.store.save(snap);
        state.cache.set(snap.id, snap);
        n++;
      }
      if (data.settings) {
        // les réglages actuels l'emportent sur ceux de la sauvegarde
        ctx.loadSettings(Storage.mergeSettings(data.settings, ctx.settings()));
        await ctx.saveSettings();
      }
      $('file-input').value = '';
      state.from = state.to = null;
      await ctx.refresh();
      toast(n ? `${F.count(n, 'export restauré', 'exports restaurés')}.` : 'Tous les exports de cette sauvegarde sont déjà présents.');
    }

    async function exportBackup() {
      if (state.demo) return;
      const snapshots = [];
      for (const m of state.metas) {
        const s = await ctx.getSnap(m.id);
        if (s) snapshots.push({ id: s.id, takenAt: s.takenAt, stamp: s.stamp || null, account: s.account, createdAt: s.createdAt, followers: s.followers, following: s.following });
      }
      // « desabos » : identifiant du format de sauvegarde (ancien nom de l'app), à garder pour relire les anciennes sauvegardes
      const body = JSON.stringify({ app: 'desabos', version: 1, exportedAt: Date.now(), settings: ctx.settings(), snapshots });
      const r = await Files.saveFile(`tas-cru-sauvegarde-${F.isoDay(Date.now())}.json`, body, 'application/json');
      ctx.reportSave(r, 'Sauvegarde exportée.');
    }

    /* ---------- Suppression ---------- */

    async function onSnapClick(e) {
      const t = e.target.closest('button');
      if (!t) return;
      if (t.dataset.delete || t.dataset.cancel) {
        state.pendingDelete = t.dataset.delete || null;
        render();
        return;
      }
      if (t.dataset.confirm) {
        const id = t.dataset.confirm;
        state.pendingDelete = null;
        try { await state.store.remove(id); } catch (err) { toast('Suppression impossible.'); }
        state.cache.delete(id);
        await ctx.refresh();
        toast('Export supprimé.');
      }
    }

    /* ---------- Événements ---------- */

    function bind() {
      $('file-input').addEventListener('change', (e) => handleFiles(e.target.files));
      $('draft-cancel').addEventListener('click', closeDraft);
      $('draft-save').addEventListener('click', saveDraft);
      $('backup-export').addEventListener('click', exportBackup);
      $('snap-list').addEventListener('click', onSnapClick);

      const dz = $('dropzone');
      const over = (on) => (e) => { e.preventDefault(); dz.classList.toggle('is-over', on); };
      dz.addEventListener('dragenter', over(true));
      dz.addEventListener('dragover', over(true));
      dz.addEventListener('dragleave', over(false));
      dz.addEventListener('drop', (e) => {
        over(false)(e);
        if (e.dataTransfer && e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
      });
      // éviter que le navigateur ouvre un fichier lâché à côté de la zone
      root.addEventListener('dragover', (e) => e.preventDefault());
      root.addEventListener('drop', (e) => e.preventDefault());
    }

    return { render, bind };
  }

  root.DesabosExports = { create };
})(window);
