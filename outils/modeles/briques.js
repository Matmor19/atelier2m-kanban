// Briques de mise en page communes aux modèles Word d'Atelier 2M (charte : Montserrat, orange #d4762a).
// Les textes entre accolades ({client}, {#objet}…) sont des champs remplis par le Kanban (docxtemplater).
const fs = require('fs');
const path = require('path');
const {
  Document, Paragraph, TextRun, ImageRun, Header, Footer, Table, TableRow, TableCell,
  WidthType, BorderStyle, ShadingType, AlignmentType, LevelFormat, VerticalAlign, TableLayoutType, LineRuleType
} = require('docx');

const ORANGE = 'D4762A';
const ORANGE_PALE = 'FBE5D6';
const GRIS_BLEU = 'DCE3EE';
const TEXTE = '404040';
const GRIS = '808080';
const LOGO = fs.readFileSync(path.join(__dirname, 'logo.png'));

const SANS = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
const SANS_BORDURES = { top: SANS, bottom: SANS, left: SANS, right: SANS, insideHorizontal: SANS, insideVertical: SANS };
const FIN = { style: BorderStyle.SINGLE, size: 4, color: 'D9D9D9' };
const BORDURES_TABLEAU = { top: FIN, bottom: FIN, left: FIN, right: FIN, insideHorizontal: FIN, insideVertical: FIN };

function run(t, o = {}) {
  t = t.replace(/ (€|%)/g, '\u00a0$1'); // espace insécable : « 500 000 € » jamais coupé
  return new TextRun({ text: t, bold: o.b, italics: o.i, color: o.c, size: o.s, font: o.f });
}
// Paragraphe : texte simple ou liste de morceaux [texte, options]
function P(t, o = {}) {
  const enfants = Array.isArray(t) ? t.map(x => (typeof x === 'string' ? run(x, o) : run(x[0], Object.assign({}, o, x[1])))) : [run(t, o)];
  return new Paragraph({
    children: enfants,
    alignment: o.a === 'c' ? AlignmentType.CENTER : o.a === 'r' ? AlignmentType.RIGHT : o.a === 'j' ? AlignmentType.JUSTIFIED : AlignmentType.LEFT,
    spacing: { before: o.av || 0, after: o.ap === undefined ? 100 : o.ap, line: o.line || 264, lineRule: LineRuleType.AUTO },
    keepNext: o.kn
  });
}
// Balise seule sur sa ligne (début/fin de boucle ou de condition) : la ligne disparaît au remplissage
const T = tag => new Paragraph({ children: [run(tag)], spacing: { after: 0 } });
const puce = (t, o = {}) => new Paragraph({
  children: [run(t, o)], numbering: { reference: 'puces', level: 0 }, spacing: { after: 40, line: 264, lineRule: LineRuleType.AUTO }
});
const titre = t => P(t, { a: 'c', s: 36, c: TEXTE, av: 120, ap: 60, line: 250 });
const sousTitre = t => P(t, { a: 'c', s: 23, c: ORANGE, ap: 200 });
const H = (t, o = {}) => new Paragraph({
  children: [run(t, { c: o.c || ORANGE, s: o.s || 23, b: o.b })],
  spacing: { before: 220, after: 120 }, keepNext: true,
  border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: ORANGE, space: 1 } }
});
const note = (t, o = {}) => P(t, Object.assign({ i: true, c: GRIS, s: 17 }, o));
const grand = t => P(t, { a: 'c', s: 32, c: ORANGE, av: 160, ap: 40 });

