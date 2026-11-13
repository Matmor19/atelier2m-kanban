# A2M Construction — extension SketchUp de l'Atelier 2M

Murs paramétriques (simples ou multicouches), portes et fenêtres découpées automatiquement,
métré exportable vers Excel. **100 % local** : aucune licence, aucun serveur, aucune connexion internet.
Code écrit de zéro pour l'Atelier 2M (aucun fichier d'une autre extension n'a été repris).

## Installer

1. Télécharger `dist/A2M_Construction-1.0.0.rbz`.
2. Dans SketchUp : **Extensions → Extension Manager → Installer l'extension**, choisir le fichier `.rbz`.
3. Une barre d'outils « A2M Construction » apparaît (sinon : Affichage → Barres d'outils), ainsi que le menu
   **Extensions → A2M Construction**.

Testé pour SketchUp 2021 et plus récent (Windows).

## Utiliser

| Bouton | Rôle |
|---|---|
| Tracer des murs | Cliquer les angles ; double-clic ou Entrée pour finir ; clic sur le 1er point pour fermer le contour. Taper une longueur (ex. `450`) pour un mur exact. **Ctrl** : mur à droite / centré / à gauche du trait. |
| Ajouter une porte ou une fenêtre | Survoler un mur A2M : cadre vert = position, rouge = pas la place. Clic pour placer. **Ctrl** : changer de type. |
| Modifier le mur sélectionné | Hauteur, type de mur, côté, et tableau des ouvertures (position, largeur, hauteur, allège). |
| Métré | Surfaces brutes / nettes et volumes par couche, nombre d'ouvertures ; export CSV (Excel, séparateur `;`). |
| Panneau | Réglages : type de mur, hauteur, dimensions par défaut des ouvertures, **types de murs** (couches, épaisseurs, couleurs). |

- Chaque mur est un groupe SketchUp (calque « A2M Murs »), avec un sous-groupe par couche et un groupe
  « Menuiseries » (calque « A2M Menuiseries »).
- La **1re couche** d'un type est du côté **droit** du sens de tracé : en traçant le contour d'un bâtiment dans le
  sens inverse des aiguilles d'une montre, c'est le côté extérieur.
- Les angles entre murs tracés d'une seule traite sont coupés en onglet (pas de chevauchement, métré exact).
- Les données du mur sont gardées dans le groupe (attributs « A2M_Construction ») : le mur est entièrement
  reconstruit à chaque modification. Ne pas modifier la géométrie d'un mur à la main (elle serait écrasée).
- Réglages enregistrés dans `%APPDATA%\A2M_Construction\reglages.json`.

## Pour le développement

- `plugin/` : le code de l'extension (Ruby + panneau HTML/CSS/JS dans `ui/`, icônes SVG dans `icones/`).
  - `geo.rb` : tous les calculs (onglets, faces, ouvertures, métré), **sans SketchUp** → testables.
  - `murs.rb` : création / reconstruction des groupes ; `outil_mur.rb`, `outil_ouverture.rb` : outils de dessin ;
    `metre.rb` : métré + CSV ; `panneau.rb` : fenêtre HTML ; `reglages.rb` : réglages ; `main.rb` : menus.
- Tests : `ruby tests/test_geo.rb` et `ruby tests/test_sketchup.rb` (ce dernier utilise une imitation de SketchUp,
  `tests/faux_sketchup.rb`).
- Le panneau peut être ouvert dans un navigateur (`plugin/a2m_construction/ui/panneau.html`) : mode « aperçu »
  avec des données d'exemple.
- Fabriquer le `.rbz` : `sh fabriquer_rbz.sh` (après avoir changé `VERSION` dans `main.rb` et `a2m_construction.rb`).

## Pas encore fait (idées pour la suite)

Murs courbes, import de plan PDF, jonctions en T entre murs tracés séparément, bibliothèque de menuiseries
détaillées, lien avec l'estimatif DPGF du Kanban.
