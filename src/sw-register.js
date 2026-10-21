// Enregistre le service worker (sw.js) de la version web installable ; intégré à la page par build.mjs.
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  // Nouvelle version installée → recharger la page (pas au tout premier chargement)
  const hadController = !!navigator.serviceWorker.controller;
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController && !reloading) { reloading = true; location.reload(); }
  });
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').then((reg) => {
    // Sur iPhone, l'app installée reprend sans se recharger : chercher une mise à jour à chaque retour
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') reg.update().catch(() => {});
    });
  }).catch(() => {}));
}
