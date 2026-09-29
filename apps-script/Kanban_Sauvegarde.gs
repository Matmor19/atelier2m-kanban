/**
 * Atelier 2M — Sauvegarde du Kanban dans Google Drive  (version 9 : documents + Google Agenda + numérotation + faisabilité par étapes + lecture du règlement PLU par l'IA + fusion PC / téléphone)
 * -----------------------------------------------------------------------------------
 * - Enregistre les dossiers du Kanban dans "kanban-atelier2m-data.json"
 * - Copie de secours quotidienne dans "Kanban Atelier 2M - Sauvegardes" (30 jours)
 * - Range les documents envoyés depuis le Kanban dans
 *   "Kanban Atelier 2M - Clients / <référence> <nom du client>"
 * - Place les dates importantes des dossiers dans l'agenda Google "Atelier 2M — Dossiers"
 * - Attribue les numéros de propositions (A2M-AAAA-P001…) et de factures (A2M-AAAA-F001…)
 * - Étude de faisabilité : interroge les services publics (cadastre, PLU, risques) pour le Kanban
 * - Annexe PLU : fait lire le règlement (PDF) par l'IA Gemini de Google. La clé Gemini est rangée dans
 *   les « Propriétés du script » sous le nom GEMINI_CLE (jamais écrite dans ce code).
 */

var FICHIER = 'kanban-atelier2m-data.json';
var DOSSIER_SAUVEGARDES = 'Kanban Atelier 2M - Sauvegardes';
var DOSSIER_CLIENTS = 'Kanban Atelier 2M - Clients';
var NB_SAUVEGARDES = 30;
var AGENDA = 'Atelier 2M — Dossiers';

// Le Kanban lit les dossiers
function doGet() {
  return reponse_(lireFichier_().getBlob().getDataAsString());
}

// Le Kanban envoie des données (sauvegarde, envoi ou suppression d'un document)
function doPost(e) {
  var data = JSON.parse(e.postData.contents);
  if (data && data.action === 'upload') return envoyerDocument_(data);
  if (data && data.action === 'delete') return supprimerDocument_(data);
  if (data && data.action === 'calsync') return synchroAgenda_(data);
  if (data && data.action === 'numero') return numero_(data);
  if (data && data.action === 'compteurs') return compteurs_();
  if (data && data.action === 'faisabilite') return faisabilite_(data);
  if (data && data.action === 'plu_ia') return pluIA_(data);
  return sauvegarder_(data);
}

// ── NUMÉROTATION (propositions P, factures et avoirs F) ─────
// Un seul endroit attribue les numéros, avec un verrou : deux appareils ne peuvent jamais
// obtenir le même numéro. Le compteur repart à 001 chaque 1er janvier (heure de Paris).
// "req" est un identifiant de demande envoyé par le Kanban : si la même demande arrive deux fois
// (connexion coupée puis nouvel essai), le même numéro est renvoyé, sans en consommer un nouveau.
var TYPES_NUMEROS = { P: true, F: true };

function numero_(d) {
  var type = String(d.type || '');
  if (!TYPES_NUMEROS[type]) return reponse_(JSON.stringify({ ok: false, erreur: 'Type de numéro inconnu' }));
  var verrou = LockService.getScriptLock();
  verrou.waitLock(20000);
  try {
    var props = PropertiesService.getScriptProperties();
    var cleDemande = d.req ? 'req_' + String(d.req).slice(0, 80) : '';
    if (cleDemande) {
      var deja = props.getProperty(cleDemande);
      if (deja) return reponse_(deja);
    }
    var annee = Utilities.formatDate(new Date(), 'Europe/Paris', 'yyyy');
    var cle = 'cpt_' + type + '_' + annee;
    var n = (parseInt(props.getProperty(cle), 10) || 0) + 1;
    props.setProperty(cle, String(n));
    var num = 'A2M-' + annee + '-' + type + ('00' + n).slice(-3);
    var date = Utilities.formatDate(new Date(), 'Europe/Paris', 'yyyy-MM-dd');
    var res = JSON.stringify({ ok: true, numero: num, annee: annee, n: n, date: date });
    if (cleDemande) props.setProperty(cleDemande, res);
    journalNumeros_(date + ' ' + num + ' ' + (d.info || ''));
    return reponse_(res);
  } finally {
    verrou.releaseLock();
  }
}

// Prochains numéros de l'année en cours (affichés dans les Paramètres du Kanban)
function compteurs_() {
  var props = PropertiesService.getScriptProperties();
  var annee = Utilities.formatDate(new Date(), 'Europe/Paris', 'yyyy');
  var r = { ok: true, annee: annee };
  Object.keys(TYPES_NUMEROS).forEach(function (t) {
    var n = (parseInt(props.getProperty('cpt_' + t + '_' + annee), 10) || 0) + 1;
    r[t] = 'A2M-' + annee + '-' + t + ('00' + n).slice(-3);
  });
  return reponse_(JSON.stringify(r));
}

