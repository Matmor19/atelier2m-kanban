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
  Version 3 (`BIB_MAJ_V3` / `bibMaj3()`, `BIB_V=3`) : prix vérifiés (double comptages PMR, photovoltaïque,
  volets ; couverture piscine, porte de garage, fenêtres 7.05/7.07 ; faïence des salles d'eau 14.04). Une
  mise à jour de version ne change une valeur que si elle est encore l'ancienne (`ancienPu`, `ancienF`).
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
