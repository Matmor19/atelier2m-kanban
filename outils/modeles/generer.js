// Fabrique les modèles Word de public/modeles/ à partir des textes des documents d'Atelier 2M.
// Lancer : node generer.js   (après npm install dans ce dossier)
// Aucune donnée client ici : uniquement des champs {…} remplis par le Kanban au moment de la génération.
const fs = require('fs');
const path = require('path');
const { Packer, TableRow } = require('docx');
const B = require('./briques');
const { P, T, puce, titre, sousTitre, H, note, grand, cellule, tableau, ligneEntete, lignesAlternees, ligneTotal,
  encadre, signatures, document, si, liste, paragraphes, ORANGE, ORANGE_PALE, GRIS } = B;

const SORTIE = path.join(__dirname, '..', '..', 'public', 'modeles');

// ── Morceaux partagés ─────────────────────────────────────────
const identiteA = () => [
  P('{mo_label} : {client}'),
  ...si('soc', [P('Dossier établi au nom de : {soc}')]),
  P('Terrain : {terrain_a}'),
  P('Référence : {num} — Date : {date}')
];
const identiteB = () => [
  P('{mo_label} : {client}'),
  ...si('soc', [P('Dossier établi au nom de : {soc}')]),
  P('Terrain : {adr_projet}'),
  ...si('cadastre_b', [P('Références cadastrales : {cadastre_b}')]),
  P('Référence dossier : {num} — Date : {date}')
];
const objetEtExclusions = () => [
  H('Objet de la mission'),
  ...si('objet_intro', [P('{objet_intro}', { a: 'j' })]),
  ...liste('objet'),
  H('Prestations non comprises'),
  ...si('nc_intro', [P('{nc_intro}', { a: 'j' })]),
  ...liste('non_compris')
];
const tableauTaux = (libTravaux) => {
  const L = [6400, 3000];
  return tableau([
    new TableRow({ children: [cellule(libTravaux, { w: L[0] }), cellule('{travaux} € HT', { w: L[1], a: 'r' })] }),
    new TableRow({ children: [cellule('{taux_lib}', { w: L[0], fond: ORANGE_PALE }), cellule('{taux} %', { w: L[1], a: 'r', fond: ORANGE_PALE })] })
  ], L);
};
const totalHonoraires = () => [
  grand('MONTANT TOTAL DES HONORAIRES : {total} € HT'),
  note('(TVA non applicable, article 293 B du Code Général des Impôts)', { a: 'c', ap: 160 })
];
const tableauEcheancier = () => {
  const L = [2900, 3500, 900, 2100];
  return tableau([
    ligneEntete(['Étape', 'Déclencheur', '%', 'Montant HT'], L),
    ...lignesAlternees('ech', ['lib', 'decl', 'pct', 'mt'], L, [null, null, 'r', 'r']),
    ligneTotal('TOTAL', '{total} €', L, 3)
  ], L);
};
const plafondProposition = () => si('plafond', [P('Plafond de facturation jusqu\'au dépôt du Permis de Construire : conformément à votre demande, le cumul des honoraires facturés jusqu\'à l\'étape « Dossier de Permis de Construire » incluse ({plafond_lignes}) ne pourra excéder {plafond_pct} % du montant total des honoraires, soit {plafond_mt} € HT. Le solde ({plafond_solde} € HT, soit {plafond_solde_pct} %) sera facturé sur les phases suivantes (suivi de l\'instruction, DCE, direction et suivi de chantier, assistance aux opérations de réception).', { av: 160, a: 'j' })]);
const plafondLettre = () => si('plafond', [P('Plafond de facturation jusqu\'au Permis de Construire : le cumul des honoraires facturés jusqu\'à l\'étape « Dossier de Permis de Construire » incluse ne pourra excéder {plafond_pct} % du montant total des honoraires, soit {plafond_mt} € HT. Le solde sera facturé sur les phases suivantes (suivi de l\'instruction, DCE, direction et suivi de chantier, assistance aux opérations de réception).', { av: 160, a: 'j' })]);
const blanc = () => P('', { ap: 120 });
const faitA = () => P('Fait à ______________________________________, le __________ / {annee}', { av: 200, ap: 300 });
const signaturesB = () => signatures(
  [P('Le Client', { ap: 0 }), P('{sig_client}', { ap: 0 }), P('Signature précédée de la mention « Bon pour accord »', { i: true, s: 17, ap: 0 })],
  [P('ATELIER 2M', { ap: 0 }), P('Le prestataire', { ap: 0 }), P('Mathieu Morel – Atelier 2M', { i: true, s: 17, ap: 0 })]
);
const modalites = (premiere, derniere) => [
  H('Modalités de règlement'),
  puce(premiere),
  puce('Règlement exigible sous {delai} jours à compter de la date d\'émission de la facture.'),
  puce('Tout retard de paiement entraînera l\'application de pénalités de retard au taux légal en vigueur.'),
  puce(derniere)
];

