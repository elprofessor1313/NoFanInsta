// Tests de la lecture des exports et de la comparaison.  node tests/test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { deflateRawSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'js');
for (const f of ['parser.js', 'compare.js', 'storage.js']) {
  vm.runInThisContext(readFileSync(join(SRC, f), 'utf8'), { filename: f });
}
const P = globalThis.DesabosParser;
const C = globalThis.DesabosCompare;
const S = globalThis.DesabosStorage;

let passed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.error('  ✗ ' + name + '\n    ' + (e.stack || e)); process.exitCode = 1; }
}

// --- Fabrique d'un petit ZIP (méthodes "stored" et "deflate") ---
function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function makeZip(files) {
  const locals = []; const centrals = []; let offset = 0;
  for (const [name, text, deflate, dos = [0, 0]] of files) {
    const nameBuf = Buffer.from(name);
    const raw = Buffer.from(text);
    const data = deflate ? deflateRawSync(raw) : raw;
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(deflate ? 8 : 0, 8);
    lh.writeUInt32LE(crc32(raw), 14); lh.writeUInt32LE(data.length, 18); lh.writeUInt32LE(raw.length, 22);
    lh.writeUInt16LE(dos[1], 10); lh.writeUInt16LE(dos[0], 12);
    lh.writeUInt16LE(nameBuf.length, 26);
    locals.push(lh, nameBuf, data);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(deflate ? 8 : 0, 10);
    ch.writeUInt32LE(crc32(raw), 16); ch.writeUInt32LE(data.length, 20); ch.writeUInt32LE(raw.length, 24);
    ch.writeUInt16LE(dos[1], 12); ch.writeUInt16LE(dos[0], 14);
    ch.writeUInt16LE(nameBuf.length, 28); ch.writeUInt32LE(offset, 42);
    centrals.push(ch, nameBuf);
    offset += 30 + nameBuf.length + data.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return new Uint8Array(Buffer.concat([...locals, cd, end]));
}

// Ancien format : le pseudo est dans "value"
const followersOld = JSON.stringify([
  { title: '', media_list_data: [], string_list_data: [{ href: 'https://www.instagram.com/marie.lpz', value: 'marie.lpz', timestamp: 1700000000 }] },
  { title: '', media_list_data: [], string_list_data: [{ href: 'https://www.instagram.com/atelier_sud', value: 'atelier_sud', timestamp: 1700100000 }] },
  { title: '', media_list_data: [], string_list_data: [{ href: 'https://www.instagram.com/jules.vrn', value: 'jules.vrn', timestamp: 1700200000 }] },
]);
// Format récent : le pseudo est dans "title", plus de "value"
const followingNew = JSON.stringify({ relationships_following: [
  { title: 'marie.lpz', string_list_data: [{ href: 'https://www.instagram.com/_u/marie.lpz', timestamp: 1690000000 }] },
  { title: 'jules.vrn', string_list_data: [{ href: 'https://www.instagram.com/_u/jules.vrn', timestamp: 1690000100 }] },
  { title: 'studio.ocre', string_list_data: [{ href: 'https://www.instagram.com/_u/studio.ocre', timestamp: 1690000200 }] },
]});
const enc = (s) => new Uint8Array(Buffer.from(s));

console.log('Lecture des exports');

await test('JSON sélectionnés directement (ancien et nouveau format)', async () => {
  const r = await P.parseInputs([
    { name: 'followers_1.json', bytes: enc(followersOld) },
    { name: 'following.json', bytes: enc(followingNew) },
  ]);
  assert.equal(r.hasFollowers, true);
  assert.equal(r.hasFollowing, true);
  assert.deepEqual([...r.followers.keys()], ['marie.lpz', 'atelier_sud', 'jules.vrn']);
  assert.equal(r.followers.get('atelier_sud'), 1700100000);
  assert.deepEqual([...r.following.keys()], ['marie.lpz', 'jules.vrn', 'studio.ocre']);
});

await test('ZIP complet, compressé, avec followers_2.json et date dans le nom', async () => {
  const followers2 = JSON.stringify([{ title: '', string_list_data: [{ href: 'https://www.instagram.com/nina_kv', value: 'nina_kv', timestamp: 1 }] }]);
  const zip = makeZip([
    ['connections/followers_and_following/followers_1.json', followersOld, true],
    ['connections/followers_and_following/followers_2.json', followers2, false],
    ['connections/followers_and_following/following.json', followingNew, true],
    ['connections/followers_and_following/following_hashtags.json', '{"relationships_following_hashtags":[]}', true],
    ['media/posts/photo.jpg', 'xxxx', false],
  ]);
  const r = await P.parseInputs([{ name: 'instagram-mon.compte-2026-10-21-AbCdEf.zip', bytes: zip }]);
  assert.equal(r.followers.size, 4);
  assert.ok(r.followers.has('nina_kv'));
  assert.equal(r.following.size, 3);
  assert.equal(r.date, '2026-10-21');
  assert.equal(r.account, 'mon.compte');
  assert.ok(!r.files.includes('following_hashtags.json'));
});

await test('Export HTML', async () => {
  const html = '<html><body><div><a target="_blank" href="https://www.instagram.com/lea.mrc">lea.mrc</a></div><div><a href="https://www.instagram.com/hugo_frames">hugo_frames</a></div></body></html>';
  const r = await P.parseInputs([{ name: 'followers_1.html', bytes: enc(html) }]);
  assert.deepEqual([...r.followers.keys()], ['lea.mrc', 'hugo_frames']);
  assert.equal(r.hasFollowing, false);
});

await test('Sauvegarde reconnue (ancien et nouveau nom de fichier)', async () => {
  for (const name of ['desabos-sauvegarde-2026-10-21.json', 'tas-cru-sauvegarde-2026-10-21.json']) {
    const r = await P.parseInputs([{ name, bytes: enc(JSON.stringify({ app: 'desabos', version: 1, snapshots: [] })) }]);
    assert.ok(r.backup, name);
  }
});

await test('Pseudos invalides ignorés, doublons fusionnés', async () => {
  const r = await P.parseInputs([{ name: 'followers_1.json', bytes: enc(JSON.stringify([
    { title: 'Pas Un Pseudo!', string_list_data: [{ href: 'https://www.instagram.com/vrai.compte', timestamp: 5 }] },
    { title: '', string_list_data: [{ value: '@Vrai.Compte', timestamp: 9 }] },
  ])) }]);
  assert.deepEqual([...r.followers.entries()], [['vrai.compte', 5]]);
});

console.log('Comparaison');

const day = 86400000;
const snapA = { id: 'a', takenAt: Date.UTC(2026, 8, 1), followers: [['marie.lpz', 1], ['atelier_sud', 2], ['jules.vrn', 3], ['nina_kv', 4]], following: [['marie.lpz', 1]] };
const snapB = { id: 'b', takenAt: Date.UTC(2026, 9, 21), followers: [['marie.lpz', 1], ['theo.rando', 9]], following: [['marie.lpz', 1], ['jules.vrn', 2], ['studio.ocre', 3]] };

await test('Départs, ceux suivis encore en premier', () => {
  const d = C.diff(snapA, snapB);
  assert.deepEqual(d.lost.map((x) => [x.u, x.stillFollowing]), [['jules.vrn', true], ['atelier_sud', false], ['nina_kv', false]]);
  assert.equal(d.stillCount, 1);
  assert.deepEqual(d.gained.map((x) => x.u), ['theo.rando']);
  assert.deepEqual(d.noBack.map((x) => x.u), ['jules.vrn', 'studio.ocre']);
});

await test('Exclusions de la liste sans retour', () => {
  const d = C.diff(snapA, snapB);
  const { kept, hidden } = C.splitExcluded(d.noBack, { 'studio.ocre': 1, 'compte.absent': 2 });
  assert.deepEqual(kept.map((x) => x.u), ['jules.vrn']);
  assert.deepEqual(hidden.map((x) => x.u), ['studio.ocre']);
  assert.deepEqual(C.splitExcluded(d.noBack, undefined).kept.length, 2);
});

// date et heure au format DOS : [date, heure]
const dos = (y, mo, d, h, mi) => [((y - 1980) << 9) | (mo << 5) | d, (h << 11) | (mi << 5)];

await test('Heure de création lue dans le ZIP (plusieurs exports le même jour)', async () => {
  const zip = (h, mi) => makeZip([
    ['connections/followers_and_following/followers_1.json', followersOld, true, dos(2026, 10, 21, h, mi)],
    ['connections/followers_and_following/following.json', followingNew, true, dos(2026, 10, 21, h, mi)],
    ['connections/followers_and_following/close_friends.json', '[]', true, dos(2026, 10, 21, 23, 59)],
  ]);
  const r = await P.parseInputs([{ name: 'instagram-mon.compte-2026-10-21-AbCdEf.zip', bytes: zip(15, 7) }]);
  assert.equal(r.stamp, Date.UTC(2026, 9, 21, 15, 7));
  const r2 = await P.parseInputs([{ name: 'followers_1.json', bytes: enc(followersOld) }]);
  assert.equal(r2.stamp, null);
});

await test('Heure du ZIP (Pacifique) convertie en instant réel', () => {
  assert.equal(P.stampToInstant(Date.UTC(2026, 9, 21, 15, 7)), Date.UTC(2026, 9, 21, 22, 7)); // heure d'été : UTC−7
  assert.equal(P.stampToInstant(Date.UTC(2026, 0, 15, 10, 0)), Date.UTC(2026, 0, 15, 18, 0)); // heure d'hiver : UTC−8
  assert.equal(P.stampToInstant(Date.UTC(2026, 9, 21, 20, 30)), Date.UTC(2026, 9, 22, 3, 30)); // change de jour en UTC
  assert.equal(P.stampToInstant(null), null);
});

await test('Exports du même jour rangés par heure de création, puis ordre d’import', () => {
  const day = Date.UTC(2026, 9, 21, 12);
  const metas = [
    { id: 'c', takenAt: day, stamp: Date.UTC(2026, 9, 21, 15, 7), createdAt: 1 },
    { id: 'a', takenAt: day, stamp: Date.UTC(2026, 9, 21, 13, 55), createdAt: 3 },
    { id: 'b', takenAt: day, stamp: Date.UTC(2026, 9, 21, 14, 47), createdAt: 2 },
    { id: 'z', takenAt: day - 86400000, stamp: null, createdAt: 9 },
  ].sort(C.snapOrder);
  assert.deepEqual(metas.map((m) => m.id), ['z', 'a', 'b', 'c']);
  assert.deepEqual(C.pickRange(metas, 'last'), { from: 'b', to: 'c', exact: true });
  const noStamp = [{ id: 'y', takenAt: day, createdAt: 5 }, { id: 'x', takenAt: day, createdAt: 4 }].sort(C.snapOrder);
  assert.deepEqual(noStamp.map((m) => m.id), ['x', 'y']);
});

await test('Choix de la période', () => {
  const metas = [0, 10, 20, 50].map((d, i) => ({ id: 'm' + i, takenAt: Date.UTC(2026, 0, 1) + d * day }));
  assert.deepEqual(C.pickRange(metas, 'last'), { from: 'm2', to: 'm3', exact: true });
  assert.deepEqual(C.pickRange(metas, 'all'), { from: 'm0', to: 'm3', exact: true });
  assert.deepEqual(C.pickRange(metas, 30), { from: 'm2', to: 'm3', exact: true });
  assert.deepEqual(C.pickRange(metas, 45), { from: 'm0', to: 'm3', exact: true });
  assert.deepEqual(C.pickRange(metas, 365), { from: 'm0', to: 'm3', exact: false });
  assert.deepEqual(C.pickRange(metas.slice(0, 1), 'last'), { from: 'm0', to: 'm0', exact: true });
});

await test('Encodage pour le stockage en ligne', () => {
  const list = [['a.b', 123], ['c_d', 0]];
  assert.deepEqual(S.decodeList(S.encodeList(list)), list);
  assert.deepEqual(S.decodeList(''), []);
});

await test('Réglages fusionnés (appareil + compte Claude)', () => {
  const m = S.mergeSettings({ done: { a: 1 }, excluded: { star: 1 }, ghosts: { faux: 3 } }, { excluded: { chanteur: 2 } });
  assert.deepEqual(m, { done: { a: 1 }, excluded: { star: 1, chanteur: 2 }, ghosts: { faux: 3 } });
  assert.deepEqual(S.mergeSettings({}, undefined), { done: {}, excluded: {}, ghosts: {} });
});

console.log(`\n${passed} tests réussis.`);
