/* A2M Construction — logique du panneau.
   Dans SketchUp, l'objet `sketchup` relie la page au code Ruby (panneau.rb).
   Ouvert dans un simple navigateur, la page passe en mode « aperçu » avec des données d'exemple. */
var A2M = (function () {
  'use strict';

  var TYPES_OUV = { porte: 'Porte', fenetre: 'Fenêtre', baie: 'Porte-fenêtre' };
  var E = { reglages: null, sel: null, metre: null, onglet: 'tracer', murEdit: null };
  var su = window.sketchup || apercu();
  var minuteur = null;

  // ---------- petits outils ----------
  function $(s) { return document.querySelector(s); }
  function $$(s) { return Array.prototype.slice.call(document.querySelectorAll(s)); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function num(v) { var x = parseFloat(String(v).replace(',', '.')); return isNaN(x) ? null : x; }
  function fmt(x, d) {
    d = d == null ? 1 : d;
    var s = (Number(x) || 0).toFixed(d);
    if (d > 0) s = s.replace(/\.?0+$/, '');
    return s.replace('.', ',');
  }
  function ep(type) { return type.couches.reduce(function (a, c) { return a + Number(c.ep); }, 0); }
  function copie(o) { return JSON.parse(JSON.stringify(o)); }
  function toast(txt, erreur) {
    var t = $('#toast');
    t.textContent = txt;
    t.className = 'vu' + (erreur ? ' erreur' : '');
    clearTimeout(t._m);
    t._m = setTimeout(function () { t.className = ''; }, erreur ? 6000 : 3000);
  }
  function enregistrer() {
    clearTimeout(minuteur);
    minuteur = setTimeout(function () { su.reglages(JSON.stringify(E.reglages)); }, 300);
  }

  // ---------- onglets ----------
  function montrer(o) {
    if (!o || !$('#o-' + o)) return;
    E.onglet = o;
    $$('#onglets button').forEach(function (b) { b.classList.toggle('actif', b.dataset.o === o); });
    $$('main section').forEach(function (s) { s.classList.toggle('actif', s.id === 'o-' + o); });
    if (o === 'metre') su.metre();
    if (o === 'mur') su.selection();
  }

  // ---------- TRACER ----------
  function rendreTracer() {
    var r = E.reglages;
    $('#t-type').innerHTML = r.types.map(function (t, i) {
      return '<option value="' + i + '"' + (i === r.type ? ' selected' : '') + '>' +
        esc(t.nom) + ' — ' + fmt(ep(t)) + ' cm</option>';
    }).join('');
    $('#t-h').value = r.hauteur;
    $$('#t-align button').forEach(function (b) { b.classList.toggle('actif', b.dataset.v === r.align); });
    schemaCoupe($('#t-schema'), r.types[r.type], r.align);
  }

  // Coupe en plan : le trait (flèche = sens de tracé) et les couches.
  function schemaCoupe(svg, type, align) {
    var total = ep(type), larg = 260, x0 = 30, yTrait = 66;
    var echelle = Math.min(70 / total, 3.2);
    var hT = type.couches.reduce(function (a, c) { return a + Math.max(c.ep * echelle, 3); }, 0);
    var haut = align === 'gauche' ? yTrait - hT : align === 'droite' ? yTrait : yTrait - hT / 2;
    var y = haut + hT, out = '';
    type.couches.forEach(function (c) {
      var h = Math.max(c.ep * echelle, 3);
      y -= h;
      out += '<rect x="' + x0 + '" y="' + y + '" width="' + larg + '" height="' + h + '" fill="' + c.couleur +
        '" stroke="#7a6f62" stroke-width=".6"><title>' + esc(c.nom) + ' ' + fmt(c.ep) + ' cm</title></rect>';
      if (h >= 9) {
        out += '<text x="' + (x0 + 8) + '" y="' + (y + h / 2 + 3.5) + '" font-size="9.5" fill="#3b332a">' +
          esc(c.nom) + ' · ' + fmt(c.ep) + ' cm</text>';
      }
    });
    out += '<line x1="12" y1="' + yTrait + '" x2="306" y2="' + yTrait + '" stroke="#d4762a" stroke-width="2" stroke-dasharray="6 4"/>' +
      '<path d="M306 ' + yTrait + ' l-9 -5 v10z" fill="#d4762a"/>' +
      '<text x="14" y="' + (yTrait - 5) + '" font-size="9" fill="#a85a1a" font-weight="700">trait</text>' +
      '<text x="160" y="12" font-size="9" fill="#8c8275" text-anchor="middle">gauche du trait</text>' +
      '<text x="160" y="116" font-size="9" fill="#8c8275" text-anchor="middle">droite du trait · 1re couche</text>';
    svg.innerHTML = out;
  }

  // ---------- OUVERTURE ----------
  function rendreOuverture() {
    var r = E.reglages, t = r.ouverture, d = r.dims[t];
    $$('#v-type button').forEach(function (b) { b.classList.toggle('actif', b.dataset.v === t); });
    $('#v-l').value = d.l;
    $('#v-h').value = d.h;
    $('#v-a').value = d.allege;
    $('#v-a').disabled = t !== 'fenetre';
    schemaOuverture();
  }

  function schemaOuverture() {
    var r = E.reglages, t = r.ouverture, d = r.dims[t];
    var hMur = Math.max(r.hauteur, d.allege + d.h + 1), lMur = Math.max(d.l + 120, 300);
    var k = Math.min(280 / lMur, 125 / hMur), x0 = (320 - lMur * k) / 2, sol = 140;
    var ox = x0 + (lMur - d.l) / 2 * k, oy = sol - (d.allege + d.h) * k, ow = d.l * k, oh = d.h * k;
    var remplissage = t === 'porte' ? '#8a5a3b' : '#bcd9ea';
    svg('#v-schema',
      '<rect x="' + x0 + '" y="' + (sol - hMur * k) + '" width="' + lMur * k + '" height="' + hMur * k + '" fill="#e9e2d6" stroke="#b9ab97"/>' +
      '<rect x="' + ox + '" y="' + oy + '" width="' + ow + '" height="' + oh + '" fill="' + remplissage + '" stroke="#f4f4f2" stroke-width="4"/>' +
      '<line x1="0" y1="' + sol + '" x2="320" y2="' + sol + '" stroke="#7a6f62"/>' +
      '<text x="' + (ox + ow / 2) + '" y="' + (oy - 4) + '" font-size="9.5" text-anchor="middle" fill="#7a3e10">' + fmt(d.l, 0) + ' × ' + fmt(d.h, 0) + ' cm</text>' +
      (d.allege > 0 ? '<text x="' + (ox + ow + 4) + '" y="' + (sol - 4) + '" font-size="9" fill="#5a5146">allège ' + fmt(d.allege, 0) + '</text>' : ''));
  }
  function svg(sel, html) { $(sel).innerHTML = html; }

  function lireOuverture() {
    var r = E.reglages, d = r.dims[r.ouverture];
    var l = num($('#v-l').value), h = num($('#v-h').value), a = num($('#v-a').value);
    if (l && l > 10) d.l = l;
    if (h && h > 10) d.h = h;
    d.allege = r.ouverture === 'fenetre' && a != null && a >= 0 ? a : (r.ouverture === 'fenetre' ? d.allege : 0);
    schemaOuverture();
    enregistrer();
  }

  // ---------- MUR SÉLECTIONNÉ ----------
  function rendreMur() {
    var s = E.sel, box = $('#m-contenu');
    var nb = $('#nbSel');
    nb.hidden = !s || !s.nombre;
    nb.textContent = s ? s.nombre : '';
    if (!s || !s.nombre) {
      E.murEdit = null;
      box.innerHTML = '<div class="carte vide"><b>Aucun mur A2M sélectionné</b>' +
        'Sélectionnez un ou plusieurs murs dans le modèle (outil Sélection), puis revenez ici.' +
        (s && s.autres ? '<div class="note">' + s.autres + ' autre(s) objet(s) sélectionné(s) : ce ne sont pas des murs A2M.</div>' : '') +
        '<div style="margin-top:10px"><button class="btn petit" id="m-maj">↻ Actualiser</button></div></div>';
      $('#m-maj').onclick = function () { su.selection(); };
      return;
    }
    var un = s.nombre === 1, m0 = s.murs[0], d = m0.d;
    E.murEdit = un ? copie(d.ouvertures || []) : null;
    var hauteurs = s.murs.map(function (m) { return m.d.h; });
    var memeH = hauteurs.every(function (h) { return h === hauteurs[0]; });
    var r = E.reglages;
    var html = '<div class="carte"><h2>' + (un ? esc(m0.nom) : s.nombre + ' murs sélectionnés') + '</h2>';
    if (un) {
      html += '<div class="chiffres"><div><b>' + fmt(m0.longueur / 100, 2) + '</b><span>longueur (m)</span></div>' +
        '<div><b>' + fmt(d.h / 100, 2) + '</b><span>hauteur (m)</span></div>' +
        '<div><b>' + fmt(ep(d)) + '</b><span>épaisseur (cm)</span></div></div>' +
        '<div class="note" style="margin:-4px 0 10px">' + d.couches.map(function (c) {
          return '<span class="couleur" style="background:' + c.couleur + '"></span>' + esc(c.nom) + ' ' + fmt(c.ep) + ' cm';
        }).join(' &nbsp; ') + '</div>';
    }
    html += '<label class="champ"><span>Type de mur</span><select id="m-type"><option value="-1">— inchangé (' +
      esc(un ? d.type_nom : 'types actuels') + ') —</option>' +
      r.types.map(function (t, i) { return '<option value="' + i + '">' + esc(t.nom) + ' — ' + fmt(ep(t)) + ' cm</option>'; }).join('') +
      '</select></label><div class="ligne">' +
      '<label class="champ"><span>Hauteur</span><div class="unite" data-u="cm"><input type="number" id="m-h" value="' +
      (memeH ? hauteurs[0] : '') + '" placeholder="inchangée"></div></label>' +
      '<label class="champ"><span>Position / trait</span><select id="m-align"><option value="">inchangée</option>' +
      '<option value="droite">À droite</option><option value="centre">Centré</option><option value="gauche">À gauche</option></select></label></div>';
    if (un) {
      html += '<h2 style="margin-top:6px">Ouvertures</h2><div id="m-ouv"></div>' +
        '<button class="btn petit" id="m-ajout" style="margin-top:8px">＋ Ajouter une ouverture</button>' +
        '<div class="note">Position = distance du bord gauche de l\'ouverture depuis le début du mur (cm). ' +
        'Zone possible : ' + fmt(m0.zone[0]) + ' à ' + fmt(m0.zone[1]) + ' cm.</div>';
    } else {
      html += '<div class="note">Les ouvertures se modifient mur par mur (sélectionnez un seul mur).</div>';
    }
    html += '<div id="m-err"></div><button class="btn principal" id="m-ok" style="margin-top:12px">Appliquer</button>' +
      '<div class="note">Si vous changez l\'épaisseur, modifiez aussi les murs voisins pour garder des angles propres.</div></div>';
    box.innerHTML = html;
    if (un) {
      $('#m-align').value = '';
      rendreOuvMur(m0);
      $('#m-ajout').onclick = function () {
        var t = r.ouverture, dm = r.dims[t];
        var pos = Math.max(m0.zone[0], (m0.zone[0] + m0.zone[1] - dm.l) / 2);
        E.murEdit.push({ type: t, pos: Math.round(pos), l: dm.l, h: dm.h, allege: dm.allege });
        rendreOuvMur(m0);
      };
    }
    $('#m-ok').onclick = appliquer;
  }

  function rendreOuvMur() {
    var rows = E.murEdit;
    if (!rows.length) { $('#m-ouv').innerHTML = '<div class="note">Aucune ouverture.</div>'; return; }
    var champ = function (i, k, v) {
      return '<td><input type="number" data-i="' + i + '" data-k="' + k + '" value="' + v + '"' + (k === 'allege' && rows[i].type !== 'fenetre' ? ' disabled' : '') + '></td>';
    };
    $('#m-ouv').innerHTML = '<table><tr><th>Type</th><th>Pos.</th><th>Larg.</th><th>Haut.</th><th>Allège</th><th></th></tr>' +
      rows.map(function (o, i) {
        return '<tr><td style="min-width:96px"><select data-i="' + i + '" data-k="type">' + Object.keys(TYPES_OUV).map(function (t) {
          return '<option value="' + t + '"' + (t === o.type ? ' selected' : '') + '>' + TYPES_OUV[t] + '</option>';
        }).join('') + '</select></td>' + champ(i, 'pos', o.pos) + champ(i, 'l', o.l) + champ(i, 'h', o.h) +
          champ(i, 'allege', o.allege) + '<td><button class="btn icone danger" data-sup="' + i + '" title="Supprimer">✕</button></td></tr>';
      }).join('') + '</table>';
    $$('#m-ouv [data-k]').forEach(function (inp) {
      inp.onchange = function () {
        var o = rows[+inp.dataset.i], k = inp.dataset.k;
        if (k === 'type') {
          o.type = inp.value;
          if (o.type !== 'fenetre') o.allege = 0;
          rendreOuvMur();
        } else {
          var v = num(inp.value);
          if (v != null) o[k] = v;
        }
      };
    });
    $$('#m-ouv [data-sup]').forEach(function (b) {
      b.onclick = function () { rows.splice(+b.dataset.sup, 1); rendreOuvMur(); };
    });
  }

  function appliquer() {
    var r = E.reglages, chg = {};
    var t = +$('#m-type').value;
    if (t >= 0) { chg.couches = r.types[t].couches; chg.type_nom = r.types[t].nom; }
    var h = num($('#m-h').value);
    if (h != null) {
      if (h < 10) return erreursMur(['La hauteur doit faire au moins 10 cm.']);
      chg.h = h;
    }
    if ($('#m-align').value) chg.align = $('#m-align').value;
    if (E.murEdit) chg.ouvertures = E.murEdit;
    erreursMur([]);
    su.appliquer(JSON.stringify(chg));
  }

  function erreursMur(liste) {
    var z = $('#m-err');
    if (!z) return;
    z.innerHTML = liste.length ? '<div class="erreurs"><b>Modification refusée :</b><ul>' +
      liste.map(function (e) { return '<li>' + esc(e) + '</li>'; }).join('') + '</ul></div>' : '';
  }

  // ---------- MÉTRÉ ----------
  function rendreMetre() {
    var q = E.metre, box = $('#q-contenu');
    if (!q) { box.innerHTML = '<div class="carte vide">Calcul en cours…</div>'; return; }
    if (!q.murs.length) {
      box.innerHTML = '<div class="carte vide"><b>Aucun mur A2M dans le modèle</b>Tracez des murs avec l\'onglet « Tracer ».</div>';
      return;
    }
    var long = q.murs.reduce(function (a, m) { return a + m.longueur; }, 0);
    var nbOuv = q.ouvertures.reduce(function (a, o) { return a + o.nombre; }, 0);
    var vol = q.couches.reduce(function (a, c) { return a + c.volume; }, 0);
    var html = '<div class="chiffres"><div><b>' + q.murs.length + '</b><span>murs</span></div>' +
      '<div><b>' + fmt(long, 2) + '</b><span>m linéaires (axe)</span></div>' +
      '<div><b>' + nbOuv + '</b><span>ouvertures</span></div></div>';
    html += '<div class="carte"><h2>Par couche</h2><table><tr><th>Couche</th><th class="n">Ép.</th><th class="n">Nette m²</th><th class="n">Vol. m³</th></tr>' +
      q.couches.map(function (c) {
        return '<tr><td>' + esc(c.nom) + '</td><td class="n">' + fmt(c.ep) + '</td><td class="n">' + fmt(c.nette, 2) +
          '</td><td class="n">' + fmt(c.volume, 3) + '</td></tr>';
      }).join('') + '<tr class="total"><td colspan="3">Volume total</td><td class="n">' + fmt(vol, 3) + '</td></tr></table>' +
      '<div class="note">Surface nette = surface du mur moins les ouvertures.</div></div>';
    html += '<div class="carte"><h2>Ouvertures</h2>' + (q.ouvertures.length ? '<table><tr><th>Type</th><th class="n">L × H (cm)</th><th class="n">Allège</th><th class="n">Nb</th></tr>' +
      q.ouvertures.map(function (o) {
        return '<tr><td>' + esc(o.libelle) + '</td><td class="n">' + fmt(o.l, 0) + ' × ' + fmt(o.h, 0) + '</td><td class="n">' +
          fmt(o.allege, 0) + '</td><td class="n">' + o.nombre + '</td></tr>';
      }).join('') + '</table>' : '<div class="note">Aucune ouverture.</div>') + '</div>';
    box.innerHTML = html;
  }

  // ---------- TYPES ----------
  function rendreTypes() {
    var types = E.typesEdit;
    $('#y-liste').innerHTML = types.map(function (t, i) {
      return '<div class="carte"><div class="ligne" style="align-items:center;margin-bottom:8px">' +
        '<input type="text" data-t="' + i + '" data-k="nom" value="' + esc(t.nom) + '" style="flex:4">' +
        '<span class="note" style="flex:1;text-align:right;margin:0">' + fmt(ep(t)) + ' cm</span>' +
        (types.length > 1 ? '<button class="btn icone danger" data-supt="' + i + '" title="Supprimer ce type" style="flex:0">✕</button>' : '') +
        '</div><table><tr><th></th><th>Couche</th><th class="n">Ép. (cm)</th><th></th></tr>' +
        t.couches.map(function (c, j) {
          return '<tr><td style="width:40px"><input type="color" data-t="' + i + '" data-c="' + j + '" data-k="couleur" value="' + c.couleur + '"></td>' +
            '<td><input type="text" data-t="' + i + '" data-c="' + j + '" data-k="nom" value="' + esc(c.nom) + '"></td>' +
            '<td style="width:70px"><input type="number" step="0.1" min="0.1" data-t="' + i + '" data-c="' + j + '" data-k="ep" value="' + c.ep + '"></td>' +
            '<td style="width:86px;white-space:nowrap">' +
            '<button class="btn icone" data-mv="' + i + ',' + j + ',-1" title="Monter">↑</button>' +
            '<button class="btn icone" data-mv="' + i + ',' + j + ',1" title="Descendre">↓</button>' +
            (t.couches.length > 1 ? '<button class="btn icone danger" data-supc="' + i + ',' + j + '" title="Supprimer">✕</button>' : '') +
            '</td></tr>';
        }).join('') + '</table><button class="btn petit" data-ajc="' + i + '" style="margin-top:6px">＋ Couche</button></div>';
    }).join('');
    $$('#y-liste [data-k]').forEach(function (inp) {
      inp.oninput = function () {
        var t = types[+inp.dataset.t], k = inp.dataset.k;
        var cible = inp.dataset.c != null ? t.couches[+inp.dataset.c] : t;
        cible[k] = k === 'ep' ? (num(inp.value) || 0) : inp.value;
      };
      if (inp.dataset.k === 'ep') inp.onchange = rendreTypes;
    });
    $$('#y-liste [data-supt]').forEach(function (b) { b.onclick = function () { types.splice(+b.dataset.supt, 1); rendreTypes(); }; });
    $$('#y-liste [data-ajc]').forEach(function (b) {
      b.onclick = function () { types[+b.dataset.ajc].couches.push({ nom: 'Nouvelle couche', ep: 5, couleur: '#cccccc' }); rendreTypes(); };
    });
    $$('#y-liste [data-supc]').forEach(function (b) {
      b.onclick = function () { var p = b.dataset.supc.split(','); types[+p[0]].couches.splice(+p[1], 1); rendreTypes(); };
    });
    $$('#y-liste [data-mv]').forEach(function (b) {
      b.onclick = function () {
        var p = b.dataset.mv.split(',').map(Number), c = types[p[0]].couches, j = p[1] + p[2];
        if (j < 0 || j >= c.length) return;
        var x = c[p[1]]; c[p[1]] = c[j]; c[j] = x;
        rendreTypes();
      };
    });
  }

  // ---------- réception depuis Ruby ----------
  function recevoir(m) {
    var d = m.data;
    switch (m.quoi) {
      case 'init':
        E.reglages = d.reglages;
        E.typesEdit = copie(d.reglages.types);
        E.sel = d.selection;
        $('#version').textContent = 'Atelier 2M · version ' + d.version;
        toutRendre();
        montrer(d.onglet || 'tracer');
        break;
      case 'reglages':
        E.reglages = d;
        rendreTracer();
        rendreOuverture();
        break;
      case 'onglet': montrer(d); break;
      case 'selection': E.sel = d; rendreMur(); break;
      case 'metre': E.metre = d; rendreMetre(); break;
      case 'resultat':
        if (d.ok) toast('Mur(s) mis à jour.');
        else erreursMur(d.erreurs);
        break;
      case 'message': toast(d.texte, d.erreur); break;
    }
  }

  function toutRendre() {
    rendreTracer();
    rendreOuverture();
    rendreMur();
    rendreMetre();
    rendreTypes();
  }

  // ---------- événements ----------
  function brancher() {
    $$('#onglets button').forEach(function (b) { b.onclick = function () { montrer(b.dataset.o); }; });
    $('#t-type').onchange = function () { E.reglages.type = +this.value; rendreTracer(); enregistrer(); };
    $('#t-h').onchange = function () {
      var h = num(this.value);
      if (h && h >= 10) { E.reglages.hauteur = h; enregistrer(); } else { this.value = E.reglages.hauteur; }
    };
    $$('#t-align button').forEach(function (b) {
      b.onclick = function () { E.reglages.align = b.dataset.v; rendreTracer(); enregistrer(); };
    });
    $('#t-go').onclick = function () { su.tracer(); };
    $$('#v-type button').forEach(function (b) {
      b.onclick = function () { E.reglages.ouverture = b.dataset.v; rendreOuverture(); enregistrer(); };
    });
    ['#v-l', '#v-h', '#v-a'].forEach(function (s) { $(s).onchange = lireOuverture; });
    $('#v-go').onclick = function () { su.ouverture(); };
    $('#q-calc').onclick = function () { E.metre = null; rendreMetre(); su.metre(); };
    $('#q-csv').onclick = function () { su.csv(); };
    $('#y-ajout').onclick = function () {
      E.typesEdit.push({ nom: 'Nouveau type', couches: [{ nom: 'Maçonnerie', ep: 20, couleur: '#b8b2a7' }] });
      rendreTypes();
    };
    $('#y-save').onclick = function () {
      var vides = E.typesEdit.filter(function (t) { return !t.couches.some(function (c) { return c.ep > 0; }); });
      if (vides.length) return toast('Chaque type doit avoir au moins une couche d\'épaisseur positive.', true);
      E.reglages.types = copie(E.typesEdit);
      if (E.reglages.type >= E.reglages.types.length) E.reglages.type = 0;
      su.reglages(JSON.stringify(E.reglages));
      rendreTracer();
      toast('Types de murs enregistrés.');
    };
  }

  // ---------- aperçu hors SketchUp (données d'exemple) ----------
  function apercu() {
    document.addEventListener('DOMContentLoaded', function () { $('#apercu').hidden = false; });
    var reg = {
      types: [
        { nom: 'Mur doublé : parpaing + isolant + plâtre', couches: [
          { nom: 'Parpaing', ep: 20, couleur: '#b8b2a7' }, { nom: 'Isolant', ep: 10, couleur: '#f0cf55' },
          { nom: 'Plaque de plâtre', ep: 1.3, couleur: '#f3efe7' }] },
        { nom: 'Mur simple parpaing 20', couches: [{ nom: 'Parpaing', ep: 20, couleur: '#b8b2a7' }] },
        { nom: 'Cloison 72/48', couches: [{ nom: 'Cloison plâtre', ep: 7.2, couleur: '#f3efe7' }] }
      ],
      type: 0, hauteur: 250, align: 'centre', ouverture: 'fenetre',
      dims: { porte: { l: 90, h: 215, allege: 0 }, fenetre: { l: 120, h: 135, allege: 90 }, baie: { l: 240, h: 215, allege: 0 } }
    };
    var mur = { nom: 'Mur A2M — Mur doublé — 520 cm', longueur: 520, zone: [0, 520],
      d: { type_nom: reg.types[0].nom, h: 250, align: 'centre', couches: reg.types[0].couches,
        ouvertures: [{ type: 'fenetre', pos: 80, l: 120, h: 135, allege: 90 }, { type: 'porte', pos: 300, l: 90, h: 215, allege: 0 }] } };
    var metre = { murs: [{ longueur: 5.2, couches: [] }, { longueur: 4.1, couches: [] }],
      couches: [{ nom: 'Isolant', ep: 10, nette: 19.1, volume: 1.91 }, { nom: 'Parpaing', ep: 20, nette: 19.7, volume: 3.94 },
        { nom: 'Plaque de plâtre', ep: 1.3, nette: 18.6, volume: 0.242 }],
      ouvertures: [{ libelle: 'Fenêtre', l: 120, h: 135, allege: 90, nombre: 3 }, { libelle: 'Porte', l: 90, h: 215, allege: 0, nombre: 1 }] };
    var rep = function (quoi, data) { setTimeout(function () { recevoir({ quoi: quoi, data: data }); }, 30); };
    var info = function () { toast('Aperçu : cette action fonctionne dans SketchUp.'); };
    return {
      pret: function () { rep('init', { reglages: reg, version: '1.0.0', selection: { nombre: 1, autres: 0, murs: [mur] } }); },
      reglages: function (j) { reg = JSON.parse(j); },
      tracer: info, ouverture: info, csv: info,
      selection: function () { rep('selection', { nombre: 1, autres: 0, murs: [mur] }); },
      appliquer: function () { rep('resultat', { ok: true }); },
      metre: function () { rep('metre', metre); }
    };
  }

  document.addEventListener('DOMContentLoaded', function () {
    brancher();
    su.pret();
  });

  return { recevoir: recevoir };
})();