// ── A · Proposition d'honoraires (mission complète) ────────────
function propositionA() {
  return document('Proposition d\'honoraires', [
    titre('PROPOSITION D\'HONORAIRES'), sousTitre('{sous_titre_prop}'),
    ...identiteA(),
    P('{intro}', { a: 'j' }),
    ...objetEtExclusions(),
    H('Montant des honoraires'),
    ...si('a_taux', [
      P('La proposition d\'honoraires est établie sur la base de l\'estimatif prévisionnel des travaux joint au présent dossier (voir document « Chiffrage estimatif ») :', { a: 'j' }),
      tableauTaux('Montant de référence des travaux HT (hors annexes) — estimatif prévisionnel'),
      note('Le taux de {taux} % s\'applique sur le montant HT des travaux, hors postes annexes (taxe d\'aménagement, raccordements, études thermiques réglementaires — voir document « Chiffrage estimatif »).', { av: 60 })
    ]),
    P('Le montant global des honoraires proposés pour la mission décrite ci-dessus s\'élève à :'),
    ...totalHonoraires(),
    ...si('a_taux', [P('Ce montant pourra être ajusté à l\'issue de la phase APD sur la base de l\'estimatif détaillé des travaux, conformément à la clause de révision ci-après.', { a: 'j' })]),
    H('Échéancier de facturation'),
    ...si('ech_intro', [P('{ech_intro}', { a: 'j' })]),
    tableauEcheancier(),
    ...plafondProposition(),
    blanc(),
    encadre([
      P('ACOMPTE EXIGIBLE À LA SIGNATURE', { c: 'FFFFFF', s: 21, ap: 60 }),
      P([['Montant : {acompte} € HT (soit '], ['{acompte_lettres}', { i: true }], [')']], { c: 'FFFFFF', ap: 20 }),
      P('Correspond {acompte_ref}. La mission débutera à réception de cet acompte.', { c: 'FFFFFF', i: true, s: 17, ap: 0 })
    ]),
    ...modalites('Les factures sont émises à chaque jalon atteint (ou mensuellement pour la phase de suivi de chantier), sur présentation d\'une note d\'honoraires.',
      'En cas de suspension ou d\'abandon du projet après signature, les prestations réalisées seront facturées au prorata des étapes accomplies.'),
    ...si('a_taux', [
      H('Clause de révision des honoraires'),
      P('Les honoraires sont calculés sur la base de l\'estimatif prévisionnel des travaux HT hors annexes ({travaux} € HT). Ce montant constitue une hypothèse de travail qui sera précisée et actualisée à l\'issue de la phase APD, sur la base d\'un estimatif détaillé par lots (DPGF).', { a: 'j' }),
      P('Cette révision s\'applique aux honoraires des phases restant à facturer à la date de l\'estimatif détaillé (APD, PC, DCE, DET, AOR), à due proportion de l\'écart constaté entre l\'estimatif détaillé et l\'estimation initiale.', { a: 'j' })
    ]),
    H('Acceptation de la proposition'),
    P('La présente proposition est valable 2 mois à compter de sa date d\'émission. Son acceptation par le maître d\'ouvrage vaudra accord sur l\'ensemble des conditions fixées ci-dessus.', { a: 'j' }),
    P('À retourner signée avec la mention « Bon pour accord ».'),
    faitA(),
    signatures(
      [P('Signature du maître d\'ouvrage', { ap: 0 }), ...si('soc', [P('{soc}', { ap: 0 }), P('({signataire})', { ap: 0 })]), ...si('sans_soc', [P('{client}', { ap: 0 })])],
      [P('Signature du maître d\'œuvre', { ap: 0 }), P('Atelier 2M', { ap: 0 })]
    )
  ]);
}

// ── B · Proposition d'honoraires (PC ou suivi de chantier) ─────
function propositionB(enteteTxt, facturesTxt, derniereModalite, revision, echIntroDefaut) {
  return document(enteteTxt, [
    titre('PROPOSITION D\'HONORAIRES'), sousTitre('{sous_titre_prop}'),
    ...identiteB(),
    P('{intro}', { a: 'j' }),
    ...objetEtExclusions(),
    H('Montant des honoraires'),
    ...si('a_taux', [
      P('La proposition d\'honoraires est établie sur la base de l\'estimatif prévisionnel des travaux (voir document « Estimatif des travaux » joint) :', { a: 'j' }),
      tableauTaux('Montant de référence des travaux HT — estimatif prévisionnel'),
      note('Le taux de {taux} % s\'applique sur le montant HT des travaux estimé.', { av: 60 })
    ]),
    ...totalHonoraires(),
    H('Échéancier de facturation'),
    ...si('ech_intro', [P('{ech_intro}', { a: 'j' })]),
    tableauEcheancier(),
    ...plafondProposition(),
    blanc(),
    encadre([
      P('ACOMPTE EXIGIBLE À LA SIGNATURE', { c: 'FFFFFF', s: 21, ap: 60 }),
      P('Montant : {acompte} € — correspond {acompte_ref_court}.', { c: 'FFFFFF', i: true, ap: 0 }),
      P('La mission débutera à réception de cet acompte.', { c: 'FFFFFF', i: true, ap: 0 })
    ]),
    ...modalites(facturesTxt, derniereModalite),
    ...si('a_taux', [H('Clause de révision des honoraires'), P(revision, { a: 'j' })]),
    H('Acceptation de la proposition'),
    P('La présente proposition est valable 2 mois à compter de sa date d\'émission. Son acceptation par le maître d\'ouvrage vaudra accord sur l\'ensemble des conditions fixées ci-dessus. À retourner signée avec la mention « Bon pour accord ».', { a: 'j' }),
    faitA(),
    signaturesB()
  ]);
}

