/*
 * Mise en forme pour l'affichage (français) : nombres, dates, périodes, libellés d'exports.
 * Fonctions pures, sans DOM : testées dans tests/test.mjs.
 */
(function (root) {
  'use strict';

  const P = root.DesabosParser;

  const nf = new Intl.NumberFormat('fr-FR');
  const fmtDay = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
  const fmtDayNoYear = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' });
  const fmtLongDay = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  const fmtMonth = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' });
  const fmtTime = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' });

  const num = (n) => nf.format(n);
  const plural = (n, one, many) => (n === 1 ? one : many);
  /** « 3 départs », « 1 départ » */
  const count = (n, one, many) => `${num(n)} ${plural(n, one, many)}`;

  /** Jour local au format AAAA-MM-JJ. */
  function isoDay(ms) {
    const d = new Date(ms);
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }

  /** AAAA-MM-JJ → midi local de ce jour (ms), pour éviter les décalages de fuseau. */
  function msFromIso(iso) {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d, 12, 0, 0, 0).getTime();
  }

  /** « 21 oct. » ; l'année est ajoutée si demandée ou si ce n'est pas l'année en cours. */
  function dateLabel(ms, withYear, now = Date.now()) {
    const d = new Date(ms);
    const sameYear = d.getFullYear() === new Date(now).getFullYear();
    return (withYear || !sameYear ? fmtDay : fmtDayNoYear).format(d);
  }

  const longDate = (ms) => fmtLongDay.format(new Date(ms));
  const time = (ms) => fmtTime.format(new Date(ms));

  /** Horodatage Instagram (secondes) → « octobre 2025 », ou '' s'il est absent. */
  const sinceLabel = (ts) => (ts ? fmtMonth.format(new Date(ts * 1000)) : '');

  /**
   * « Entre le … et le … » pour deux instantanés. Le même jour, avec l'heure de création
   * lue dans les ZIP (convertie dans le fuseau de l'appareil) quand elle est connue.
   */
  function periodText(older, newer, now = Date.now()) {
    if (isoDay(older.takenAt) !== isoDay(newer.takenAt)) {
      return `Entre le ${dateLabel(older.takenAt, false, now)} et le ${dateLabel(newer.takenAt, true, now)}`;
    }
    const a = P.stampToInstant(older.stamp);
    const b = P.stampToInstant(newer.stamp);
    if (!a || !b) return `Entre deux exports du ${dateLabel(newer.takenAt, true, now)}`;
    return `Entre le ${dateLabel(a, false, now)} à ${time(a)} et le ${dateLabel(b, true, now)} à ${time(b)}`;
  }

  /**
   * Libellé d'un export dans les menus : « 21 oct. 2026 ». Plusieurs exports le même jour
   * sont numérotés « · n°1, n°2… » dans l'ordre de metas (chronologique).
   */
  function snapLabel(m, metas, long) {
    const day = isoDay(m.takenAt);
    const sameDay = metas.filter((x) => isoDay(x.takenAt) === day);
    const label = long ? longDate(m.takenAt) : fmtDay.format(new Date(m.takenAt));
    return sameDay.length > 1 ? `${label} · n°${sameDay.indexOf(m) + 1}` : label;
  }

  /**
   * Date et heure d'un export pour « Mes exports » : { date, time }.
   * time = « · 23:47 », ou « · 00:07 le 22 oct. » si l'export a été créé un autre jour
   * (heure locale) que celui donné par Instagram ; null si l'heure est inconnue.
   */
  function snapDateTime(m, metas, now = Date.now()) {
    const at = P.stampToInstant(m.stamp);
    if (!at) return { date: snapLabel(m, metas, true), time: null };
    let t = `· ${time(at)}`;
    if (isoDay(at) !== isoDay(m.takenAt)) t += ` le ${dateLabel(at, false, now)}`;
    return { date: longDate(m.takenAt), time: t };
  }

  /** Teinte d'avatar stable pour un même pseudo : 1 à 6 (voir --av1…--av6). */
  function avatarTone(u) {
    let h = 0;
    for (let i = 0; i < u.length; i++) h = (h * 31 + u.charCodeAt(i)) >>> 0;
    return (h % 6) + 1;
  }

  root.DesabosFormat = {
    num, plural, count, isoDay, msFromIso, dateLabel, longDate, time, sinceLabel,
    periodText, snapLabel, snapDateTime, avatarTone,
  };
})(typeof window !== 'undefined' ? window : globalThis);