// Trace de chaque numéro attribué, dans le dossier des sauvegardes (lecture seule pour vous)
function journalNumeros_(ligne) {
  var dossier = dossier_(DriveApp.getRootFolder(), DOSSIER_SAUVEGARDES);
  var it = dossier.getFilesByName('journal-des-numeros.txt');
  var f = it.hasNext() ? it.next() : dossier.createFile('journal-des-numeros.txt', '', 'text/plain');
  f.setContent(f.getBlob().getDataAsString() + ligne + '\n');
}

function sauvegarder_(data) {
  var verrou = LockService.getScriptLock();
  verrou.waitLock(15000);
  try {
    if (!data || !Array.isArray(data.cards)) {
      return reponse_(JSON.stringify({ ok: false, erreur: 'Données invalides' }));
    }
    var fichier = lireFichier_();
    var actuel = JSON.parse(fichier.getBlob().getDataAsString() || '{}');
    // Sécurité : on refuse d'écraser des dossiers existants par une liste vide
    if (data.cards.length === 0 && actuel.cards && actuel.cards.length > 0) {
      return reponse_(JSON.stringify({ ok: false, erreur: 'Refus : envoi vide' }));
    }
    // Fusion dossier par dossier avec la copie du Drive (un appareil en retard n'efface plus le travail de l'autre)
    var res = actuel.cards && actuel.cards.length ? fusionner_(data, actuel) : data;
    delete res._sync; delete res.dirty;
    res.savedAt = Date.now();
    sauvegardeDuJour_(fichier);
    fichier.setContent(JSON.stringify(res));
    return reponse_(JSON.stringify({ ok: true, dossiers: res.cards.length, fusion: 1, db: res }));
  } finally {
    verrou.releaseLock();
  }
}

// ── SYNCHRONISATION ENTRE APPAREILS (PC, téléphone…) ─────
// Chaque appareil envoie tout le Kanban, avec _sync = { base: {id du dossier: date de modification lors de sa
// dernière synchronisation}, changed: [réglages modifiés sur cet appareil] }.
// - dossier présent des deux côtés : la version la plus récente (upd) l'emporte ; les factures et les propositions
//   numérotées de l'autre version sont toujours conservées (elles ne doivent jamais disparaître) ;
// - dossier absent du Drive mais connu de l'appareil et non modifié depuis : supprimé sur un autre appareil ;
// - dossier absent de l'appareil mais connu et non modifié depuis sur le Drive : supprimé sur cet appareil ;
// - dans le doute, le dossier est gardé.
// Réglages (paramètres, bibliothèques…) : ceux de l'appareil s'il les a modifiés, sinon ceux du Drive.
// Registre des factures : réunion des deux.
function fusionner_(inc, srv) {
  var s = inc._sync || {}, base = s.base || {}, chg = s.changed, res = { cards: [], archived: [] };
  var pool = function (db) {
    var m = {}, ordre = [];
    ['cards', 'archived'].forEach(function (loc) {
      (db[loc] || []).forEach(function (c) { if (c && c.id !== undefined && !m[c.id]) { m[c.id] = { c: c, loc: loc }; ordre.push(c.id); } });
    });
    return { m: m, ordre: ordre };
  };
  var L = pool(inc), R = pool(srv);
  var ids = L.ordre.concat(R.ordre.filter(function (id) { return !L.m[id]; }));
  ids.forEach(function (id) {
    var l = L.m[id], r = R.m[id], b = base[id], g = null;
    if (l && r) { g = (l.c.upd || 0) >= (r.c.upd || 0) ? l : r; garderPieces_(g.c, (g === l ? r : l).c); }
    else if (l) g = b !== undefined && (l.c.upd || 0) <= b ? null : l;
    else g = b !== undefined && (r.c.upd || 0) <= b ? null : r;
    if (g) res[g.loc].push(g.c);
  });
  Object.keys(srv).concat(Object.keys(inc)).forEach(function (k) {
    if (k in res || k === '_sync' || k === 'savedAt' || k === 'dirty') return;
    if (k === 'registre') { res[k] = fusionRegistre_(inc[k], srv[k]); return; }
    var local = (k in inc) && (!chg || chg.indexOf(k) >= 0 || !(k in srv));
    res[k] = local ? inc[k] : srv[k];
  });
  return res;
}