// ── Lettres de mission ─────────────────────────────────────────
const prestataireCentre = () => [
  P('29 Avenue Thiers – 19100 BRIVE LA GAILLARDE', { a: 'c', s: 17, ap: 160 }),
  P('SIRET : 484 070 065 00038 – APE 7112Z', { a: 'c', s: 17, ap: 0 }),
  P('Téléphone : 06 59 98 68 81 – Mail : contact@atelier2m.com', { a: 'c', s: 17, ap: 0 }),
  P('Ci-après désigné « le prestataire »', { a: 'c', s: 17, i: true, ap: 200 })
];
const prestataireGauche = () => [
  P('29 Avenue Thiers – 19100 BRIVE LA GAILLARDE'),
  P('SIRET : 484 070 065 00038 – APE 7112Z'),
  P('Téléphone : 06 59 98 68 81 – Mail : contact@atelier2m.com', { i: true }),
  P('Ci-après désigné « le prestataire »', { i: true })
];
const obligationsListe = () => [
  puce('Les limites de propriété exactes et les documents cadastraux'),
  puce('Les documents réglementaires (PLU, servitudes) en sa possession'),
  puce('Toute étude technique existante (étude de sol, diagnostics)'),
  puce('Le programme et les besoins précis du projet')
];
const responsabilite = (derniere) => [
  H('7. Responsabilité'),
  P('ATELIER 2M est tenu à une obligation de moyens dans l\'exécution de sa mission. La responsabilité de ATELIER 2M ne saurait être engagée en cas :', { a: 'j' }),
  puce('De refus du permis de construire'),
  puce('De modification des règles d\'urbanisme postérieure à la mission'),
  puce('D\'informations erronées, incomplètes ou tardives fournies par le client ou des tiers'),
  puce('De contraintes techniques non apparentes lors de la mission'),
  puce('De vices, malfaçons ou retards imputables aux entreprises exécutantes ou à leurs fournisseurs'),
  puce(derniere),
  P('La responsabilité de ATELIER 2M, tous préjudices confondus, est limitée au montant des honoraires effectivement perçus pour la présente mission.', { a: 'j', av: 60 })
];
const assurances = (premiere) => [
  H('5. Assurances et garanties'),
  P(premiere, { a: 'j' }),
  P('Les entreprises retenues pour la réalisation des travaux demeurent seules responsables de la bonne exécution de leurs lots respectifs et doivent justifier de leurs propres garanties légales (responsabilité civile, garantie décennale) avant le démarrage de leur intervention.', { a: 'j' }),
  P('Le client s\'engage à souscrire une assurance dommages-ouvrage avant l\'ouverture du chantier, conformément à l\'article L242-1 du Code des assurances.', { a: 'j' })
];
const delais = () => [
  H('6. Délais'),
  P('Les délais sont donnés à titre indicatif et courent sous réserve de la réception en temps utile des documents et validations demandés au client. ATELIER 2M ne pourra être tenu responsable des délais d\'instruction administrative, des délais d\'exécution imputables aux entreprises, ni des demandes de pièces complémentaires ou refus émis par l\'administration.', { a: 'j' }),
  P('Force majeure : aucune des parties ne pourra être tenue responsable d\'un retard ou d\'une inexécution résultant d\'un cas de force majeure au sens de l\'article 1218 du Code civil.', { a: 'j' })
];
const proprieteDebut = () => P('Les études, plans, visuels et documents réalisés demeurent la propriété exclusive de ATELIER 2M jusqu\'au paiement intégral des honoraires. Ils ne peuvent être utilisés que dans le cadre du projet défini et ne peuvent être reproduits, modifiés ou transmis à des tiers sans autorisation écrite préalable.', { a: 'j' });
const resiliation = () => [
  H('9. Résiliation anticipée'),
  P('Le client peut résilier la présente mission à tout moment, par lettre recommandée avec accusé de réception ou tout écrit équivalent.', { a: 'j' }),
  P('En cas de résiliation à l\'initiative du client, les phases déjà réalisées ou en cours à la date de résiliation sont dues intégralement, au prorata de l\'avancement, en sus de l\'acompte déjà versé qui reste acquis à ATELIER 2M.', { a: 'j' }),
  P('En cas de manquement grave de l\'une des parties à ses obligations non régularisé dans les 15 jours suivant une mise en demeure restée sans effet, l\'autre partie pourra résilier la mission de plein droit.', { a: 'j' })
];
const qualite = () => [
  H('10. Qualité du maître d\'ouvrage'),
  ...si('soc', [P('Le maître d\'ouvrage agit dans le cadre de la {soc}, personne morale, pour la réalisation d\'un projet de construction à caractère patrimonial. À ce titre, les dispositions du Code de la consommation relatives au droit de rétractation (articles L221-18 et suivants) applicables aux contrats conclus avec un consommateur personne physique ne trouvent pas à s\'appliquer à la présente lettre de mission.', { a: 'j' })]),
  ...si('sans_soc', [P('Le maître d\'ouvrage agit en qualité de personne physique, pour la réalisation d\'un projet de construction à usage d\'habitation personnelle.', { a: 'j' })])
];
const donnees = (texte) => [H('11. Protection des données personnelles'), P(texte, { a: 'j' })];
const loiEtAcceptation = () => [
  H('12. Loi applicable et règlement des litiges'),
  P('La présente lettre de mission est soumise au droit français. En cas de litige, les parties s\'efforceront de trouver une solution amiable avant toute action contentieuse. À défaut d\'accord amiable, le litige sera porté devant les juridictions compétentes selon les règles de droit commun applicables.', { a: 'j' }),
  H('13. Acceptation de la mission'),
  P('La signature de la présente lettre de mission et de la proposition d\'honoraires associée vaut acceptation pleine et entière des présentes conditions.', { a: 'j' })
];
const DONNEES_A = 'Les données personnelles communiquées par le client sont utilisées par ATELIER 2M dans le seul cadre de l\'exécution de la présente mission et ne sont transmises à aucun tiers, hormis les administrations compétentes dans le cadre du dossier de permis de construire et les entreprises intervenant sur le chantier dans la limite nécessaire à leur mission. Conformément au RGPD, le client dispose d\'un droit d\'accès, de rectification et de suppression de ces données, qu\'il peut exercer auprès de ATELIER 2M.';
const DONNEES_B = 'Les données personnelles communiquées par le client sont utilisées par ATELIER 2M dans le seul cadre de l\'exécution de la présente mission et ne sont transmises à aucun tiers, hormis les administrations compétentes et les entreprises intervenant sur le chantier dans la limite nécessaire à leur mission. Conformément au RGPD, le client dispose d\'un droit d\'accès, de rectification et de suppression de ces données, qu\'il peut exercer auprès de ATELIER 2M.';
const banque = () => P('Sauf mention contraire sur la facture, les factures sont payables par virement bancaire dans un délai de {delai} jours à compter de leur émission, aux coordonnées bancaires suivantes : IBAN : {iban} – BIC : {bic} – Titulaire du compte : {titulaire}.', { a: 'j' });
const phrasesHonoraires = (travauxTxt) => P('Le montant des honoraires est fixé selon la proposition d\'honoraires du {date} (référence {num}), {#a_taux}calculée sur la base d\'un taux de {taux} % appliqué au montant HT des travaux' + travauxTxt + ' ({travaux} € HT), {/a_taux}pour un total de {total} € HT (TVA non applicable, article 293 B du CGI), réparti comme suit :', { a: 'j' });

