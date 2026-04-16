const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, 'data.json');

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Charger / initialiser la base de données JSON
function loadDB() {
  try {
    if (fs.existsSync(DB_FILE)) {
      return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    }
  } catch(e) {}
  return { cards: [], archived: [], nextId: 100 };
}

function saveDB(db) {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

// ── ROUTES API ────────────────────────────────────────────────────────────────

// GET /api/data — récupérer toutes les données
app.get('/api/data', (req, res) => {
  const db = loadDB();
  res.json(db);
});

// POST /api/data — sauvegarder toutes les données
app.post('/api/data', (req, res) => {
  try {
    const data = req.body;
    if (!data || !Array.isArray(data.cards)) {
      return res.status(400).json({ error: 'Données invalides' });
    }
    saveDB(data);
    res.json({ ok: true });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/prospect — reçoit un nouveau prospect depuis le formulaire
app.post('/api/prospect', (req, res) => {
  try {
    const { nom, tel, mail, demande, notes } = req.body;
    if (!nom) return res.status(400).json({ error: 'Nom requis' });

    const db = loadDB();
    const id = db.nextId || 100;
    db.nextId = id + 1;

    const d = new Date();
    const ref = String(id).padStart(3, '0') + '-' +
                String(d.getMonth() + 1).padStart(2, '0') + '-' +
                d.getFullYear();

    const newCard = {
      id: id,
      ref: ref,
      nom: nom,
      tel: tel || '',
      mail: mail || '',
      date: d.toISOString().split('T')[0],
      addr: '',
      ms: ['pc'],
      notes: (demande ? 'Demande : ' + demande + '\n' : '') + (notes || ''),
      col: 'prospects',
      cl: { pc: new Array(16).fill(0) },
      prop: false,
      hono: 0,
      due: '',
      upd: Date.now(),
      created: Date.now()
    };

    db.cards.unshift(newCard);
    saveDB(db);

    console.log('Nouveau prospect reçu :', nom, '-', ref);
    res.json({ ok: true, ref: ref, id: id });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// Route de santé
app.get('/api/ping', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

// Toutes les autres routes → index.html (SPA)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log('Atelier 2M Kanban — serveur démarré sur port', PORT);
});