// Factures (par id) et propositions numérotées (par numéro) de la version écartée ajoutées à la version gardée
function garderPieces_(g, p) {
  (p.contrats || []).forEach(function (kp) {
    var kg = (g.contrats || []).filter(function (x) { return x.id === kp.id; })[0];
    var utile = (kp.factures || []).length || (kp.versions || []).some(function (v) { return v.num && !v.echec; });
    if (!kg) { if (utile) { g.contrats = g.contrats || []; g.contrats.push(kp); } return; }
    [['factures', 'id'], ['versions', 'num']].forEach(function (x) {
      var liste = x[0], cle = x[1];
      (kp[liste] || []).forEach(function (e) {
        if (!e || e[cle] === undefined || (liste === 'versions' && e.echec)) return;
        kg[liste] = kg[liste] || [];
        if (!kg[liste].some(function (y) { return y && y[cle] === e[cle]; })) kg[liste].push(e);
      });
    });
  });
}

function fusionRegistre_(a, b) {
  a = a || []; b = b || [];
  var cle = function (x) { return x && (x.fid !== undefined ? 'f' + x.fid : 'n' + x.num); }, vu = {};
  a.forEach(function (x) { vu[cle(x)] = 1; });
  return b.filter(function (x) { return !vu[cle(x)]; }).concat(a);
}

// Range un document dans le dossier Drive du client
function envoyerDocument_(d) {
  if (!d.base64 || !d.name) return reponse_(JSON.stringify({ ok: false, erreur: 'Fichier manquant' }));
  var racine = dossier_(DriveApp.getRootFolder(), DOSSIER_CLIENTS);
  var nomDossier = ((d.ref || '') + ' ' + (d.nom || 'Client')).trim().replace(/[\/\\]/g, '-');
  var dossierClient = dossier_(racine, nomDossier);
  var blob = Utilities.newBlob(Utilities.base64Decode(d.base64), d.mimeType || 'application/octet-stream', d.name);
  var f = dossierClient.createFile(blob);
  return reponse_(JSON.stringify({
    ok: true, id: f.getId(), name: f.getName(), url: f.getUrl(),
    size: f.getSize(), folderUrl: dossierClient.getUrl()
  }));
}

// Met le document à la corbeille Drive (récupérable pendant 30 jours)
function supprimerDocument_(d) {
  try { DriveApp.getFileById(d.id).setTrashed(true); }
  catch (err) { return reponse_(JSON.stringify({ ok: false, erreur: String(err) })); }
  return reponse_(JSON.stringify({ ok: true }));
}

// ── GOOGLE AGENDA ───────────────────────────────────────────
// Reçoit la liste complète des dates d'un dossier et met l'agenda à jour :
// crée les nouvelles dates, modifie celles qui ont changé, supprime celles qui n'existent plus.
function synchroAgenda_(d) {
  var verrou = LockService.getScriptLock();
  verrou.waitLock(20000);
  try {
    var cal = agenda_();
    var debut = new Date(); debut.setFullYear(debut.getFullYear() - 2);
    var fin = new Date(); fin.setFullYear(fin.getFullYear() + 5);
    var existants = {};
    cal.getEvents(debut, fin).forEach(function (ev) {
      if (ev.getTag('a2m_card') === String(d.cardId)) existants[ev.getTag('a2m_key')] = ev;
    });
    var voulus = {};
    (d.events || []).forEach(function (e) {
      voulus[e.key] = true;
      var p = e.date.split('-');
      var jour = new Date(+p[0], +p[1] - 1, +p[2]);
      var ev = existants[e.key];
      if (ev) {
        if (ev.getTitle() !== e.title) ev.setTitle(e.title);
        if (ev.getDescription() !== (e.desc || '')) ev.setDescription(e.desc || '');
        var actuel = ev.getAllDayStartDate();
        if (!actuel || actuel.getTime() !== jour.getTime()) ev.setAllDayDate(jour);
      } else {
        ev = cal.createAllDayEvent(e.title, jour, { description: e.desc || '' });
        ev.setTag('a2m_card', String(d.cardId));
        ev.setTag('a2m_key', e.key);
      }
    });
    Object.keys(existants).forEach(function (k) { if (!voulus[k]) existants[k].deleteEvent(); });
    return reponse_(JSON.stringify({ ok: true, n: (d.events || []).length }));
  } finally {
    verrou.releaseLock();
  }
}

function agenda_() {
  var l = CalendarApp.getCalendarsByName(AGENDA);
  if (l.length) return l[0];
  var cal = CalendarApp.createCalendar(AGENDA, { color: CalendarApp.Color.ORANGE });
  return cal;
}

function dossier_(parent, nom) {
  var it = parent.getFoldersByName(nom);
  return it.hasNext() ? it.next() : parent.createFolder(nom);
}

function lireFichier_() {
  var it = DriveApp.getFilesByName(FICHIER);
  if (it.hasNext()) return it.next();
  return DriveApp.createFile(FICHIER, '{"cards":[],"archived":[]}', 'application/json');
}