function lettreA() {
  const L2 = [7800, 1600];
  return document('Lettre de mission', [
    titre('LETTRE DE MISSION'), sousTitre('{sous_titre_lm}'),
    ...prestataireCentre(),
    P('Client : {client}{#soc} — {soc}{/soc}'),
    P('Adresse du client : {adr_client}'),
    P('Projet : {Projet}', { a: 'j' }),
    P('Adresse du projet : {terrain_a}'),
    P('Référence devis : {num}'),
    P('Date : {date}'),
    H('1. Objet de la mission'),
    P('{lm_intro}', { a: 'j' }),
    P('La mission comprend l\'ensemble des phases suivantes, telles que détaillées dans la proposition d\'honoraires n°{num} jointe en annexe 2 :', { a: 'j' }),
    ...liste('phases'),
    P('Chaque phase fait l\'objet d\'une validation écrite du client (mail ou courrier valant accord) avant le passage à la phase suivante. À défaut de remarque du client dans un délai de 8 jours suivant la transmission d\'un livrable de phase, celui-ci est réputé validé.', { a: 'j', av: 60 }),
    P('{lm_fin}', { a: 'j' }),
    H('2. Limites de la mission'),
    P('La présente mission ne comprend pas :'),
    ...liste('limites'),
    ...si('a_est_a', [P('L\'estimation chiffrée de ces postes annexes (étude thermique RE2020, taxe d\'aménagement, raccordements, assainissement) figure dans le document « Chiffrage estimatif » joint, pour un budget global prévisionnel de {est_budget} € TTC (travaux et annexes, hors honoraires de maîtrise d\'œuvre).', { a: 'j', av: 60 })]),
    P('{lm_role}', { a: 'j' }),
    H('3. Obligations du client'),
    P('Le client s\'engage à fournir toutes les informations nécessaires à la réalisation de la mission, notamment :', { a: 'j' }),
    ...obligationsListe(),
    P('Le client reste seul responsable de l\'exactitude et de l\'exhaustivité des informations transmises. ATELIER 2M ne saurait être tenu responsable des conséquences résultant d\'informations erronées, incomplètes ou tardivement communiquées.', { a: 'j', av: 60 }),
    P('Le client s\'engage à répondre aux demandes de validation ou d\'informations complémentaires du prestataire dans un délai raisonnable, faute de quoi les délais indiqués à l\'article 6 seront prolongés d\'autant. Le client s\'engage également à souscrire, avant l\'ouverture du chantier, une assurance dommages-ouvrage.', { a: 'j' }),
    H('4. Honoraires et conditions de règlement'),
    phrasesHonoraires(' hors annexes'),
    tableau([
      ligneEntete(['Phase', 'Montant'], L2),
      ...lignesAlternees('ech_lm', ['lib', 'mt'], L2, [null, 'r']),
      ligneTotal('TOTAL', '{total} €', L2, 1)
    ], L2),
    ...plafondLettre(),
    P('Un acompte de {acompte} € HT (soit {acompte_lettres}), correspondant {lm_acompte_ref}, est exigible à la signature de la présente lettre de mission. {#acompte_texte}{acompte_texte} {/acompte_texte}La mission débutera uniquement à réception de cet acompte.', { a: 'j', av: 160 }),
    banque(),
    P('Tout travail supplémentaire demandé par le client, ou rendu nécessaire par une modification du projet après validation d\'une phase ou par une demande de l\'administration, fera l\'objet d\'un devis complémentaire écrit, soumis à l\'accord préalable du client avant toute exécution, puis d\'une facturation complémentaire.', { a: 'j' }),
    P('Pénalités de retard : toute somme non payée à son échéance porte de plein droit intérêt à un taux égal à trois fois le taux d\'intérêt légal, à compter du 15ème jour suivant une mise en demeure de payer restée sans effet, sans préjudice de toute action que ATELIER 2M jugerait utile d\'intenter à l\'encontre du client.', { a: 'j' }),
    P('Suspension de la mission : le défaut de paiement d\'une facture à son échéance autorise ATELIER 2M à suspendre immédiatement l\'exécution de la mission jusqu\'à complet règlement, sans que cette suspension ne puisse engager sa responsabilité ni constituer une rupture fautive du contrat, ni justifier un quelconque dépassement de délai reproché au prestataire.', { a: 'j' }),
    ...assurances('ATELIER 2M est titulaire d\'une assurance responsabilité civile professionnelle couvrant les prestations de conception et de direction de l\'exécution des travaux réalisées dans le cadre de la présente mission.'),
    ...delais(),
    ...responsabilite('De dommages résultant de travaux réalisés sur la base du dossier en dehors de toute mission de suivi ou de direction confiée à ATELIER 2M'),
    H('8. Propriété intellectuelle et remise des documents'),
    proprieteDebut(),
    P('Le dossier de permis de construire (fichiers numériques et pièces destinées au dépôt) ne sera remis au client, ni son dépôt autorisé, qu\'après paiement intégral des honoraires dus au titre des phases correspondantes.', { a: 'j' }),
    ...resiliation(),
    ...qualite(),
    ...donnees(DONNEES_A),
    ...loiEtAcceptation(),
    P('Fait à : ........................................', { av: 160 }),
    P('Le : ........................................', { ap: 300 }),
    signatures(
      [P('Le Client', { ap: 0 }), ...si('soc', [P('{soc}', { ap: 0 })]), P('Nom : {signataire}', { ap: 0 }),
        P('Signature précédée de la mention « Bon pour accord et acceptation de la mission »', { i: true, s: 17, ap: 0 }), P('Signature :', { ap: 0 })],
      [P('ATELIER 2M', { ap: 0 }), P('Le prestataire', { i: true, ap: 0 }), P('Mathieu Morel – Atelier 2M', { ap: 0 })]
    )
  ]);
}

