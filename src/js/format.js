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

  /*
   * Date affichée d'un export : son moment réel de création (heure du ZIP, dans le fuseau de
   * l'appareil) quand il est connu, sinon le jour de l'export (takenAt). Ainsi un export créé à
   * 00:07 en France est bien « du 22 oct. », même si Instagram, en Californie, l'a daté du 21.
   */
  const moment = (m) => P.stampToInstant(m.stamp) || m.takenAt;

  const MINUTE = 60000;
  const HOUR = 60 * MINUTE;
  const DAY = 24 * HOUR;
  // en deçà, l'écart entre deux exports s'affiche avec les heures plutôt qu'en jours
  const NEAR = 2 * DAY;
  const near = (older, newer) => !!(older.stamp && newer.stamp) && Math.abs(moment(newer) - moment(older)) < NEAR;

  /** Nombre de jours calendaires entre deux moments (fuseau de l'appareil). */
  const dayGap = (a, b) => Math.round(Math.abs(msFromIso(isoDay(b)) - msFromIso(isoDay(a))) / DAY);

  /** « Entre le … et le … » pour deux instantanés, avec les heures quand ils sont rapprochés. */
  function periodText(older, newer, now = Date.now()) {
    const a = moment(older);
    const b = moment(newer);
    if (near(older, newer)) return `Entre le ${dateLabel(a, false, now)} à ${time(a)} et le ${dateLabel(b, true, now)} à ${time(b)}`;
    if (isoDay(a) === isoDay(b)) return `Entre deux exports du ${dateLabel(b, true, now)}`;
    return `Entre le ${dateLabel(a, false, now)} et le ${dateLabel(b, true, now)}`;
  }

  /** Durée comparée : « 34 jours », « le même jour », ou « 1 h 12 min » pour deux exports rapprochés. */
  function gapText(older, newer) {
    if (near(older, newer)) {
      const mins = Math.round(Math.abs(moment(newer) - moment(older)) / MINUTE);
      const h = Math.floor(mins / 60);
      const m = mins % 60;
      if (!h) return count(m, 'minute', 'minutes');
      return m ? `${h} h ${String(m).padStart(2, '0')} min` : count(h, 'heure', 'heures');
    }
    const days = dayGap(moment(older), moment(newer));
    return days ? count(days, 'jour', 'jours') : 'le même jour';
  }

  /**
   * Libellé d'un export dans les menus : « 21 oct. 2026 ». Plusieurs exports le même jour sont
   * départagés par leur heure (« · 23:47 ») si elle est connue, sinon numérotés « · n°1, n°2… ».
   */
  function snapLabel(m, metas, long) {
    const day = isoDay(moment(m));
    const sameDay = metas.filter((x) => isoDay(moment(x)) === day);
    const label = long ? longDate(moment(m)) : fmtDay.format(new Date(moment(m)));
    if (sameDay.length < 2) return label;
    return m.stamp ? `${label} · ${time(moment(m))}` : `${label} · n°${sameDay.indexOf(m) + 1}`;
  }

  /**
   * Date et heure d'un export pour « Mes exports » : { date, time }.
   * time = « · 23:47 » (heure de création dans le fuseau de l'appareil), ou null si elle est inconnue.
   */
  function snapDateTime(m, metas) {
    if (!m.stamp) return { date: snapLabel(m, metas, true), time: null };
    return { date: longDate(moment(m)), time: `· ${time(moment(m))}` };
  }

  /** Jour (AAAA-MM-JJ) à proposer pour un export qu'on importe : celui de sa création réelle si connue. */
  const importDay = (parsed) => (parsed.stamp ? isoDay(P.stampToInstant(parsed.stamp)) : parsed.date || isoDay(Date.now()));

  /** Teinte d'avatar stable pour un même pseudo : 1 à 6 (voir --av1…--av6). */
  function avatarTone(u) {
    let h = 0;
    for (let i = 0; i < u.length; i++) h = (h * 31 + u.charCodeAt(i)) >>> 0;
    return (h % 6) + 1;
  }

  root.DesabosFormat = {
    num, plural, count, isoDay, msFromIso, dateLabel, longDate, time, sinceLabel,
    moment, periodText, gapText, snapLabel, snapDateTime, importDay, avatarTone,
  };
})(typeof window !== 'undefined' ? window : globalThis);