function sauvegardeDuJour_(fichier) {
  var dossier = dossier_(DriveApp.getRootFolder(), DOSSIER_SAUVEGARDES);
  var nom = 'kanban-' + Utilities.formatDate(new Date(), 'Europe/Paris', 'yyyy-MM-dd') + '.json';
  if (dossier.getFilesByName(nom).hasNext()) return;
  if (fichier.getSize() > 30) dossier.createFile(nom, fichier.getBlob().getDataAsString(), 'application/json');
  var liste = [], f = dossier.getFiles();
  while (f.hasNext()) { var x = f.next(); if (/^kanban-/.test(x.getName())) liste.push(x); }
  liste.sort(function (a, b) { return b.getName() < a.getName() ? -1 : 1; });
  liste.slice(NB_SAUVEGARDES).forEach(function (x) { x.setTrashed(true); });
}

// ── ÉTUDE DE FAISABILITÉ (données publiques, sans clé) ─────
// Appelée par le Kanban (les navigateurs ne peuvent pas interroger ces services directement).
// 1. commune → code INSEE (api-adresse.data.gouv.fr)  2. parcelles (apicarto.ign.fr, cadastre)
// 3. zone PLU et document d'urbanisme (apicarto.ign.fr, Géoportail de l'Urbanisme)
// 4. risques (georisques.gouv.fr). Chaque étape en échec est signalée sans bloquer les suivantes.
var APICARTO = 'https://apicarto.ign.fr/api/';
var GEORISQUES = 'https://georisques.gouv.fr/api/v1/';

// Le Kanban appelle les 4 étapes une par une (d.etape) pour afficher l'avancement ; l'état intermédiaire
// (d.etat : code INSEE, parcelles, géométries…) lui est renvoyé à chaque étape puis retransmis à la suivante.
// Sans d.etape, les 4 étapes s'enchaînent en un seul appel.
var FAISA_ETAPES = ['commune', 'parcelles', 'urbanisme', 'risques'];
function faisabilite_(d) {
  var r = d.etat || { ok: true, avert: [], date: new Date().toISOString(), parcelles: [], zones: [], risques: [] };
  var liste = d.etape ? [d.etape] : FAISA_ETAPES;
  try {
    for (var i = 0; i < liste.length; i++) {
      var f = { commune: faisaCommune_, parcelles: faisaParcelles_, urbanisme: faisaUrbanisme_, risques: faisaRisques_ }[liste[i]];
      if (!f) return reponse_(JSON.stringify({ ok: false, erreur: 'Étape inconnue : ' + liste[i] }));
      var err = f(d, r);
      if (err) { err.ok = false; err.avert = r.avert; return reponse_(JSON.stringify(err)); }
    }
    if (d.etape) r.etape = d.etape; else delete r.geoms;
    return reponse_(JSON.stringify(r));
  } catch (e) {
    return reponse_(JSON.stringify({ ok: false, erreur: 'Service indisponible : ' + e.message }));
  }
}

// 1. Code INSEE de la commune
function faisaCommune_(d, r) {
  if (!(d.refs || []).length) return { erreur: 'Aucune référence cadastrale (section + numéro).' };
  r.insee = d.insee || '';
  r.commune = d.commune || '';
  if (r.insee) return null;
  var a = json_('https://api-adresse.data.gouv.fr/search/?type=municipality&limit=5&q=' + encodeURIComponent(d.commune || '') + (d.cp ? '&postcode=' + d.cp : ''));
  var f0 = a && a.features && a.features[0];
  if (!f0 && d.cp) { a = json_('https://api-adresse.data.gouv.fr/search/?type=municipality&limit=5&q=' + encodeURIComponent(d.commune || '')); f0 = a && a.features && a.features[0]; }
  if (!f0) return { erreur: 'Commune introuvable : « ' + (d.commune || '') + ' ». Vérifiez son orthographe.' };
  r.insee = f0.properties.citycode; r.commune = f0.properties.name;
  return null;
}