function lettreB(o) {
  const L3 = [6300, 1100, 2000];
  return document(o.entete, [
    titre('LETTRE DE MISSION'), sousTitre('{sous_titre_lm}'),
    ...prestataireGauche(),
    P('Client : {client}{#soc} — {soc}{/soc}'),
    P('Adresse du client : {adr_client}'),
    P('Projet : {Projet}', { a: 'j' }),
    P('Adresse du projet : {adr_projet}'),
    ...si('cadastre_b', [P('Références cadastrales : {cadastre_b}')]),
    P('Référence devis : {num}'),
    P('Date : {date}'),
    H('1. Objet de la mission'),
    P('{lm_intro}', { a: 'j' }),
    P('La mission comprend l\'ensemble des phases suivantes, telles que détaillées dans la proposition d\'honoraires n°{num} jointe en annexe :', { a: 'j' }),
    ...liste('phases'),
    P(o.validation, { a: 'j', av: 60 }),
    P('{lm_fin}', { a: 'j' }),
    H('2. Limites de la mission'),
    P('La présente mission ne comprend pas :'),
    ...liste('limites'),
    ...si('a_est_b', [P('L\'estimation chiffrée des travaux figure dans le document « Estimatif des travaux » joint, pour un montant prévisionnel de {est_ht} € HT ({est_ttc} € TTC).', { a: 'j', av: 60 })]),
    P('{lm_role}', { a: 'j' }),
    H('3. Obligations du client'),
    P('Le client s\'engage à fournir toutes les informations nécessaires à la réalisation de la mission, notamment :', { a: 'j' }),
    ...o.obligations,
    H('4. Honoraires et conditions de règlement'),
    phrasesHonoraires(''),
    tableau([
      ligneEntete(['Phase', '%', 'Montant HT'], L3),
      ...lignesAlternees('ech', ['lib', 'pct', 'mt'], L3, [null, 'r', 'r']),
      ligneTotal('TOTAL', '{total} €', L3, 2)
    ], L3),
    ...plafondLettre(),
    P('Un acompte de {acompte} €, correspondant {lm_acompte_ref}, est exigible à la signature de la présente lettre de mission. {#acompte_texte}{acompte_texte} {/acompte_texte}La mission débutera uniquement à réception de cet acompte.', { a: 'j', av: 160 }),
    banque(),
    P(o.travailSupp, { a: 'j' }),
    P('Pénalités de retard : toute somme non payée à son échéance porte de plein droit intérêt à un taux égal à trois fois le taux d\'intérêt légal, à compter du 15ème jour suivant une mise en demeure de payer restée sans effet.', { a: 'j' }),
    P('Suspension de la mission : le défaut de paiement d\'une facture à son échéance autorise ATELIER 2M à suspendre immédiatement l\'exécution de la mission jusqu\'à complet règlement, sans que cette suspension ne puisse engager sa responsabilité ni constituer une rupture fautive du contrat.', { a: 'j' }),
    ...assurances('ATELIER 2M est titulaire d\'une assurance responsabilité civile professionnelle couvrant les prestations réalisées dans le cadre de la présente mission.'),
    ...delais(),
    ...responsabilite('De dommages résultant de travaux réalisés en dehors de toute mission de suivi ou de direction confiée à ATELIER 2M'),
    H('8. Propriété intellectuelle et remise des documents'),
    proprieteDebut(),
    ...resiliation(),
    ...qualite(),
    ...donnees(DONNEES_B),
    ...loiEtAcceptation(),
    faitA(),
    signaturesB()
  ]);
}