function cellule(contenu, o = {}) {
  const paras = (Array.isArray(contenu) ? contenu : [contenu]).map(x => (x instanceof Paragraph ? x
    : P(x, { a: o.a, b: o.b, c: o.c, s: o.s || 18, i: o.i, ap: 0 })));
  return new TableCell({
    children: paras,
    shading: o.fond ? { fill: o.fond, type: ShadingType.CLEAR, color: 'auto' } : undefined,
    columnSpan: o.span,
    verticalAlign: VerticalAlign.CENTER,
    margins: { top: 70, bottom: 70, left: 110, right: 110 },
    width: o.w ? { size: o.w, type: WidthType.DXA } : undefined
  });
}
const tableau = (lignes, largeurs, bordures) => new Table({
  rows: lignes, columnWidths: largeurs, width: { size: largeurs.reduce((a, b) => a + b, 0), type: WidthType.DXA },
  borders: bordures || BORDURES_TABLEAU, layout: TableLayoutType.FIXED
});
const ligneEntete = (titres, largeurs, aligns = []) => new TableRow({
  tableHeader: true,
  children: titres.map((t, i) => cellule(t, { fond: ORANGE, c: 'FFFFFF', w: largeurs[i], a: aligns[i] }))
});
// Lignes répétées avec fond alterné (blanc / orange pâle) : la liste {nom} contient des paires {o:…, e:…}
function lignesAlternees(nom, champs, largeurs, aligns = []) {
  const ligne = (cle, fond) => new TableRow({
    children: champs.map((ch, i) => {
      let t = '{' + ch + '}';
      if (i === 0) t = (cle === 'o' ? '{#' + nom + '}' : '') + '{#' + cle + '}' + t;
      if (i === champs.length - 1) t = t + '{/' + cle + '}' + (cle === 'e' ? '{/' + nom + '}' : '');
      return cellule(t, { fond, w: largeurs[i], a: aligns[i] });
    })
  });
  return [ligne('o'), ligne('e', ORANGE_PALE)];
}
// Ligne de total : le libellé occupe les « span » premières colonnes, le montant les suivantes
function ligneTotal(libelle, valeur, largeurs, span, o = {}) {
  const somme = l => l.reduce((a, b) => a + b, 0), reste = largeurs.length - span;
  return new TableRow({ children: [
    cellule(libelle, { span: span > 1 ? span : undefined, a: 'r', fond: o.fond || GRIS_BLEU, c: o.c, w: somme(largeurs.slice(0, span)) }),
    cellule(valeur, { span: reste > 1 ? reste : undefined, a: 'r', fond: o.fond || GRIS_BLEU, c: o.c, w: somme(largeurs.slice(span)) })
  ] });
}
// Encadré orange (acompte)
const encadre = paras => tableau([new TableRow({ children: [new TableCell({
  children: paras, shading: { fill: 'E07B39', type: ShadingType.CLEAR, color: 'auto' },
  margins: { top: 140, bottom: 140, left: 200, right: 200 }
})] })], [9400], SANS_BORDURES);
// Bloc de signatures sur deux colonnes, sans bordure
const signatures = (gauche, droite) => tableau([new TableRow({ children: [
  new TableCell({ children: gauche, width: { size: 4900, type: WidthType.DXA } }),
  new TableCell({ children: droite, width: { size: 4500, type: WidthType.DXA } })
] })], [4900, 4500], SANS_BORDURES);

function entete(sousTitreEntete) {
  return new Header({ children: [
    tableau([new TableRow({ children: [
      new TableCell({ width: { size: 1000, type: WidthType.DXA }, children: [new Paragraph({ children: [
        new ImageRun({ type: 'png', data: LOGO, transformation: { width: 42, height: 52 } })] })] }),
      new TableCell({ width: { size: 8400, type: WidthType.DXA }, verticalAlign: VerticalAlign.CENTER, children: [
        P('ATELIER 2M', { s: 19, c: TEXTE, ap: 0 }), P(sousTitreEntete, { s: 17, i: true, c: GRIS, ap: 0 })] })
    ] })], [1000, 8400], SANS_BORDURES),
    new Paragraph({ children: [], spacing: { after: 0 }, border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: ORANGE, space: 1 } } })
  ] });
}
const piedDePage = () => new Footer({ children: [
  new Paragraph({ children: [run('29 Avenue Thiers — 19100 BRIVE LA GAILLARDE', { s: 14, c: GRIS })], alignment: AlignmentType.CENTER,
    spacing: { after: 0 }, border: { top: { style: BorderStyle.SINGLE, size: 4, color: 'D9D9D9', space: 4 } } }),
  P('06 59 98 68 81 — contact@atelier2m.com — www.atelier2m.com', { s: 14, c: GRIS, a: 'c', ap: 0 })
] });

function document(sousTitreEntete, enfants) {
  return new Document({
    creator: 'Atelier 2M', title: sousTitreEntete,
    styles: { default: { document: { run: { font: 'Montserrat', size: 19, color: TEXTE } } } },
    numbering: { config: [{ reference: 'puces', levels: [{ level: 0, format: LevelFormat.BULLET, text: '●', alignment: AlignmentType.LEFT,
      style: { paragraph: { indent: { left: 720, hanging: 300 } }, run: { font: 'Arial', size: 14 } } }] }] },
    sections: [{
      properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1900, bottom: 1250, left: 1250, right: 1250, header: 450, footer: 450 } } },
      headers: { default: entete(sousTitreEntete) },
      footers: { default: piedDePage() },
      children: enfants
    }]
  });
}
// Condition : les paragraphes n'apparaissent que si le champ est rempli
const si = (champ, paras) => [T('{#' + champ + '}'), ...paras, T('{/' + champ + '}')];
// Liste à puces répétée
const liste = champ => [T('{#' + champ + '}'), puce('{.}'), T('{/' + champ + '}')];
// Plusieurs paragraphes (texte saisi avec des lignes vides)
const paragraphes = (champ, o) => [T('{#' + champ + '}'), P('{.}', o), T('{/' + champ + '}')];

module.exports = {
  P, T, puce, titre, sousTitre, H, note, grand, cellule, tableau, ligneEntete, lignesAlternees, ligneTotal,
  encadre, signatures, document, si, liste, paragraphes, run, ORANGE, ORANGE_PALE, GRIS_BLEU, GRIS, TEXTE, SANS_BORDURES
};