// 2. Parcelles (cadastre) et point de référence
function faisaParcelles_(d, r) {
  var refs = (d.refs || []).slice(0, 12), geoms = [];
  r.parcelles = [];
  refs.forEach(function (x) {
    var sec = String(x.section || '').toUpperCase(), num = ('0000' + String(x.numero || '').replace(/\D/g, '')).slice(-4);
    var essais = sec.length === 1 ? ['0' + sec, sec] : [sec], f = null;
    for (var i = 0; i < essais.length && !f; i++) {
      var p = json_(APICARTO + 'cadastre/parcelle?code_insee=' + r.insee + '&section=' + essais[i] + '&numero=' + num);
      f = p && p.features && p.features[0];
    }
    if (!f) { r.parcelles.push({ ref: sec + ' ' + x.numero, trouvee: false }); return; }
    r.parcelles.push({ ref: sec + ' ' + x.numero, trouvee: true, idu: f.properties.idu, contenance: f.properties.contenance || 0 });
    geoms.push(f.geometry);
  });
  r.surface = r.parcelles.reduce(function (t, p) { return t + (p.contenance || 0); }, 0);
  // Point de référence : centre de la première parcelle, sinon adresse du chantier
  var pt = geoms.length ? centre_(geoms[0]) : null;
  if (!pt && d.adresse) {
    try {
      var g = json_('https://api-adresse.data.gouv.fr/search/?limit=1&q=' + encodeURIComponent(d.adresse) + '&citycode=' + r.insee);
      var gf = g && g.features && g.features[0];
      if (gf) { pt = gf.geometry.coordinates; r.depuisAdresse = gf.properties.label; }
    } catch (e) { r.avert.push('Adresse non géolocalisée : ' + e.message); }
  }
  if (!pt) return { erreur: 'Parcelle introuvable au cadastre (' + refs.map(function (x) { return x.section + ' ' + x.numero; }).join(', ') + ', commune ' + r.commune + ' — INSEE ' + r.insee + '). Vérifiez la section et le numéro ; pour une commune nouvelle, les parcelles peuvent dépendre de l\'ancienne commune.', parcelles: r.parcelles };
  r.lon = Math.round(pt[0] * 1e6) / 1e6; r.lat = Math.round(pt[1] * 1e6) / 1e6;
  r.geoms = geoms.length ? geoms : [{ type: 'Point', coordinates: pt }];
  return null;
}

// 3. Urbanisme : zone(s) du PLU, document, sinon carte communale ou RNU
function faisaUrbanisme_(d, r) {
  var formes = r.geoms && r.geoms.length ? r.geoms : [{ type: 'Point', coordinates: [r.lon, r.lat] }];
  r.zones = [];
  try {
    var vus = {};
    formes.forEach(function (g) {
      var z = json_(APICARTO + 'gpu/zone-urba', { geom: g });
      (z.features || []).forEach(function (f) {
        var q = f.properties, cle = q.libelle + '|' + q.idurba;
        if (vus[cle]) return; vus[cle] = 1;
        r.zones.push({ code: q.libelle || '', libelle: q.libelong || '', type: q.typezone || '', idurba: q.idurba || '',
          reglement: q.urlfic || (q.nomfic && q.partition && q.gpu_doc_id ? 'https://data.geopf.fr/annexes/gpu/documents/' + q.partition + '/' + q.gpu_doc_id + '/' + q.nomfic : ''),
          doc: q.gpu_doc_id ? 'https://www.geoportail-urbanisme.gouv.fr/document/by-id/' + q.gpu_doc_id : '', validation: q.datvalid || '' });
      });
    });
    var doc = json_(APICARTO + 'gpu/document', { geom: formes[0] });
    var df = doc && doc.features && doc.features[0];
    if (df) r.document = { type: df.properties.du_type || '', nom: df.properties.grid_title || '', id: df.properties.name || '' };
    if (!r.zones.length) {
      var cc = json_(APICARTO + 'gpu/secteur-cc', { geom: formes[0] });
      (cc.features || []).forEach(function (f) { r.zones.push({ code: f.properties.libelle || '', libelle: f.properties.libelong || 'Carte communale', type: f.properties.typesect || '', reglement: '' }); });
    }
    if (!r.zones.length) {
      var m = json_(APICARTO + 'gpu/municipality?insee=' + r.insee);
      var mf = m && m.features && m.features[0];
      if (mf && mf.properties.is_rnu) r.rnu = true;
      else r.avert.push('Aucune zone d\'urbanisme trouvée : le document d\'urbanisme de la commune n\'est peut-être pas publié sur le Géoportail de l\'Urbanisme.');
    }
  } catch (e) { r.avert.push('Géoportail de l\'Urbanisme indisponible : ' + e.message); }
  return null;
}

