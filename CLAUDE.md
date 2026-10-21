# T’as cru j’étais ton fan ? — notes pour Claude Code

App web (PWA) d'audit des abonnés Instagram, pensée d'abord pour iPhone. Elle lit les exports officiels d'Instagram (« Exporter vos informations », format JSON ou HTML, en .zip ou fichiers séparés), enregistre chaque export comme un instantané daté, et compare deux instantanés : départs (abonnés perdus), arrivées, Fan Zone (comptes que l'utilisateur suit et qui ne le suivent pas ; identifiant `noBack` dans le code). Les départs que l'utilisateur suit encore sont mis en évidence.

Règles importantes :
- Jamais de connexion à Instagram, d'identifiants ou de scraping : uniquement les exports officiels.
- Aucune dépendance npm. Le ZIP est lu à la main dans `src/js/parser.js` (DecompressionStream "deflate-raw"). Garder le projet sans dépendance.
- Pas de modules ES ni de bundler : chaque fichier de `src/js/` est un script classique qui expose un objet global (`DesabosParser`, `DesabosCompare`, etc.). `build.mjs` les concatène dans l'ordre de `SCRIPTS` et les intègre dans un seul `index.html`.
- Interface et textes en français, tutoiement.
- Toutes les couleurs passent par les variables CSS de `:root` dans `src/style.css`, avec les deux blocs du thème sombre à garder synchronisés.
- Ton fun et décalé (emojis, petites phrases), mais les libellés restent clairs. Style visuel : bords épais `--edge` et ombres décalées.
- L'app s'appelait « Désabos ». Les identifiants internes gardent ce nom et ne doivent pas changer : base IndexedDB `desabos`, champ `app: 'desabos'` des sauvegardes, objets globaux `DesabosXxx`. Les renommer ferait perdre les données déjà enregistrées.

Fichiers (dans l'ordre de `SCRIPTS`). Logique sans DOM, testée par `npm test` :
- `src/js/parser.js` : lecture des exports (ZIP, JSON, HTML), heure de création des ZIP
- `src/js/compare.js` : règles métier (départs, arrivées, Fan Zone, fantômes et exclus, ordre des exports, choix de période)
- `src/js/storage.js` : IndexedDB, et base privée par utilisateur quand l'app tourne comme page Claude (`window.claude.use("db")`)
- `src/js/format.js` : mise en forme française (nombres, dates, périodes, libellés d'exports)
- `src/js/files.js` : CSV et enregistrement de fichiers (CSV, sauvegarde)
- `src/js/demo.js` : données d'exemple affichées sans export

Interface, testée par `npm run test:e2e` :
- `src/js/dom.js` : outils DOM (`$`, `el`), icônes (une seule définition, `data-icon` dans la page), message éphémère
- `src/js/audit.js` : onglet Résultats (période, grand chiffre, listes, actions de la Fan Zone, CSV)
- `src/js/exports.js` : onglet Exports (liste, import, vérification, sauvegarde)
- `src/js/app.js` : état, données, réglages, navigation, démarrage ; passe un contexte (`ctx`) aux onglets
- `src/body.html` (structure), `src/style.css` (apparence), `src/sw.js` + `src/sw-register.js` (hors connexion et mises à jour)

Garder cette séparation : une règle de calcul va dans `compare.js` (avec un test), une mise en forme dans `format.js`, jamais dans l'interface.

Commandes :
- `npm test` : tests de la logique (`tests/test.mjs`). À lancer après chaque modification, et à compléter quand on change une règle.
- `npm run test:e2e` : test de l'interface dans Chrome ou Edge headless (`tests/e2e.mjs`, Node 22+) : parcours démo, Fan Zone, import, hors connexion, aucune requête externe. À lancer après une modification de l'interface.
- `tools/chrome.mjs` : pilotage de Chrome partagé par `icons.mjs` et `tests/e2e.mjs` ; `tests/zip.mjs` : faux exports .zip pour les tests.
- `npm run build` : produit `dist/web/` (site à publier) et `dist/claude-artifact.html` (version page Claude).
- `npm run dev` : serveur local sur le port 5173, reconstruit à chaque rechargement.
- `npm run icons` : régénère `src/icons/*.png` (emoji 😎 de la police libre Noto Color Emoji sur fond `--accent`), rendu par Chrome ou Edge en headless (`icons.mjs`, Node 22+, connexion internet). À lancer après un changement d'emoji ou de `--accent`, puis `npm run build`.
- Emojis : dans la page, toujours des caractères (😎 logo, 🧐 départs), qui prennent le dessin du système (Apple sur iPhone). Ne jamais intégrer d'image des emojis d'Apple : ils sont protégés.

Ne pas modifier `dist/` à la main : il est régénéré par le build. Il n'est pas suivi par git.

Mise en ligne : GitHub Pages via `.github/workflows/pages.yml` (tests + build + publication de `dist/web/` à chaque push sur `main`). La version web héberge ses polices (`src/fonts/`, licences OFL dans `src/fonts/LICENSES.md`) et ne fait aucune requête externe : garder ça ainsi (RGPD). Seule la version page Claude charge Google Fonts.
