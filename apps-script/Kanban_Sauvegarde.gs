/**
 * Atelier 2M — Sauvegarde du Kanban dans Google Drive  (version 5 : documents + Google Agenda + numérotation + faisabilité)
 * -----------------------------------------------------------------------------------
 * - Enregistre les dossiers du Kanban dans "kanban-atelier2m-data.json"
 * - Copie de secours quotidienne dans "Kanban Atelier 2M - Sauvegardes" (30 jours)
 * - Range les documents envoyés depuis le Kanban dans
 *   "Kanban Atelier 2M - Clients / <référence> <nom du client>"
 * - Place les dates importantes des dossiers dans l'agenda Google "Atelier 2M — Dossiers"
 * - Attribue les numéros de propositions (A2M-AAAA-P001…) et de factures (A2M-AAAA-F001…)
 * - Étude de faisabilité : interroge les services publics (cadastre, PLU, risques) pour le Kanban
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
    sauvegardeDuJour_(fichier);
    fichier.setContent(JSON.stringify(data));
    return reponse_(JSON.stringify({ ok: true, dossiers: data.cards.length }));
  } finally {
    verrou.releaseLock();
  }
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

function faisabilite_(d) {
  var r = { ok: true, avert: [], date: new Date().toISOString(), parcelles: [], zones: [], risques: [] };
  try {
    var refs = (d.refs || []).slice(0, 12);
    if (!refs.length) return reponse_(JSON.stringify({ ok: false, erreur: 'Aucune référence cadastrale (section + numéro).' }));

    // 1. Code INSEE de la commune
    r.insee = d.insee || '';
    r.commune = d.commune || '';
    if (!r.insee) {
      var a = json_('https://api-adresse.data.gouv.fr/search/?type=municipality&limit=5&q=' + encodeURIComponent(d.commune || '') + (d.cp ? '&postcode=' + d.cp : ''));
      var f0 = a && a.features && a.features[0];
      if (!f0 && d.cp) { a = json_('https://api-adresse.data.gouv.fr/search/?type=municipality&limit=5&q=' + encodeURIComponent(d.commune || '')); f0 = a && a.features && a.features[0]; }
      if (!f0) return reponse_(JSON.stringify({ ok: false, erreur: 'Commune introuvable : « ' + (d.commune || '') + ' ». Vérifiez son orthographe.' }));
      r.insee = f0.properties.citycode; r.commune = f0.properties.name;
    }

    // 2. Parcelles
    var geoms = [];
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
    if (!pt) return reponse_(JSON.stringify({ ok: false, erreur: 'Parcelle introuvable au cadastre (' + refs.map(function (x) { return x.section + ' ' + x.numero; }).join(', ') + ', commune ' + r.commune + ' — INSEE ' + r.insee + '). Vérifiez la section et le numéro ; pour une commune nouvelle, les parcelles peuvent dépendre de l\'ancienne commune.', parcelles: r.parcelles, avert: r.avert }));
    r.lon = Math.round(pt[0] * 1e6) / 1e6; r.lat = Math.round(pt[1] * 1e6) / 1e6;
    var formes = geoms.length ? geoms : [{ type: 'Point', coordinates: pt }];

    // 3. Urbanisme : zone(s) du PLU, document, sinon carte communale ou RNU
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

    // 4. Risques (Géorisques)
    var ll = r.lon + ',' + r.lat;
    try {
      var rap = json_(GEORISQUES + 'resultats_rapport_risque?latlon=' + ll);
      ['risquesNaturels', 'risquesTechnologiques'].forEach(function (k) {
        var o = rap && rap[k];
        if (o) Object.keys(o).forEach(function (n) { var x = o[n]; if (x && x.present) r.risques.push(x.libelle || n); });
      });
      if (rap && rap.url) r.georisquesUrl = rap.url;
    } catch (e) {
      try {
        var gs = json_(GEORISQUES + 'gaspar/risques?latlon=' + ll);
        ((gs.data && gs.data[0] && gs.data[0].risques_detail) || []).forEach(function (x) { if (r.risques.indexOf(x.libelle_risque_long) < 0) r.risques.push(x.libelle_risque_long); });
      } catch (e2) { r.avert.push('Géorisques indisponible : ' + e2.message); }
    }
    try { var sz = json_(GEORISQUES + 'zonage_sismique?latlon=' + ll); var s0 = sz.data && sz.data[0]; if (s0) r.sismicite = s0.zone_sismicite || s0.code_zone || ''; } catch (e) {}
    try { var rd = json_(GEORISQUES + 'radon?code_insee=' + r.insee); var r0 = rd.data && rd.data[0]; if (r0) r.radon = String(r0.classe_potentiel || ''); } catch (e) {}
    try { var rg = json_(GEORISQUES + 'rga?latlon=' + ll); var g0 = (rg && rg.data && rg.data[0]) || rg; if (g0 && g0.exposition) r.argile = g0.exposition; } catch (e) {}
    return reponse_(JSON.stringify(r));
  } catch (e) {
    return reponse_(JSON.stringify({ ok: false, erreur: 'Service indisponible : ' + e.message }));
  }
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
}
