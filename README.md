# T’as cru j’étais ton fan ?

Montre qui ne te suit pas en retour sur Instagram, repère qui s'est désabonné entre deux exports, et met en évidence ceux que tu suis encore.

L'app ne se connecte jamais à Instagram et ne demande aucun mot de passe. Elle lit les exports officiels (« Exporter vos informations ») et compare deux dates. Tout reste sur l'appareil.

## Ce qu'elle fait

- **Départs** : comptes qui te suivaient au début de la période et plus à la fin. Ceux que tu suis encore sont en tête, surlignés en rose, avec un bouton « Ouvrir » vers leur profil.
- **Arrivées** : nouveaux abonnés sur la période.
- Les actions (fantôme, exclure, traité) n’existent que dans « Sans retour » ; « Départs » et « Arrivées » sont en lecture seule.
- **Sans retour** : comptes que tu suis et qui ne te suivent pas. Le grand chiffre en haut suit l’onglet choisi.
- **Exclusions** : le bouton œil barré retire d’un coup un compte de « Sans retour » (star, artiste, marque…). La liste d’exclusion est gardée d’une analyse à l’autre, incluse dans la sauvegarde, et consultable avec le filtre « Exclus » pour réintégrer un compte.
- **Fantômes** : le bouton fantôme range les comptes introuvables sur Instagram (désactivés, supprimés, faux comptes bannis) qui traînent encore dans l’export. Ils disparaissent de toutes les listes ; le filtre « Fantômes » permet de les faire revenir.
- Périodes rapides (dernier écart, 1 mois, 3 mois, 1 an, tout) ou choix libre de deux exports.
- Export CSV de chaque liste, sauvegarde et restauration de tous les exports.

Bon à savoir : Instagram ne date pas les désabonnements. Un départ est repéré entre deux exports, donc plus ils sont rapprochés, plus c'est précis. Un compte supprimé, désactivé ou qui t'a bloqué compte aussi comme un départ.

## Obtenir un export Instagram

1. Instagram → ton profil → menu ☰ → **Espace Comptes**.
2. **Vos informations et autorisations** → **Exporter vos informations**.
3. **Créer une exportation**, puis sélectionner son **compte Instagram** dans la liste.
4. **Exporter sur mon appareil**.
5. Régler l’exportation : l’e-mail sur lequel être averti, **Personnaliser les informations** → uniquement **Followers et suivi(e)s**, **Période** → **Depuis le début**, **Format** → **JSON**, **Qualité des contenus multimédias** → **Qualité inférieure**.
6. **Commencer l’exportation**, puis télécharger le .zip quand Instagram prévient et l’ajouter dans l’onglet **Exports**.

## Structure du projet

```
src/
  body.html        structure de la page
  style.css        apparence (couleurs, polices, mise en page)
  js/parser.js     lecture des exports (ZIP, JSON, HTML) — sans bibliothèque
  js/compare.js    calcul des départs, arrivées, sans retour, périodes
  js/storage.js    enregistrement (navigateur, ou compte Claude dans la version Claude)
  js/files.js      enregistrement des fichiers CSV / sauvegarde
  js/demo.js       données d'exemple affichées au premier lancement
  js/app.js        interface
  sw.js            fonctionnement hors connexion
  icons/           icônes de l'app
build.mjs          construit dist/
icons.mjs          génère les icônes PNG (emoji 😎, police libre Noto Color Emoji)
serve.mjs          serveur local de développement
tests/test.mjs     tests de la lecture et de la comparaison
```

Aucune dépendance. Il faut seulement **Node.js 18 ou plus** (https://nodejs.org).

## Commandes

```bash
npm run dev     # http://localhost:5173 — reconstruit à chaque rechargement
npm run build   # produit dist/
npm test        # vérifie la lecture des exports et les calculs
npm run icons   # régénère src/icons/ (Node 22+, Chrome ou Edge, connexion internet)
```

`npm run build` produit :

- `dist/web/` : l'app complète à mettre en ligne (index.html autonome, manifest, service worker, icônes).
- `dist/claude-artifact.html` : la même app au format page Claude.

## Mettre en ligne (gratuit, GitHub Pages)

Le site est publié automatiquement par GitHub Actions (`.github/workflows/pages.yml`) : à chaque envoi sur la branche `main`, les tests tournent, l'app est construite et `dist/web/` est mis en ligne. Si un test échoue, rien n'est publié.

Première mise en place :
1. Crée un dépôt **public** sur GitHub (GitHub Pages est gratuit pour les dépôts publics).
2. Envoie le projet sur la branche `main` de ce dépôt.
3. Dans le dépôt : *Settings → Pages → Build and deployment → Source* : choisis **GitHub Actions**.
4. Le premier déploiement démarre (onglet *Actions*). L'adresse est `https://<pseudo>.github.io/<dépôt>/`.

Ensuite, chaque modification envoyée sur `main` met le site à jour en une ou deux minutes.

Puis sur l'iPhone : ouvre l'adresse dans **Safari** → **Partager** → **Sur l'écran d'accueil**. L'app s'ouvre en plein écran et fonctionne hors connexion.

## Partager l'app

Donne simplement l'adresse du site. Chaque personne l'installe de la même façon et ses exports restent sur **son** téléphone : personne ne voit ceux des autres, et toi non plus.

Le dépôt GitHub étant public, le code source est visible de tous (comme pour toute app web, il l'est de toute façon dans le navigateur). Aucune donnée personnelle n'est dans le dépôt.

## Données

- Version web installée : les exports sont stockés dans le navigateur de l'appareil (IndexedDB). Si Safari efface les données du site, ils sont perdus : utilise **Exporter une sauvegarde** de temps en temps (le fichier se range dans Fichiers via le menu de partage).
- Version Claude : les exports sont stockés de façon privée dans le compte Claude de la personne qui ouvre la page, et retrouvés sur tous ses appareils. Une personne qui n'a qu'un accès en lecture à la page les garde dans son navigateur.

## Modifier l'app

- Textes et structure : `src/body.html` et les messages dans `src/js/app.js`.
- Couleurs et polices : le bloc `:root` en haut de `src/style.css` (thème clair) et les deux blocs suivants (thème sombre).
- Règles de calcul : `src/js/compare.js`.

Après une modification : `npm test`, puis `npm run build`, puis remets `dist/web` en ligne. Le service worker récupère la nouvelle version au lancement suivant de l'app.
