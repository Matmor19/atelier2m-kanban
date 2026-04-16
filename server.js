const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, 'data.json');

app.use(cors());
app.use(express.json());

// Servir les fichiers statiques depuis publique OU public OU racine
const dirs = ['publique', 'public', '.'];
for (const dir of dirs) {
  const p = path.join(__dirname, dir);
  if (fs.existsSync(p)) {
    app.use(express.static(p));
    console.log('Serving static from:', dir);
    break;
  }
}

function loadDB() {
  try {
    if (fs.existsSync(DB_FILE)) return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } catch(e) {}
  return { cards: [], archived: [], nextId: 100 };
}

function saveDB(db) { fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2)); }

app.get('/api/data', (req, res) => res.json(loadDB()));

app.post('/api/data', (req, res) => {
  try {
    const data = req.body;
    if (!data || !Array.isArray(data.cards)) return res.status(400).json({ error: 'Données invalides' });
    saveDB(data);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/prospect', (req, res) => {
  try {
    const { nom, tel, mail, demande, notes } = req.body;
    if (!nom) return res.status(400).json({ error: 'Nom requis' });
    const db = loadDB();
    const id = db.nextId || 100;
    db.nextId = id + 1;
    const d = new Date();
    const ref = String(id).padStart(3,'0') + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + d.getFullYear();
    db.cards.unshift({ id, ref, nom, tel: tel||'', mail: mail||'', date: d.toISOString().split('T')[0], addr:'', ms:['pc'], notes: (demande?'Demande: '+demande+'\n':'')+(notes||''), col:'prospects', cl:{pc:new Array(16).fill(0)}, prop:false, hono:0, due:'', upd:Date.now(), created:Date.now() });
    saveDB(db);
    res.json({ ok: true, ref, id });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/ping', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

app.get('*', (req, res) => {
  const dirs2 = ['publique', 'public', '.'];
  for (const dir of dirs2) {
    const f = path.join(__dirname, dir, 'index.html');
    if (fs.existsSync(f)) { res.sendFile(f); return; }
  }
  res.status(404).send('Not found');
});

app.listen(PORT, () => console.log('Atelier 2M Kanban — port', PORT));
