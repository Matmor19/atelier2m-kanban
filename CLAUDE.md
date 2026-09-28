# Kanban Atelier 2M

Kanban de suivi des dossiers de l'Atelier 2M (dessin d'architecture).
Site en ligne (hébergé sur Render) : https://atelier2m-kanban.onrender.com

Le propriétaire du projet est débutant : toujours expliquer les étapes simplement, en français.

## Fichiers utiles

- `public/index.html` : **l'application complète** en un seul fichier (HTML, CSS et JavaScript).
  C'est le fichier à modifier pour faire évoluer le Kanban.
- `server.js` (racine) : petit serveur Node/Express utilisé par Render. Il sert le dossier `public/`
  et renvoie `public/index.html` pour toutes les autres adresses. Démarrage : `npm start`.
- `public/manifest.webmanifest`, `public/icon-192.png`, `public/icon-512.png` : permettent
  d'installer le Kanban comme application (sur téléphone ou ordinateur).

## Données (Google Drive)

Les données sont sauvegardées dans Google Drive via un script Google Apps Script.
L'adresse du script est dans la variable `API` de `public/index.html`
(`var API='https://script.google.com/macros/s/.../exec'`). Ce script gère :
- la sauvegarde des dossiers (cartes du Kanban) ;
- les documents clients ;
- la synchronisation avec Google Agenda.

Ne pas changer l'adresse `API` sans demande explicite : cela couperait l'accès aux données.

## Contrats, documents Word et numérotation

- Un dossier (carte) peut contenir plusieurs **contrats** (`c.contrats`) : types `A` (mission complète),
  `PC`, `SUIVI` (suivi de chantier) et `LIBRE`. Chaque contrat a son montant, son échéancier (`ech`),
  ses textes (`tx`) et ses versions de proposition (`versions`). L'estimatif (`c.est`) et l'annexe PLU
  (`c.plu`) sont communs au dossier. Paramètres bancaires et échéanciers par défaut : `DB.reglages`.
- **Argent en centimes entiers** (jamais de nombres à virgule) ; pourcentages en centièmes de %
  (6,2 % = 620). Fonctions : `cts()` (saisie → centimes), `fmtE()` (affichage), `echCalc()`.
- Modèles Word : `public/modeles/*.docx`, remplis dans le navigateur par docxtemplater (CDN jsdelivr).
  Ils sont **fabriqués** par `outils/modeles/generer.js` (`cd outils/modeles && npm install && node generer.js`) :
  modifier le générateur puis relancer, ne pas éditer les .docx à la main. `essai.js` les remplit avec
  un client fictif pour vérification (sortie dans `outils/modeles/essais/`, non versionnée).
- **Signature** (`k.signature` = date, version signée, montant figé, PDF) : l'échéancier est figé
  (`fige` par tranche, `etat` : `a_facturer` / `prevue`). **Avenants** (`k.avenants`) : un « plus »
  ajoute une tranche, un « moins » réduit une tranche (`reduc`). Total = montant signé + avenants
  (`ctrMontant`). Avenant Word : modèle `public/modeles/avenant.docx`, sans numéro P/F.
- **Facturation** (`k.factures`) : acompte / situation / solde / avoir, lignes rattachées aux tranches
  (`t`), paiements (`paiements`), relances (`relances` : 1re, 2e, mise en demeure). Une facture émise
  n'est jamais modifiée ni supprimée (correction par avoir) ; elle est enregistrée AVANT la création du
  Word. Chaque facture est aussi copiée dans `DB.registre` (registre chronologique, export CSV).
  Les tranches passent « à facturer » via `majDeclencheurs()` (checklists, colonnes, dates) ou le bouton
  « Étape atteinte ». Modèle `public/modeles/facture.docx` (factures et avoirs). Un dossier facturé ne
  peut pas être supprimé.