// ── Estimatifs ─────────────────────────────────────────────────
const tableauLots = (avecTotauxDansTableau) => {
  const L = [700, 4300, 1000, 1700, 1700];
  const lignes = [
    ligneEntete(['Lot', 'Poste de travaux', 'Part', 'Montant HT', 'Montant TTC'], L),
    ...lignesAlternees('lots', ['n', 'lib', 'part', 'ht', 'ttc'], L, ['c', null, 'r', 'r', 'r']),
    ligneTotal('TOTAL GÉNÉRAL TRAVAUX HT', '{total_ht} €', L, 4)
  ];
  if (avecTotauxDansTableau) lignes.push(
    ligneTotal('TVA {tva_taux} %', '{tva} €', L, 4),
    ligneTotal('TOTAL GÉNÉRAL TRAVAUX TTC', '{total_ttc} €', L, 4, { fond: 'E07B39', c: 'FFFFFF' })
  );
  return tableau(lignes, L);
};
const budget = () => [
  grand('BUDGET GLOBAL PRÉVISIONNEL : {budget} € TTC'),
  note('({budget_note})', { a: 'c', ap: 160 })
];
const finEstimatif = () => [
  ...si('a_vigilance', [H('Points de vigilance à instruire en phase diagnostic')]),
  ...liste('vigilance'),
  H('Nature de l\'estimation'),
  ...paragraphes('nature', { a: 'j' })
];
const baseDeCalcul = () => [
  H('Base de calcul — estimatif prévisionnel des travaux'),
  grand('{total_ttc} € TTC'),
  note('soit un ratio d\'environ {ratio} € TTC / m² sur les {surf_hab} m² de surface habitable {ratio_note}', { a: 'c', ap: 160 }),
  ...paragraphes('hypothese', { a: 'j' })
];