// 4. Risques (Géorisques) : toutes les requêtes partent en même temps (fetchAll), pour ne pas cumuler les attentes
function faisaRisques_(d, r) {
  var ll = r.lon + ',' + r.lat;
  r.risques = [];
  var urls = [GEORISQUES + 'resultats_rapport_risque?latlon=' + ll, GEORISQUES + 'gaspar/risques?latlon=' + ll,
    GEORISQUES + 'zonage_sismique?latlon=' + ll, GEORISQUES + 'radon?code_insee=' + r.insee, GEORISQUES + 'rga?latlon=' + ll];
  var rep;
  try {
    rep = UrlFetchApp.fetchAll(urls.map(function (u) { return { url: u, muteHttpExceptions: true, headers: { Accept: 'application/json' } }; }));
  } catch (e) { r.avert.push('Géorisques n\'a pas répondu : risques non disponibles pour le moment (' + e.message + ').'); return null; }
  var lire = function (i) { try { return rep[i].getResponseCode() < 400 ? JSON.parse(rep[i].getContentText() || '{}') : null; } catch (e) { return null; } };
  var rap = lire(0), gs = lire(1), sz = lire(2), rd = lire(3), rg = lire(4);
  if (rap) {
    ['risquesNaturels', 'risquesTechnologiques'].forEach(function (k) {
      var o = rap[k];
      if (o) Object.keys(o).forEach(function (n) { var x = o[n]; if (x && x.present) r.risques.push(x.libelle || n); });
    });
    if (rap.url) r.georisquesUrl = rap.url;
  } else if (gs) {
    ((gs.data && gs.data[0] && gs.data[0].risques_detail) || []).forEach(function (x) { if (r.risques.indexOf(x.libelle_risque_long) < 0) r.risques.push(x.libelle_risque_long); });
  } else r.avert.push('Géorisques indisponible : risques non disponibles pour le moment.');
  var s0 = sz && sz.data && sz.data[0]; if (s0) r.sismicite = s0.zone_sismicite || s0.code_zone || '';
  var r0 = rd && rd.data && rd.data[0]; if (r0) r.radon = String(r0.classe_potentiel || '');
  var g0 = rg && ((rg.data && rg.data[0]) || rg); if (g0 && g0.exposition) r.argile = g0.exposition;
  return null;
}

// ── ANNEXE PLU : LECTURE DU RÈGLEMENT PAR L'IA (Gemini, Google AI Studio) ─────
// Deux étapes appelées l'une après l'autre par le Kanban (pour afficher l'avancement) :
// 1. d.etape = 'pdf'     : télécharge le règlement (d.url) et le dépose chez Gemini (fichier gardé 48 h par Google)
// 2. d.etape = 'analyse' : demande à Gemini les 3 textes de l'annexe (dispositions générales, points à vérifier, synthèse)
// Clé : Paramètres du projet → Propriétés du script → GEMINI_CLE. Modèle : GEMINI_MODELE (facultatif).
var GEMINI = 'https://generativelanguage.googleapis.com/';
var GEMINI_MODELES = ['gemini-flash-latest', 'gemini-2.5-flash'];

function pluIA_(d) {
  try {
    var cle = PropertiesService.getScriptProperties().getProperty('GEMINI_CLE');
    if (!cle) return reponse_(JSON.stringify({ ok: false, code: 'cle', erreur: 'Clé Gemini non renseignée dans le script Google (Paramètres du projet → Propriétés du script → GEMINI_CLE).' }));
    if (d.etape === 'pdf') return reponse_(JSON.stringify(pluIAPdf_(d, cle)));
    if (d.etape === 'analyse') return reponse_(JSON.stringify(pluIAAnalyse_(d, cle)));
    return reponse_(JSON.stringify({ ok: false, erreur: 'Étape inconnue.' }));
  } catch (e) {
    var m = String(e && e.message || e);
    return reponse_(JSON.stringify({ ok: false, erreur: /timeout|délai|timed out/i.test(m) ? 'L\'IA a mis trop de temps à répondre (règlement très volumineux ?). Réessayez dans quelques minutes.' : 'Erreur réseau : ' + m }));
  }
}

