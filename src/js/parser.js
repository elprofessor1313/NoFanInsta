/*
 * Lecture des exports Instagram ("Exporter vos informations").
 *
 * Formats pris en charge :
 *  - ZIP complet ou partiel de l'export (format JSON ou HTML)
 *  - followers_1.json, followers_2.json… et following.json sélectionnés directement
 *  - les mêmes fichiers au format HTML (anciens exports)
 *  - une sauvegarde de l'app (tas-cru-sauvegarde-*.json ; desabos-sauvegarde-*.json sous l'ancien nom)
 *
 * Aucune dépendance : le ZIP est lu à la main et décompressé avec
 * DecompressionStream("deflate-raw"), natif dans Safari (iOS 16.4+) et Chrome.
 */
(function (root) {
  'use strict';

  // Un nom d'utilisateur Instagram : lettres, chiffres, points, tirets bas, 30 caractères max.
  const USERNAME_RE = /^[a-z0-9._]{1,30}$/;

  function normUser(value) {
    if (value === undefined || value === null) return '';
    const u = String(value).trim().replace(/^@/, '').toLowerCase();
    return USERNAME_RE.test(u) ? u : '';
  }

  function userFromHref(href) {
    if (!href) return '';
    const m = String(href).match(/instagram\.com\/(?:_u\/)?([^/?#"]+)/i);
    if (!m) return '';
    try { return normUser(decodeURIComponent(m[1])); } catch (e) { return normUser(m[1]); }
  }

  /** Quel type de liste contient ce fichier ? "followers", "following" ou null. */
  function kindOf(path) {
    const base = String(path).split(/[\\/]/).pop().toLowerCase();
    if (/^followers(_\d+)?\.(json|html)$/.test(base)) return 'followers';
    if (/^following(_\d+)?\.(json|html)$/.test(base)) return 'following';
    return null;
  }

  function entriesArray(data, key) {
    if (Array.isArray(data)) return data;
    if (data && typeof data === 'object') {
      if (Array.isArray(data[key])) return data[key];
      for (const k of Object.keys(data)) {
        if (Array.isArray(data[k])) return data[k];
      }
    }
    return [];
  }

  /**
   * Une entrée ressemble à :
   *   { title: "", string_list_data: [{ href, value: "pseudo", timestamp }] }   (ancien)
   *   { title: "pseudo", string_list_data: [{ href, timestamp }] }              (récent)
   */
  function parseJsonEntries(list) {
    const out = new Map();
    for (const e of list) {
      if (!e || typeof e !== 'object') continue;
      const s = (Array.isArray(e.string_list_data) && e.string_list_data[0]) || {};
      const u = normUser(s.value) || normUser(e.title) || userFromHref(s.href) || normUser(e.value);
      if (!u || out.has(u)) continue;
      const t = Number(s.timestamp) || Number(e.timestamp) || 0;
      out.set(u, t);
    }
    return out;
  }

  function parseHtml(text) {
    const out = new Map();
    const re = /href\s*=\s*["']https?:\/\/(?:www\.)?instagram\.com\/(?:_u\/)?([^"'/?#]+)/gi;
    let m;
    while ((m = re.exec(text))) {
      const u = normUser(m[1]);
      if (u && !out.has(u)) out.set(u, 0);
    }
    return out;
  }

  function parseListFile(name, text) {
    const kind = kindOf(name);
    if (!kind) return null;
    if (/\.html$/i.test(name)) return { kind, map: parseHtml(text) };
    let data;
    try { data = JSON.parse(text); } catch (e) { throw new Error('json_invalid:' + name); }
    const key = kind === 'followers' ? 'relationships_followers' : 'relationships_following';
    return { kind, map: parseJsonEntries(entriesArray(data, key)) };
  }

  /* ---------------- ZIP ---------------- */

  async function inflateRaw(u8) {
    if (typeof DecompressionStream === 'undefined') throw new Error('zip_unsupported');
    const stream = new Blob([u8]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  /** Date et heure DOS d'une entrée ZIP → ms (heure « naïve », sans fuseau), ou null. */
  function dosTime(date, time) {
    if (!date) return null;
    return Date.UTC((date >> 9) + 1980, ((date >> 5) & 15) - 1, date & 31, time >> 11, (time >> 5) & 63, (time & 31) * 2);
  }

  /*
   * Les heures du ZIP sont celles des serveurs d'Instagram, en Californie (fuseau du Pacifique),
   * sans indication de fuseau. Vérifié sur de vrais exports : leurs données contiennent des
   * abonnements postérieurs à l'heure du ZIP lue en UTC, mais antérieurs à cette heure lue
   * en heure du Pacifique.
   */
  const IG_TZ = 'America/Los_Angeles';
  let igClock = null;

  /** Heure affichée à cet instant en Californie, sous forme d'heure « naïve » (ms). */
  function igWallTime(ms) {
    igClock = igClock || new Intl.DateTimeFormat('en-US', {
      timeZone: IG_TZ, hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
    const p = {};
    for (const x of igClock.formatToParts(new Date(ms))) p[x.type] = x.value;
    return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
  }

  /** stamp (heure naïve des serveurs d'Instagram) → instant réel (ms UTC), ou null. */
  function stampToInstant(stamp) {
    if (!stamp) return null;
    let t = stamp;
    for (let i = 0; i < 2; i++) t += stamp - igWallTime(t);
    return t;
  }

  /** Extrait du ZIP les fichiers dont le nom satisfait `wanted` : [{ name, data, time }]. */
  async function unzip(bytes, wanted) {
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const len = bytes.length;
    let eocd = -1;
    for (let i = len - 22; i >= Math.max(0, len - 65557); i--) {
      if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('zip_invalid');

    let count = dv.getUint16(eocd + 10, true);
    let cdOffset = dv.getUint32(eocd + 16, true);
    if (cdOffset === 0xffffffff || count === 0xffff) {
      const loc = eocd - 20;
      if (loc >= 0 && dv.getUint32(loc, true) === 0x07064b50) {
        const z64 = Number(dv.getBigUint64(loc + 8, true));
        if (dv.getUint32(z64, true) === 0x06064b50) {
          count = Number(dv.getBigUint64(z64 + 32, true));
          cdOffset = Number(dv.getBigUint64(z64 + 48, true));
        }
      }
    }

    const dec = new TextDecoder();
    const out = [];
    let p = cdOffset;
    for (let n = 0; n < count; n++) {
      if (p + 46 > len || dv.getUint32(p, true) !== 0x02014b50) throw new Error('zip_invalid');
      const method = dv.getUint16(p + 10, true);
      const time = dosTime(dv.getUint16(p + 14, true), dv.getUint16(p + 12, true));
      let csize = dv.getUint32(p + 20, true);
      const usize = dv.getUint32(p + 24, true);
      const nameLen = dv.getUint16(p + 28, true);
      const extraLen = dv.getUint16(p + 30, true);
      const commentLen = dv.getUint16(p + 32, true);
      let localOff = dv.getUint32(p + 42, true);
      const name = dec.decode(bytes.subarray(p + 46, p + 46 + nameLen));

      if (csize === 0xffffffff || localOff === 0xffffffff) {
        let q = p + 46 + nameLen;
        const end = q + extraLen;
        while (q + 4 <= end) {
          const id = dv.getUint16(q, true);
          const sz = dv.getUint16(q + 2, true);
          if (id === 0x0001) {
            let r = q + 4;
            if (usize === 0xffffffff) r += 8;
            if (csize === 0xffffffff) { csize = Number(dv.getBigUint64(r, true)); r += 8; }
            if (localOff === 0xffffffff) localOff = Number(dv.getBigUint64(r, true));
          }
          q += 4 + sz;
        }
      }
      p += 46 + nameLen + extraLen + commentLen;
      if (!wanted(name)) continue;

      const lNameLen = dv.getUint16(localOff + 26, true);
      const lExtraLen = dv.getUint16(localOff + 28, true);
      const start = localOff + 30 + lNameLen + lExtraLen;
      const raw = bytes.subarray(start, start + csize);
      let data;
      if (method === 0) data = raw;
      else if (method === 8) data = await inflateRaw(raw);
      else throw new Error('zip_method');
      out.push({ name, data, time });
    }
    return out;
  }

  function isZip(bytes) {
    return bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
  }

  /** Date et compte devinés à partir du nom de l'archive : instagram-pseudo-2026-10-21-xxxx.zip */
  function hintsFromName(name) {
    const d = String(name).match(/(20\d{2})-(\d{2})-(\d{2})/);
    const a = String(name).match(/instagram-([a-z0-9._]{1,30})-20\d{2}-\d{2}-\d{2}/i);
    return {
      date: d ? `${d[1]}-${d[2]}-${d[3]}` : null,
      account: a ? a[1].toLowerCase() : null,
    };
  }

  /**
   * items : [{ name, bytes: Uint8Array }]
   * Résultat :
   *   { backup }                                   si c'est une sauvegarde de l'app
   *   { followers: Map, following: Map, hasFollowers, hasFollowing, files, date, account, stamp }
   * stamp : heure de création de l'export lue dans le ZIP (ms, heure naïve du Pacifique), ou null.
   *         Sert à ordonner ; pour l'afficher, la convertir avec stampToInstant.
   * Instagram nomme ses archives avec le jour seulement : stamp départage plusieurs exports du même jour.
   */
  async function parseInputs(items) {
    const followers = new Map();
    const following = new Map();
    const files = [];
    let hasFollowers = false;
    let hasFollowing = false;
    let date = null;
    let account = null;
    let stamp = null;
    const dec = new TextDecoder();

    function absorb(name, text) {
      const parsed = parseListFile(name, text);
      if (!parsed) return false;
      const target = parsed.kind === 'followers' ? followers : following;
      for (const [u, t] of parsed.map) if (!target.has(u)) target.set(u, t);
      if (parsed.kind === 'followers') hasFollowers = true; else hasFollowing = true;
      files.push(name.split(/[\\/]/).pop());
      return true;
    }

    for (const item of items) {
      const hints = hintsFromName(item.name);
      date = date || hints.date;
      account = account || hints.account;

      if (isZip(item.bytes)) {
        const entries = await unzip(item.bytes, (n) => kindOf(n) !== null);
        for (const e of entries) {
          if (absorb(e.name, dec.decode(e.data)) && e.time) stamp = Math.max(stamp || 0, e.time);
        }
        continue;
      }

      const text = dec.decode(item.bytes);
      if (/\.json$/i.test(item.name) && !kindOf(item.name)) {
        let data = null;
        try { data = JSON.parse(text); } catch (e) { /* pas du JSON */ }
        if (data && data.app === 'desabos' && Array.isArray(data.snapshots)) return { backup: data };
      }
      absorb(item.name, text);
    }

    return { followers, following, hasFollowers, hasFollowing, files, date, account, stamp };
  }

  root.DesabosParser = { parseInputs, unzip, kindOf, hintsFromName, normUser, parseJsonEntries, parseHtml, stampToInstant };
})(typeof window !== 'undefined' ? window : globalThis);
