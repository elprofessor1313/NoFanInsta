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

Fichiers :
- `src/body.html` : structure de la page
- `src/style.css` : apparence
- `src/js/parser.js` : lecture des exports
- `src/js/compare.js` : calculs (départs, arrivées, Fan Zone, choix de période)
- `src/js/storage.js` : IndexedDB, et base privée par utilisateur quand l'app tourne comme page Claude (`window.claude.use("db")`)
- `src/js/files.js` : enregistrement de fichiers (CSV, sauvegarde)
- `src/js/demo.js` : données d'exemple affichées sans export
- `src/js/app.js` : interface
- `src/sw.js` : service worker (hors connexion)

Commandes :
- `npm test` : tests de lecture et de calcul (`tests/test.mjs`). À lancer après chaque modification de `parser.js`, `compare.js` ou `storage.js`, et à compléter quand on change ces règles.
- `npm run build` : produit `dist/web/` (site à publier) et `dist/claude-artifact.html` (version page Claude).
- `npm run dev` : serveur local sur le port 5173, reconstruit à chaque rechargement.
- `npm run icons` : régénère `src/icons/*.png` (emoji 😎 de la police libre Noto Color Emoji sur fond `--accent`), rendu par Chrome ou Edge en headless (`icons.mjs`, Node 22+, connexion internet). À lancer après un changement d'emoji ou de `--accent`, puis `npm run build`.
- Emojis : dans la page, toujours des caractères (😎 logo, 🧐 départs), qui prennent le dessin du système (Apple sur iPhone). Ne jamais intégrer d'image des emojis d'Apple : ils sont protégés.

Ne pas modifier `dist/` à la main : il est régénéré par le build. Il n'est pas suivi par git.

Mise en ligne : GitHub Pages via `.github/workflows/pages.yml` (tests + build + publication de `dist/web/` à chaque push sur `main`). La version web héberge ses polices (`src/fonts/`, licences OFL dans `src/fonts/LICENSES.md`) et ne fait aucune requête externe : garder ça ainsi (RGPD). Seule la version page Claude charge Google Fonts.