// 1. Téléchargement du règlement et dépôt chez Gemini
function pluIAPdf_(d, cle) {
  var url = String(d.url || '');
  if (!/^https:\/\//i.test(url)) return { ok: false, erreur: 'Lien du règlement invalide.' };
  var cache = CacheService.getScriptCache(), ck = 'gemf_' + Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, url));
  var deja = cache.get(ck);
  if (deja) return { ok: true, fichier: JSON.parse(deja) };
  var rep = UrlFetchApp.fetch(url, { muteHttpExceptions: true, followRedirects: true });
  if (rep.getResponseCode() >= 400) return { ok: false, erreur: 'Téléchargement du règlement impossible (erreur ' + rep.getResponseCode() + '). Le lien n\'est peut-être plus valable : actualisez l\'étude de faisabilité.' };
  var octets = rep.getContent();
  if (octets.length < 5 || String.fromCharCode(octets[0], octets[1], octets[2], octets[3]) !== '%PDF') return { ok: false, erreur: 'Le lien du règlement ne mène pas à un fichier PDF lisible.' };
  if (octets.length > 48 * 1024 * 1024) return { ok: false, erreur: 'Règlement trop volumineux (plus de 48 Mo) pour être lu automatiquement.' };
  // Dépôt en deux temps (protocole « resumable » de Google)
  var dep = UrlFetchApp.fetch(GEMINI + 'upload/v1beta/files', { method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { 'x-goog-api-key': cle, 'X-Goog-Upload-Protocol': 'resumable', 'X-Goog-Upload-Command': 'start',
      'X-Goog-Upload-Header-Content-Length': String(octets.length), 'X-Goog-Upload-Header-Content-Type': 'application/pdf' },
    payload: JSON.stringify({ file: { display_name: 'reglement-plu.pdf' } }) });
  var err = geminiErreur_(dep);
  if (err) return err;
  var h = dep.getAllHeaders(), adr = '';
  Object.keys(h).forEach(function (k) { if (k.toLowerCase() === 'x-goog-upload-url') adr = h[k]; });
  if (!adr) return { ok: false, erreur: 'Gemini n\'a pas accepté le dépôt du règlement.' };
  var env = UrlFetchApp.fetch(adr, { method: 'post', contentType: 'application/pdf', muteHttpExceptions: true,
    headers: { 'X-Goog-Upload-Offset': '0', 'X-Goog-Upload-Command': 'upload, finalize' }, payload: octets });
  err = geminiErreur_(env);
  if (err) return err;
  var f = JSON.parse(env.getContentText()).file || {};
  // Google prépare le fichier quelques secondes (état PROCESSING) avant de pouvoir le lire
  for (var i = 0; i < 20 && f.state === 'PROCESSING'; i++) {
    Utilities.sleep(2000);
    f = JSON.parse(UrlFetchApp.fetch(GEMINI + 'v1beta/' + f.name, { headers: { 'x-goog-api-key': cle }, muteHttpExceptions: true }).getContentText() || '{}');
  }
  if (f.state === 'FAILED' || !f.uri) return { ok: false, erreur: 'Le règlement PDF est illisible pour l\'IA (fichier scanné ou protégé ?).' };
  var res = { uri: f.uri, mime: f.mimeType || 'application/pdf', taille: octets.length };
  cache.put(ck, JSON.stringify(res), 6 * 3600);
  return { ok: true, fichier: res };
}

// 2. Analyse : consigne + règlement → 3 textes (format de l'annexe : « - » puce, « ! » alerte)
function pluIAAnalyse_(d, cle) {
  var fi = d.fichier || {};
  if (!fi.uri) return { ok: false, erreur: 'Règlement non transmis à l\'IA.' };
  var consigne = [
    'Tu es un assistant pour un bureau de dessin d\'architecture (maisons individuelles). Le document joint est le règlement écrit du ' + (d.document || 'document d\'urbanisme') + ' de la commune de ' + (d.commune || '?') + '.',
    'Le terrain du projet est situé en zone ' + (d.zones || '?') + '.' + (d.projet ? ' Projet : ' + d.projet + '.' : ''),
    'En t\'appuyant UNIQUEMENT sur le texte du règlement joint (n\'invente rien ; si une règle n\'y figure pas, écris « non précisé dans le règlement »), rédige en français :',
    '1. "dispositions" : un résumé des dispositions générales applicables à toutes les zones (champ d\'application, adaptations mineures, reconstruction, divisions, risques, réseaux…).',
    '2. "points" : les points de vigilance à vérifier pour un projet de construction dans la zone ' + (d.zones || '') + ' : destinations autorisées ou interdites, implantation et reculs par rapport aux voies et aux limites séparatives, emprise au sol, hauteur maximale, aspect extérieur (toitures, façades, clôtures, couleurs), espaces verts et pleine terre, stationnement, accès et réseaux. Donne les valeurs chiffrées et le numéro d\'article quand ils existent.',
    '3. "synthese" : une courte synthèse (3 à 5 phrases) des contraintes principales pour ce projet.',
    'Mise en forme de chaque texte : une idée par ligne ; une ligne commençant par « - » est une puce ; une ligne commençant par « ! » signale un point d\'alerte important. Pas de markdown (pas d\'astérisques, pas de titres).'
  ].join('\n');
  var corps = { contents: [{ role: 'user', parts: [{ file_data: { mime_type: fi.mime || 'application/pdf', file_uri: fi.uri } }, { text: consigne }] }],
    generationConfig: { temperature: 0.2, responseMimeType: 'application/json',
      responseSchema: { type: 'OBJECT', properties: { dispositions: { type: 'STRING' }, points: { type: 'STRING' }, synthese: { type: 'STRING' } }, required: ['dispositions', 'points', 'synthese'] } } };
  var prop = PropertiesService.getScriptProperties().getProperty('GEMINI_MODELE');
  var modeles = (prop ? [prop] : []).concat(GEMINI_MODELES), rep = null, err = null;
  for (var i = 0; i < modeles.length; i++) {
    rep = UrlFetchApp.fetch(GEMINI + 'v1beta/models/' + modeles[i] + ':generateContent', { method: 'post', contentType: 'application/json',
      muteHttpExceptions: true, headers: { 'x-goog-api-key': cle }, payload: JSON.stringify(corps) });
    err = geminiErreur_(rep);
    if (!err || rep.getResponseCode() !== 404) break; // 404 = modèle retiré par Google : on essaie le suivant
  }
  if (err) return err;
  var j = JSON.parse(rep.getContentText() || '{}'), cand = j.candidates && j.candidates[0];
  if (!cand) return { ok: false, erreur: 'L\'IA n\'a pas répondu' + (j.promptFeedback && j.promptFeedback.blockReason ? ' (demande refusée : ' + j.promptFeedback.blockReason + ')' : '') + '.' };
  var texte = ((cand.content && cand.content.parts) || []).filter(function (p) { return p.text && !p.thought; }).map(function (p) { return p.text; }).join('');
  var r;
  try { r = JSON.parse(texte); } catch (e) { return { ok: false, erreur: 'Réponse de l\'IA incomplète' + (cand.finishReason === 'MAX_TOKENS' ? ' (texte trop long)' : '') + '. Réessayez.' }; }
  return { ok: true, dispositions: String(r.dispositions || ''), points: String(r.points || ''), synthese: String(r.synthese || ''), modele: j.modelVersion || modeles[i] || '' };
}

