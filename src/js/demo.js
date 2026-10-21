/*
 * Données d'exemple, affichées tant qu'aucun export n'a été importé.
 * Comptes inventés, générés de façon déterministe.
 */
(function (root) {
  'use strict';

  const NAMES = [
    'marie.lpz', 'atelier_sud', 'jules.vrn', 'camille_photo', 'le.petit.four', 'nina_kv', 'theo.rando',
    'sarah.bnd', 'studio.ocre', 'lucas_mtl', 'chloe.dsn', 'aix.velo', 'manon.ecrit', 'hugo_frames',
    'lea.mrc', 'bistrot.42', 'emma.travels', 'nathan.bzh', 'ines_ceramique', 'paul.gdn', 'zoe.vintage',
    'adam_runs', 'clara.pqt', 'louis.dk', 'jade.makes', 'gabriel.snd', 'alice_flore', 'tom.brt',
    'lina.coffee', 'mathis_ldn', 'eva.cuisine', 'noah.prd', 'rose.plume', 'raphael.mx', 'lou.surf',
    'arthur_bd', 'mila.studio', 'victor.lns', 'anna.marseille', 'sacha_art', 'julia.rvr', 'oscar.fmt',
    'margot.ecolo', 'ethan_skt', 'celia.pots', 'leon.street',
  ];

  function snapshot(id, daysAgo, followers, following) {
    const now = new Date();
    now.setHours(12, 0, 0, 0);
    const takenAt = now.getTime() - daysAgo * 86400000;
    const ts = (i) => Math.floor((takenAt - (400 - i * 7) * 86400000) / 1000);
    return {
      id, takenAt, account: 'exemple',
      followers: followers.map((i) => [NAMES[i], ts(i)]),
      following: following.map((i) => [NAMES[i], ts(i) + 3600]),
    };
  }

  function build() {
    const range = (a, b) => Array.from({ length: b - a }, (_, i) => a + i);
    const old = snapshot('demo-a', 63, range(0, 38), [0, 2, 3, 5, 7, 9, 11, 12, 14, 18, 21, 25, 30, 33, 40, 41]);
    const mid = snapshot('demo-b', 34,
      range(0, 38).filter((i) => ![4, 9, 16].includes(i)).concat([38, 39]),
      [0, 2, 3, 5, 7, 9, 11, 12, 14, 18, 21, 25, 30, 33, 38, 40, 41]);
    const now = snapshot('demo-c', 0,
      range(0, 38).filter((i) => ![4, 9, 16, 2, 12, 21, 27, 35].includes(i)).concat([38, 39, 42, 43, 44]),
      [0, 2, 3, 5, 7, 9, 11, 12, 14, 18, 21, 25, 30, 33, 38, 40, 41, 42, 45]);
    return [old, mid, now];
  }

  root.DesabosDemo = { build };
})(typeof window !== 'undefined' ? window : globalThis);
