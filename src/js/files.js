/*
 * Fichiers produits par l'app : mise en forme CSV, et enregistrement sur l'appareil (CSV, sauvegarde).
 *  - page Claude : capacité "downloads" (le visiteur confirme)
 *  - app installée / navigateur : partage iOS ou téléchargement classique
 */
(function (root) {
  'use strict';

  let downloadsPromise = null;
  function downloads() {
    if (!downloadsPromise) {
      const c = root.claude;
      downloadsPromise = c && typeof c.use === 'function'
        ? c.use('downloads').catch(() => null)
        : Promise.resolve(null);
    }
    return downloadsPromise;
  }
  // préchargé au démarrage pour rester dans le geste de l'utilisateur au moment du clic
  downloads();

  const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  /**
   * Texte CSV (séparateur virgule, BOM pour qu'Excel lise les accents).
   * rows : tableaux de valeurs ; la première ligne sert d'en-tête.
   */
  function csv(rows) {
    const cell = (v) => {
      const s = String(v === null || v === undefined ? '' : v);
      return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    return '﻿' + rows.map((r) => r.map(cell).join(',')).join('\n');
  }

  /** Renvoie "saved", "cancelled", "busy" (un enregistrement est déjà en cours) ou "failed". */
  async function saveFile(filename, text, mime) {
    const blob = new Blob([text], { type: mime });
    const d = await downloads();
    if (d) {
      try { await d.save({ filename, data: blob }); return 'saved'; }
      catch (e) {
        const code = e && e.code;
        if (code === 'declined') return 'cancelled';
        if (code === 'rate_limited') return 'busy';
        return 'failed';
      }
    }
    // Dans une page intégrée sans la capacité, les téléchargements sont bloqués.
    let framed = false;
    try { framed = root.self !== root.top; } catch (e) { framed = true; }
    if (framed) return 'failed';
    try {
      const file = new File([blob], filename, { type: mime });
      if (isIOS() && navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file] });
        return 'saved';
      }
    } catch (e) {
      if (e && e.name === 'AbortError') return 'cancelled';
    }
    try {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
      return 'saved';
    } catch (e) {
      return 'failed';
    }
  }

  root.DesabosFiles = { csv, saveFile, isIOS };
})(typeof window !== 'undefined' ? window : globalThis);