// Message clair selon l'erreur renvoyée par Gemini (null si tout va bien)
function geminiErreur_(rep) {
  var code = rep.getResponseCode();
  if (code < 400) return null;
  var m = '';
  try { m = (JSON.parse(rep.getContentText()).error || {}).message || ''; } catch (e) {}
  if (code === 429) return { ok: false, code: 'quota', erreur: 'Quota de l\'IA Gemini dépassé (trop de demandes pour aujourd\'hui ou cette minute). Réessayez plus tard.' };
  if (code === 400 && /api key|API_KEY/i.test(m) || code === 401 || code === 403) return { ok: false, code: 'cle', erreur: 'Clé Gemini refusée : vérifiez la propriété GEMINI_CLE du script Google.' + (m ? ' (' + m + ')' : '') };
  if (code === 400) return { ok: false, erreur: 'L\'IA n\'a pas pu lire ce règlement' + (m ? ' (' + m + ')' : '') + '.' };
  if (code === 404) return { ok: false, erreur: 'Modèle Gemini introuvable' + (m ? ' (' + m + ')' : '') + '.' };
  return { ok: false, erreur: 'Service Gemini indisponible (erreur ' + code + ')' + (m ? ' : ' + m : '') + '. Réessayez dans quelques minutes.' };
}

// Lecture d'un service public (GET, ou POST JSON si « corps » est fourni)
function json_(url, corps) {
  var o = { muteHttpExceptions: true, followRedirects: true, headers: { Accept: 'application/json' } };
  if (corps) { o.method = 'post'; o.contentType = 'application/json'; o.payload = JSON.stringify(corps); }
  var rep = UrlFetchApp.fetch(url, o), code = rep.getResponseCode();
  if (code >= 400) throw new Error('HTTP ' + code + ' (' + url.split('?')[0] + ')');
  return JSON.parse(rep.getContentText() || '{}');
}

// Centre approximatif d'une géométrie GeoJSON (moyenne des sommets du premier contour)
function centre_(g) {
  var c = g.coordinates;
  while (c && c.length && typeof c[0][0] !== 'number') c = c[0];
  if (!c || !c.length) return null;
  var x = 0, y = 0;
  c.forEach(function (p) { x += p[0]; y += p[1]; });
  return [x / c.length, y / c.length];
}

function reponse_(texte) {
  return ContentService.createTextOutput(texte).setMimeType(ContentService.MimeType.JSON);
}

// À lancer une fois à la main (bouton Exécuter) pour vérifier les autorisations
function initialiser() {
  Logger.log('Fichier prêt : ' + lireFichier_().getName());
  Logger.log('Dossier clients prêt : ' + dossier_(DriveApp.getRootFolder(), DOSSIER_CLIENTS).getName());
  Logger.log('Agenda prêt : ' + agenda_().getName());
  // Autorise les appels aux services publics (étude de faisabilité)
  Logger.log('Accès aux services publics : ' + UrlFetchApp.fetch(APICARTO + 'gpu/municipality?insee=19031', { muteHttpExceptions: true }).getResponseCode());
  // Clé de l'IA Gemini (annexe PLU) : vérifie qu'elle est renseignée et acceptée par Google
  var cle = PropertiesService.getScriptProperties().getProperty('GEMINI_CLE');
  if (!cle) Logger.log('Clé Gemini : NON renseignée (Paramètres du projet → Propriétés du script → GEMINI_CLE)');
  else Logger.log('Clé Gemini : ' + (UrlFetchApp.fetch(GEMINI + 'v1beta/models', { headers: { 'x-goog-api-key': cle }, muteHttpExceptions: true }).getResponseCode() === 200 ? 'acceptée ✓' : 'REFUSÉE par Google'));
}
