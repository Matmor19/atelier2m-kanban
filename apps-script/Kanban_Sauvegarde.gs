/**
 * Atelier 2M — Sauvegarde du Kanban dans Google Drive  (version 4 : documents + Google Agenda + numérotation)
 * -----------------------------------------------------------------------------------
 * - Enregistre les dossiers du Kanban dans "kanban-atelier2m-data.json"
 * - Copie de secours quotidienne dans "Kanban Atelier 2M - Sauvegardes" (30 jours)
 * - Range les documents envoyés depuis le Kanban dans
 *   "Kanban Atelier 2M - Clients / <référence> <nom du client>"
 * - Place les dates importantes des dossiers dans l'agenda Google "Atelier 2M — Dossiers"
 * - Attribue les numéros de propositions (A2M-AAAA-P001…) et de factures (A2M-AAAA-F001…)
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
  while (f.hasNext()) liste.push(f.next());
  liste.sort(function (a, b) { return b.getName() < a.getName() ? -1 : 1; });
  liste.slice(NB_SAUVEGARDES).forEach(function (x) { x.setTrashed(true); });
}

function reponse_(texte) {
  return ContentService.createTextOutput(texte).setMimeType(ContentService.MimeType.JSON);
}

// À lancer une fois à la main (bouton Exécuter) pour vérifier les autorisations
function initialiser() {
  Logger.log('Fichier prêt : ' + lireFichier_().getName());
  Logger.log('Dossier clients prêt : ' + dossier_(DriveApp.getRootFolder(), DOSSIER_CLIENTS).getName());
  Logger.log('Agenda prêt : ' + agenda_().getName());
}
