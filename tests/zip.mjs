// Fabrique de petits ZIP pour les tests (méthodes « stored » et « deflate »), sans dépendance.
import { deflateRawSync } from 'node:zlib';

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** Date et heure au format DOS des entrées ZIP : [date, heure]. */
export const dos = (y, mo, d, h, mi) => [((y - 1980) << 9) | (mo << 5) | d, (h << 11) | (mi << 5)];

/** files : [[nom, texte, compressé ?, dos(…) ?], …] → Uint8Array du ZIP. */
export function makeZip(files) {
  const locals = []; const centrals = []; let offset = 0;
  for (const [name, text, deflate, time = [0, 0]] of files) {
    const nameBuf = Buffer.from(name);
    const raw = Buffer.from(text);
    const data = deflate ? deflateRawSync(raw) : raw;
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(deflate ? 8 : 0, 8);
    lh.writeUInt16LE(time[1], 10); lh.writeUInt16LE(time[0], 12);
    lh.writeUInt32LE(crc32(raw), 14); lh.writeUInt32LE(data.length, 18); lh.writeUInt32LE(raw.length, 22);
    lh.writeUInt16LE(nameBuf.length, 26);
    locals.push(lh, nameBuf, data);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(deflate ? 8 : 0, 10);
    ch.writeUInt16LE(time[1], 12); ch.writeUInt16LE(time[0], 14);
    ch.writeUInt32LE(crc32(raw), 16); ch.writeUInt32LE(data.length, 20); ch.writeUInt32LE(raw.length, 24);
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

/** Liste d'abonnés ou d'abonnements au format JSON récent d'Instagram. */
export function relationsJson(key, users) {
  const entries = users.map((u, i) => ({ title: u, string_list_data: [{ href: `https://www.instagram.com/_u/${u}`, timestamp: 1700000000 + i }] }));
  return JSON.stringify(key ? { [key]: entries } : entries);
}

/** Export Instagram complet (.zip) : abonnés, abonnements, heure de création DOS. */
export function instagramZip(followers, following, time) {
  const dir = 'connections/followers_and_following/';
  return makeZip([
    [dir + 'followers_1.json', relationsJson(null, followers), true, time],
    [dir + 'following.json', relationsJson('relationships_following', following), true, time],
  ]);
}
