/*
 * Comparaison de deux instantanés.
 * Un instantané = { id, takenAt (ms, jour de l'export), stamp (heure de création lue dans le ZIP, ou null), account, followers: [[pseudo, ts]], following: [[pseudo, ts]] }
 */
(function (root) {
  'use strict';

  const DAY = 86400000;
  const byUser = (a, b) => (a.u < b.u ? -1 : a.u > b.u ? 1 : 0);

  /**
   * a = instantané de début, b = instantané de fin.
   *  lost     : abonnés dans a, absents de b (les départs)
   *             stillFollowing = tu suis encore ce compte dans b
   *  gained   : abonnés dans b, absents de a
   *  noBack   : comptes que tu suis dans b et qui ne te suivent pas dans b
   */
  function diff(a, b) {
    const fa = new Map(a.followers);
    const fb = new Map(b.followers);
    const gb = new Map(b.following);

    const lost = [];
    for (const [u, t] of fa) {
      if (!fb.has(u)) lost.push({ u, since: t, stillFollowing: gb.has(u) });
    }
    lost.sort((x, y) => (y.stillFollowing - x.stillFollowing) || byUser(x, y));

    const gained = [];
    for (const [u, t] of fb) {
      if (!fa.has(u)) gained.push({ u, since: t, followBack: gb.has(u) });
    }
    gained.sort((x, y) => (y.since - x.since) || byUser(x, y));

    return {
      lost,
      gained,
      noBack: notFollowingBack(b),
      stillCount: lost.filter((x) => x.stillFollowing).length,
      hasFollowing: b.following.length > 0,
    };
  }

  function notFollowingBack(s) {
    const f = new Map(s.followers);
    const out = [];
    for (const [u, t] of s.following) if (!f.has(u)) out.push({ u, since: t });
    out.sort((x, y) => (x.since - y.since) || byUser(x, y));
    return out;
  }

  /**
   * Sépare une liste en comptes gardés et comptes exclus.
   * excluded : { pseudo: date d'exclusion (ms) }, liste tenue par l'utilisateur
   * (célébrités, marques… dont l'absence de retour est normale).
   */
  function splitExcluded(rows, excluded) {
    const kept = [];
    const hidden = [];
    for (const r of rows) (excluded && excluded[r.u] ? hidden : kept).push(r);
    return { kept, hidden };
  }

  /**
   * Ordre chronologique des instantanés : jour de l'export, puis heure de création
   * lue dans le ZIP (plusieurs exports le même jour), puis ordre d'import.
   */
  function snapOrder(a, b) {
    return (a.takenAt - b.takenAt) || ((a.stamp || 0) - (b.stamp || 0)) || ((a.createdAt || 0) - (b.createdAt || 0));
  }

  /**
   * Choisit la paire d'instantanés pour une période.
   * metas : triés du plus ancien au plus récent (snapOrder).
   * preset : "last" | "all" | nombre de jours.
   * Renvoie { from, to, exact } (ids) ; exact = false si aucun export n'est assez ancien.
   */
  function pickRange(metas, preset) {
    const n = metas.length;
    if (n === 0) return null;
    if (n === 1) return { from: metas[0].id, to: metas[0].id, exact: true };
    const last = metas[n - 1];
    if (preset === 'last') return { from: metas[n - 2].id, to: last.id, exact: true };
    if (preset === 'all') return { from: metas[0].id, to: last.id, exact: true };
    const days = Number(preset);
    const target = last.takenAt - days * DAY + DAY / 2; // demi-journée de tolérance
    let from = null;
    for (let i = n - 2; i >= 0; i--) {
      if (metas[i].takenAt <= target) { from = metas[i]; break; }
    }
    if (!from) return { from: metas[0].id, to: last.id, exact: false };
    return { from: from.id, to: last.id, exact: true };
  }

  function daysBetween(a, b) {
    return Math.round(Math.abs(b - a) / DAY);
  }

  root.DesabosCompare = { diff, notFollowingBack, splitExcluded, snapOrder, pickRange, daysBetween, DAY };
})(typeof window !== 'undefined' ? window : globalThis);