function estimatifA() {
  const LA = [5600, 1900, 1900];
  return document('Estimation des travaux relative à la proposition d\'honoraires', [
    titre('{est_titre}'), sousTitre('{est_sous_titre}'),
    P('{mo_label} : {client}'),
    ...si('soc', [P('Dossier établi au nom de : {soc}')]),
    P('Terrain : {terrain_a}'),
    H('Présentation générale du projet'),
    ...paragraphes('presentation', { a: 'j' }),
    ...si('a_est_objet', [
      H('Objet de la mission'),
      ...si('est_objet_intro', [P('{est_objet_intro}', { a: 'j' })]),
      ...liste('est_objet'),
      note('Le détail de cette mission et son chiffrage font l\'objet du document « Proposition d\'honoraires » joint au présent dossier.', { av: 60 })
    ]),
    ...baseDeCalcul(),
    tableauLots(true),
    H('Budget global prévisionnel — Travaux et annexes financières'),
    ...paragraphes('annexes_intro', { a: 'j' }),
    tableau([
      ligneEntete(['Poste annexe (hors travaux)', 'Montant TTC', '€ / m² hab.'], LA),
      ...lignesAlternees('annexes', ['lib', 'mt', 'm2'], LA, [null, 'r', 'r']),
      ligneTotal('MONTANT TTC ANNEXES', '{annexes_total} €', LA, 1, { fond: 'E07B39', c: 'FFFFFF' })
    ], LA),
    ...budget(),
    ...finEstimatif()
  ]);
}

function estimatifB() {
  const LB = [2900, 1300, 5200], LT = [6400, 3000];
  return document('Estimatif des travaux', [
    titre('{est_titre}'), sousTitre('{est_sous_titre}'),
    P('{mo_label} : {client}'),
    ...si('soc', [P('Dossier établi au nom de : {soc}')]),
    P('Terrain : {adr_projet}'),
    ...si('cadastre_b', [P('Références cadastrales : {cadastre_b}')]),
    P('Référence dossier : {est_ref} — Date : {date}'),
    ...paragraphes('presentation', { a: 'j' }),
    ...baseDeCalcul(),
    tableauLots(false),
    P('', { ap: 120 }),
    tableau([
      new TableRow({ children: [cellule('TVA {tva_taux} %', { w: LT[0] }), cellule('{tva} €', { w: LT[1], a: 'r' })] }),
      new TableRow({ children: [cellule('TOTAL GÉNÉRAL TRAVAUX TTC', { w: LT[0], fond: ORANGE_PALE }), cellule('{total_ttc} €', { w: LT[1], a: 'r', fond: ORANGE_PALE })] })
    ], LT),
    H('Budget global prévisionnel — Travaux et annexes financières'),
    ...paragraphes('annexes_intro', { a: 'j' }),
    tableau([
      ligneEntete(['Poste annexe (hors travaux)', 'Montant', 'Observation'], LB),
      ...lignesAlternees('annexes', ['lib', 'mt', 'obs'], LB, [null, 'r', null]),
      ligneTotal('MONTANT TTC ANNEXES', '{annexes_total} €', LB, 1)
    ], LB),
    ...budget(),
    ...finEstimatif()
  ]);
}

// ── Annexe 1 : analyse du terrain et du PLU ───────────────────
function annexePLU() {
  const L = [3400, 6000];
  const ligne = (a, b, fond) => new TableRow({ children: [cellule(a, { w: L[0], fond }), cellule(b, { w: L[1], fond })] });
  return document('Annexe — Analyse du terrain et du PLU', [
    titre('ANNEXE 1'), sousTitre('Analyse du terrain et du document d\'urbanisme applicable'),
    H('Identification de la parcelle'),
    tableau([
      ligne('Commune', '{plu_commune}'), ligne('Lieu-dit', '{plu_lieudit}', ORANGE_PALE),
      ligne('Référence cadastrale', '{plu_cad}'), ligne('Contenance', '{plu_contenance}', ORANGE_PALE),
      ligne('Document d\'urbanisme applicable', '{plu_doc}')
    ], L),
    P('', { ap: 200 }),
    T('{#sections}'),
    H('{titre}'),
    T('{#blocs}'),
    T('{#texte}'), P('{t}', { a: 'j' }), T('{/texte}'),
    T('{#puce}'), puce('{t}'), T('{/puce}'),
    T('{#alerte}'), P('{t}', { a: 'j', i: true, c: ORANGE }), T('{/alerte}'),
    T('{/blocs}'),
    T('{/sections}')
  ]);
}