- **Estimation des travaux (DPGF)** : bibliothèque de prix commune `DB.bib` (sinon `BIB_ORIGINE`, tirée du
  gabarit « Maison ossature bois » : 23 lots, 155 lignes ; lots 18 à 23 optionnels), modifiable dans
  Paramètres → « Bibliothèque de prix ». Chaque ligne a une règle de quantité (`f`, ex. `P*3.0625`, `CH*2`)
  et une condition (`cond`, ex. `PISC>0`), lues par `evalExpr()` (aucun `eval`). Variables : `DPGF_VARS`
  (S, N, E, P, CH, SDE, WC, GAR, TER, PISC, COUV, PV, ANC, EGOUT, CUVE, PMR, EXT, VOIRIE). Par dossier :
  `c.est.dpgf = {rep, lignes}` (copie des lignes ; `man` = quantité saisie à la main, `off` = exclue).
  `dpgfCalc()` recalcule et remplit `c.est.lots` avec les totaux par lot (`est.source='dpgf'`) : le Word
  « Estimatif » et les contrats utilisent donc le même total. Les lots saisis à la main avant l'assistant
  sont gardés dans `est.lotsManuel`. Boutons : export CSV, « Envoyer vers le contrat » (`calc='taux'`,
  `travaux`), Word Estimatif seul (`genEstimatifSeul`, sans numéro).
  Lot 21 Garage (version 2 de la bibliothèque, `BIB_MAJ_V2` / `bibMaj()`, appliquée aussi à un `DB.bib` déjà
  modifié sans écraser les prix changés) : fondations, murs maçonnerie (`GARM=1`) ou ossature bois (`GARM=2`)
  sur `PGAR` ml × 2,40 m, charpente-couverture. Chaque ligne peut avoir une note (`obs`).
  **Configurateur de menuiseries** (`d.menus` : type, dimensions en cm, matériau, occultation, commande,
  quantité) : `menuLignes()` crée une ligne par menuiserie dans le lot 7 et la pose regroupée dans le lot 8
  (lignes `menu`, non modifiables dans le tableau). Tarifs : `DB.bibMenu` (sinon `MENU_ORIGINE`), copiés
  dans le dossier (`d.menuTarif`). « Mettre à jour depuis la bibliothèque » (`dpgfPrix`) reprend prix, notes,
  tarifs et nouvelles lignes (sauf celles retirées : `d.retirees`).
  Dimensions des menuiseries en **cm** : une largeur > 600 ou une hauteur > 350 est considérée comme des mm et
  divisée par 10 (`cmDe`, à la saisie et au chargement des données via `corrigerMenusMm()`) ; alerte si > 12 m².
  Version 3 (`BIB_MAJ_V3` / `bibMaj3()`, `BIB_V=3`) : prix vérifiés (double comptages PMR, photovoltaïque,
  volets ; couverture piscine, porte de garage, fenêtres 7.05/7.07 ; faïence des salles d'eau 14.04). Une
  mise à jour de version ne change une valeur que si elle est encore l'ancienne (`ancienPu`, `ancienF`).
- **Word « Estimatif »** (`estimatif_A` / `estimatif_B`, même corps `corpsEstimatif()` dans le générateur) : sections
  facultatives Présentation (`a_presentation`), Objet de la mission (`a_est_objet`, phrase « Proposition
  d'honoraires » si `a_est_ctr`) et Points de vigilance (`a_vigilance`), masquées si vides ; totaux HT / TVA / TTC
  dans le tableau des lots ; annexes avec « € / m² hab. » et « Observation ». Champs : `estTextesHaut()` /
  `estTextesVig()` (fenêtre Estimatif et bloc « Textes du Word » de l'assistant) ; listes stockées en texte,
  une ligne par puce (`e.objet`, `e.vigilance`).
  Titres de l'estimatif en gras (`HE()`, orange foncé C85A1E, 12 pt). Avertissement avant le Word si une section
  est vide (`sectionsVides()`). Postes annexes : « Coût d'acquisition du terrain » et « Frais de notaire » en tête
  (0 €, hors base de la provision, `ANNEXES_TERRAIN()`), ajoutés une fois aux estimatifs existants
  (`ajouterAnnexesTerrain()`, marqueur `e.annexesTerrain`).
  **Pré-remplissage** (`preremplirEst()`, appelé par `ctrSave`, `sf` et `renderCtrs`) : « Objet de la mission »
  généré depuis les contrats (`missionsDe` : A = liste complète ; PC et SUIVI séparés = une liste par mission
  avec sous-titres « # … » ; LIBRE ignoré ; ligne PMR si coché dans le DPGF ; phrases `OBJET_PHRASES`) et
  « Présentation » composée depuis la fiche (`presentationAuto` : nature, surface, commune, résumé). Un champ
  suit les changements tant qu'il est identique au dernier texte automatique (`e.objetAuto`, `e.introAuto`,
  `e.presAuto`) ; retouché par l'utilisateur, il n'est plus jamais modifié (boutons « ↻ » pour régénérer).
  Points de vigilance : saisie manuelle uniquement.
  **Terrain et taxe d'aménagement** (`estFinHtml()`, bloc dans l'assistant DPGF et la fenêtre Estimatif) : valeur
  d'achat du terrain (`e.terrain`, centimes) et taxe (`e.ta` : surf, gar, tc, td en centièmes de %, vf en centimes,
  rp) calculée par `taCalc()` : base = 50 % des 100 premiers m² (résidence principale) + reste + 50 % du garage,
  × valeur forfaitaire × (taux communal + départemental), + piscine (m² de bassin × 250 €, `TA_PISC_DEF`) et places de
  stationnement extérieures (× 2 000 €, `TA_STAT_DEF`), sans abattement, au même taux. `annexesAuto()` remplit les lignes annexes terrain et
  taxe (marqueur `auto`) ; une ligne dont le montant est retouché à la main perd `auto` et n'est plus modifiée.
  Valeur forfaitaire par défaut : Paramètres (`DB.reglages.taVf`, `taVfAnnee`), à mettre à jour chaque année.
  **Taux votés** : `chercherTauxTA()` interroge directement depuis le navigateur (CORS autorisé) le jeu
  data.economie.gouv.fr `delta_deliberation_tam_17_01_23` (API explore v2.1 ; code commune sans zéros initiaux ;
  priorité parcelle > section > droit commun ; part départementale ; taux 99 = non défini ; valeur de stationnement
  votée). Lancée après une étude de faisabilité réussie ou par le bouton de l'estimatif. Résultat dans `c.taTaux` ;
  `appliquerTauxTA()` pré-remplit tc / td / vstat s'ils sont vides ou déjà issus de la source (`…Src='data'`),
  jamais s'ils ont été saisis à la main (`…Manuel`). Mention « source : data.economie.gouv.fr, à vérifier ».
- **Parcelles cadastrales** (fiche) : une ligne par parcelle, `c.parcelles = [{section, numero}]` (`renderParcelles`,
  `parcSet` : ajout, suppression, « Réinitialiser les parcelles »). `c.cad` = texte recomposé (`cadTexte`) utilisé
  par les documents Word et comparé par l'étude de faisabilité. Ancien texte libre converti à l'ouverture du
  dossier (`migrerParcelles` via `refsCadastre`), texte d'origine gardé dans `c.cadOrig` (et utilisé tel quel
  tant que les parcelles ne sont pas modifiées). Étude et taux votés lisent `parcellesDe(c)`.
