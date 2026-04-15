# Atelier 2M — Kanban de suivi de projets

Application de suivi de projets pour M1 Dessin d'Architecture.

## Déploiement sur Render.com

1. Créer un compte sur render.com
2. New → Web Service → connecter ce repo GitHub
3. Build Command : `npm install`
4. Start Command : `npm start`
5. Plan : Free (ou Starter à 7$/mois pour persistance des données)

## API

- `GET /api/data` — récupérer les données
- `POST /api/data` — sauvegarder les données  
- `POST /api/prospect` — créer un prospect depuis le formulaire de contact
- `GET /api/ping` — vérifier que le serveur tourne

## Formulaire prospect

Pour connecter votre formulaire de contact, envoyez un POST vers `/api/prospect` :

```json
{
  "nom": "DUPONT Jean",
  "tel": "06 00 00 00 00",
  "mail": "client@email.com",
  "demande": "Permis de construire",
  "notes": "Maison neuve 120m²"
}
```