// ── Fabrication ───────────────────────────────────────────────
const MODELES = {
  'proposition_A.docx': propositionA(),
  'proposition_PC.docx': propositionB('Proposition d\'honoraires — Mission Permis de Construire',
    'Les factures sont émises à chaque jalon atteint, sur présentation d\'une note d\'honoraires.',
    'En cas de suspension ou d\'abandon du projet après signature, les prestations réalisées seront facturées au prorata des étapes accomplies.',
    'Les honoraires sont calculés sur la base de l\'estimatif prévisionnel des travaux HT ({travaux} € HT). Ce montant constitue une hypothèse de travail qui sera précisée et actualisée à l\'issue de la phase APD, sur la base d\'un estimatif détaillé par lots. Cette révision s\'applique aux honoraires des phases restant à facturer à la date de l\'estimatif détaillé, à due proportion de l\'écart constaté.'),
  'proposition_SUIVI.docx': propositionB('Proposition d\'honoraires — Mission de Maîtrise d\'Œuvre',
    'Les factures sont émises à chaque jalon atteint (ou mensuellement pour la phase de suivi de chantier), sur présentation d\'une note d\'honoraires.',
    'En cas de suspension ou d\'abandon du chantier après signature, les prestations réalisées seront facturées au prorata des étapes accomplies.',
    'Les honoraires sont calculés sur la base de l\'estimatif prévisionnel des travaux HT ({travaux} € HT). Ce montant sera précisé et actualisé sur la base du montant réel des marchés de travaux signés à l\'issue de la consultation des entreprises (DCE). Cette révision s\'applique aux honoraires des phases restant à facturer, à due proportion de l\'écart constaté entre le montant réel des marchés et l\'estimation initiale.'),
  'lettre_mission_A.docx': lettreA(),
  'lettre_mission_PC.docx': lettreB({
    entete: 'Lettre de mission — Permis de Construire',
    validation: 'Chaque phase fait l\'objet d\'une validation écrite du client (mail ou courrier valant accord) avant le passage à la phase suivante. À défaut de remarque du client dans un délai de 8 jours suivant la transmission d\'un livrable de phase, celui-ci est réputé validé.',
    obligations: [...obligationsListe(),
      P('Le client reste seul responsable de l\'exactitude et de l\'exhaustivité des informations transmises. ATELIER 2M ne saurait être tenu responsable des conséquences résultant d\'informations erronées, incomplètes ou tardivement communiquées.', { a: 'j', av: 60 }),
      P('Le client s\'engage à répondre aux demandes de validation ou d\'informations complémentaires du prestataire dans un délai raisonnable, faute de quoi les délais indiqués à l\'article 6 seront prolongés d\'autant.', { a: 'j' })],
    travailSupp: 'Tout travail supplémentaire demandé par le client, ou rendu nécessaire par une modification du projet après validation d\'une phase ou par une demande de l\'administration, fera l\'objet d\'un devis complémentaire écrit, soumis à l\'accord préalable du client avant toute exécution, puis d\'une facturation complémentaire.'
  }),
  'lettre_mission_SUIVI.docx': lettreB({
    entete: 'Lettre de mission — Maîtrise d\'Œuvre',
    validation: 'Chaque phase fait l\'objet d\'une validation écrite du client (mail ou courrier valant accord) avant le passage à la phase suivante.',
    obligations: [
      puce('Le permis de construire obtenu et le dossier de plans associé'),
      puce('Toute étude technique existante (étude de sol, diagnostics)'),
      puce('Les coordonnées et disponibilités utiles au bon déroulement des réunions de chantier'),
      P('Le client reste seul responsable de l\'exactitude et de l\'exhaustivité des informations transmises. Le client s\'engage également à souscrire, avant l\'ouverture du chantier, une assurance dommages-ouvrage.', { a: 'j', av: 60 }),
      P('Le client s\'engage à répondre aux demandes de validation ou d\'informations complémentaires du prestataire dans un délai raisonnable, faute de quoi les délais indiqués à l\'article 6 seront prolongés d\'autant.', { a: 'j' })],
    travailSupp: 'Tout travail supplémentaire demandé par le client, ou rendu nécessaire par une modification du projet ou des aléas de chantier, fera l\'objet d\'un devis complémentaire écrit, soumis à l\'accord préalable du client avant toute exécution, puis d\'une facturation complémentaire.'
  }),
  'estimatif_A.docx': estimatifA(),
  'estimatif_B.docx': estimatifB(),
  'annexe_PLU.docx': annexePLU()
};

fs.mkdirSync(SORTIE, { recursive: true });
Promise.all(Object.entries(MODELES).map(([nom, doc]) => Packer.toBuffer(doc).then(buf => {
  fs.writeFileSync(path.join(SORTIE, nom), buf);
  console.log('✓', nom, Math.round(buf.length / 1024) + ' Ko');
}))).catch(e => { console.error(e); process.exit(1); });