- **Étude de faisabilité** (niveau 1, sans IA) : bouton « 🔎 Étude de faisabilité » sous la parcelle cadastrale de
  la fiche (actif si commune + au moins une parcelle). Le Kanban envoie `action:'faisabilite'` au script Google
  (`faisabilite_()` dans le .gs, version 5) qui interroge api-adresse (code INSEE), apicarto IGN (cadastre,
  GPU zone-urba / document / secteur-cc / municipality pour le RNU) et Géorisques. Lecture des références :
  `refsCadastre()` (« Section AB n°12 », « 240 - 242 et 244 AI »…). Résultat mémorisé dans `c.faisa` (avec
  `cad` au moment de l'étude), affiché par `renderFaisa()`, bouton « Actualiser ». Donnée brute indicative
  (`FAISA_MENTION`), aucune interprétation automatique.
- **Numérotation** A2M-AAAA-P001 (propositions) / A2M-AAAA-F001 (factures et avoirs) : attribuée
  uniquement par le script Google (`action: 'numero'`, avec verrou), jamais pendant un aperçu.
  Le code du script est dans `apps-script/Kanban_Sauvegarde.gs` : après toute modification, le
  propriétaire doit le recopier dans Google Apps Script et publier une nouvelle version.
- **Confidentialité** : ne jamais enregistrer dans le dépôt de documents ou données de vrais clients
  (le dossier `public/` est en ligne). Pour les essais, utiliser des clients fictifs.

## Anciennes copies : NE PAS MODIFIER

Ces fichiers et dossiers sont d'anciennes copies inutilisées :
- `index.html` et `index_3.html` à la racine ;
- le dossier `publique/` ;
- le dossier `public/public/`.

## Règles de travail

1. Toujours tester les modifications avant de les envoyer (par exemple lancer `npm install`
   puis `npm start` et ouvrir http://localhost:3000, vérifier qu'il n'y a pas d'erreur JavaScript).
2. Toujours pousser directement sur la branche `main` : Render met alors le site à jour
   automatiquement.
