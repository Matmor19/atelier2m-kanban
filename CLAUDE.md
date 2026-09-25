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
