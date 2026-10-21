/*
 * Stockage des instantanés.
 *
 *  - LocalStore : IndexedDB du navigateur (cet appareil uniquement). Repli en mémoire
 *    si IndexedDB est indisponible (navigation privée…).
 *  - CloudStore : quand l'app est ouverte comme page Claude, base privée par personne
 *    (data/users/<id>/…), retrouvée sur tous ses appareils.
 *  - Store      : combine les deux. Lit les deux, écrit dans le cloud si possible,
 *    sinon en local.
 */
(function (root) {
  'use strict';

  const META_FIELDS = ['id', 'takenAt', 'stamp', 'account', 'nFollowers', 'nFollowing', 'createdAt'];
  const CHUNK = 180000; // caractères par morceau (limite d'un document : 256 Kio)

  function metaOf(snap) {
    return {
      id: snap.id,
      takenAt: snap.takenAt,
      stamp: snap.stamp || null,
      account: snap.account || null,
      nFollowers: snap.followers.length,
      nFollowing: snap.following.length,
      createdAt: snap.createdAt || Date.now(),
    };
  }

  /* ---------------- Local ---------------- */

  function openIdb() {
    return new Promise((resolve, reject) => {
      let req;
      // « desabos » : ancien nom de l'app, garder ce nom de base pour ne pas perdre les exports déjà enregistrés
      try { req = indexedDB.open('desabos', 1); } catch (e) { reject(e); return; }
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('snapshots')) db.createObjectStore('snapshots', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error('idb_blocked'));
    });
  }

  function run(db, store, mode, fn) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, mode);
      const req = fn(tx.objectStore(store));
      tx.oncomplete = () => resolve(req ? req.result : undefined);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }

  async function createLocalStore() {
    let db = null;
    try { db = await openIdb(); } catch (e) { db = null; }

    if (!db) {
      const snaps = new Map();
      let settings = {};
      return {
        persistent: false,
        async list() { return [...snaps.values()].map(metaOf); },
        async load(id) { return snaps.get(id) || null; },
        async save(snap) { snaps.set(snap.id, snap); },
        async remove(id) { snaps.delete(id); },
        async getSettings() { return settings; },
        async setSettings(s) { settings = s; },
      };
    }

    return {
      persistent: true,
      async list() {
        const all = await run(db, 'snapshots', 'readonly', (s) => s.getAll());
        return (all || []).map(metaOf);
      },
      async load(id) { return (await run(db, 'snapshots', 'readonly', (s) => s.get(id))) || null; },
      async save(snap) { await run(db, 'snapshots', 'readwrite', (s) => s.put(snap)); },
      async remove(id) { await run(db, 'snapshots', 'readwrite', (s) => s.delete(id)); },
      async getSettings() { return (await run(db, 'kv', 'readonly', (s) => s.get('settings'))) || {}; },
      async setSettings(v) { await run(db, 'kv', 'readwrite', (s) => s.put(v, 'settings')); },
    };
  }

  /* ---------------- Cloud (page Claude) ---------------- */

  function encodeList(list) {
    return list.map(([u, t]) => u + '\t' + (t || 0)).join('\n');
  }
  function decodeList(text) {
    if (!text) return [];
    return text.split('\n').map((line) => {
      const i = line.indexOf('\t');
      return [line.slice(0, i), Number(line.slice(i + 1)) || 0];
    });
  }

  function createCloudStore(db, uid) {
    const base = 'data/users/' + uid;
    const metaRef = (id) => db.doc(base + '/' + id);
    const chunkRef = (id, i) => db.doc(base + '/' + id + '/c/' + i);

    return {
      async list() {
        const qs = await db.collection(base).get();
        return qs.docs
          .map((d) => d.data())
          .filter((d) => d && d.kind === 'snapshot')
          .map((d) => {
            const m = {};
            for (const k of META_FIELDS) m[k] = d[k] === undefined ? null : d[k];
            return m;
          });
      },
      async load(id) {
        const metaSnap = await metaRef(id).get();
        if (!metaSnap.exists) return null;
        const m = metaSnap.data();
        const parts = await Promise.all(
          Array.from({ length: m.chunks || 0 }, (_, i) => chunkRef(id, i).get())
        );
        const text = parts.map((p) => (p.exists ? p.data().t : '')).join('');
        const [fl, fg] = text.split('\u0000');
        return {
          id: m.id, takenAt: m.takenAt, stamp: m.stamp || null, account: m.account, createdAt: m.createdAt,
          followers: decodeList(fl), following: decodeList(fg),
        };
      },
      async save(snap) {
        const text = encodeList(snap.followers) + '\u0000' + encodeList(snap.following);
        const chunks = [];
        for (let i = 0; i < text.length; i += CHUNK) chunks.push(text.slice(i, i + CHUNK));
        for (let i = 0; i < chunks.length; i++) await chunkRef(snap.id, i).set({ t: chunks[i] });
        // la fiche est écrite en dernier : un instantané n'apparaît que complet
        await metaRef(snap.id).set(Object.assign({ kind: 'snapshot', chunks: chunks.length }, metaOf(snap)));
      },
      async remove(id) {
        const metaSnap = await metaRef(id).get();
        const n = metaSnap.exists ? metaSnap.data().chunks || 0 : 0;
        await metaRef(id).delete();
        for (let i = 0; i < n; i++) await chunkRef(id, i).delete();
      },
      async getSettings() {
        const s = await db.doc(base + '/settings').get();
        return s.exists ? s.data().v || {} : {};
      },
      async setSettings(v) { await db.doc(base + '/settings').set({ kind: 'settings', v }); },
    };
  }

  async function connectCloud() {
    const c = root.claude;
    if (!c || typeof c.use !== 'function') return null;
    try {
      const [db, user] = await Promise.all([c.use('db'), c.use('user')]);
      if (!db || !user) return null;
      const uid = await user.id();
      if (!uid) return null;
      return createCloudStore(db, uid);
    } catch (e) {
      return null;
    }
  }

  /* ---------------- Combinaison ---------------- */

  function createStore() {
    let local = null;
    let cloud = null;
    let cloudWritable = true;
    const where = new Map(); // id -> "local" | "cloud"

    const store = {
      async init(onCloudReady) {
        local = await createLocalStore();
        connectCloud().then((c) => {
          if (!c) return;
          cloud = c;
          if (onCloudReady) onCloudReady();
        });
      },
      /** "cloud" : compte Claude ; "local" : navigateur ; "memory" : rien n'est conservé. */
      mode() {
        if (cloud && cloudWritable) return 'cloud';
        return local && local.persistent ? 'local' : 'memory';
      },
      async list() {
        const merged = new Map();
        for (const m of await local.list()) { merged.set(m.id, Object.assign(m, { where: 'local' })); }
        if (cloud) {
          try {
            for (const m of await cloud.list()) merged.set(m.id, Object.assign(m, { where: 'cloud' }));
          } catch (e) { /* lecture cloud impossible : on garde le local */ }
        }
        where.clear();
        for (const m of merged.values()) where.set(m.id, m.where);
        return [...merged.values()].sort(root.DesabosCompare.snapOrder);
      },
      async load(id) {
        if (where.get(id) === 'cloud' && cloud) return cloud.load(id);
        return local.load(id);
      },
      async save(snap) {
        if (cloud && cloudWritable) {
          try { await cloud.save(snap); where.set(snap.id, 'cloud'); return 'cloud'; }
          catch (e) { cloudWritable = false; }
        }
        await local.save(snap);
        where.set(snap.id, 'local');
        return 'local';
      },
      async remove(id) {
        if (where.get(id) === 'cloud' && cloud) await cloud.remove(id);
        else await local.remove(id);
        where.delete(id);
      },
      async getSettings() {
        const l = await local.getSettings().catch(() => ({}));
        if (!cloud) return l;
        const c = await cloud.getSettings().catch(() => ({}));
        return mergeSettings(l, c);
      },
      async setSettings(v) {
        if (cloud && cloudWritable) {
          try { await cloud.setSettings(v); return; } catch (e) { cloudWritable = false; }
        }
        await local.setSettings(v);
      },
    };
    return store;
  }

  // Réglages : done = comptes cochés « Traité », excluded = comptes exclus de « Fan Zone »,
  // ghosts = comptes fantômes (introuvables), masqués de toutes les listes.
  // Tous sont des { pseudo: date (ms) } ; on réunit ceux de l'appareil et ceux du compte Claude.
  function mergeSettings(a, b) {
    a = a || {};
    b = b || {};
    return {
      done: Object.assign({}, a.done || {}, b.done || {}),
      excluded: Object.assign({}, a.excluded || {}, b.excluded || {}),
      ghosts: Object.assign({}, a.ghosts || {}, b.ghosts || {}),
    };
  }

  root.DesabosStorage = { createStore, metaOf, encodeList, decodeList, mergeSettings };
})(typeof window !== 'undefined' ? window : globalThis);
