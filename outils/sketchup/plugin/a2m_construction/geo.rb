# frozen_string_literal: true
# A2M Construction — calculs géométriques (Atelier 2M).
#
# Ce fichier ne dépend PAS de SketchUp : il travaille avec de simples tableaux
# de nombres, en centimètres. Il peut donc être testé en dehors de SketchUp
# (voir outils/sketchup/tests/test_geo.rb).
#
# Repère d'un mur : S = point de départ, u = direction du tracé (horizontale),
# n = normale à GAUCHE du tracé, z = vertical. Un point du mur est repéré par
#   s = distance le long du tracé depuis S,
#   o = décalage latéral (positif vers la gauche),
#   z = hauteur au-dessus de S.

module A2M
  module Construction
    module Geo
      EPS = 1e-6
      CADRE = 5.0        # largeur des montants de menuiserie (cm)
      PROF_CADRE = 7.0   # profondeur du dormant (cm)
      JEU_HAUT = 1.0     # une ouverture doit s'arrêter au moins 1 cm sous le haut du mur

      TYPES_OUVERTURE = {
        'porte'   => 'Porte',
        'fenetre' => 'Fenêtre',
        'baie'    => 'Porte-fenêtre'
      }.freeze

      module_function

      # ---------- vecteurs 2D ----------
      def unitaire(v)
        l = Math.hypot(v[0], v[1])
        l < EPS ? nil : [v[0] / l, v[1] / l]
      end

      def gauche(u)
        [-u[1], u[0]]
      end

      def vect(a, b)
        a[0] * b[1] - a[1] * b[0]
      end

      def scal(a, b)
        a[0] * b[0] + a[1] * b[1]
      end

      # ---------- couches ----------
      # Décalages [o_bas, o_haut] de chaque couche. La 1re couche est du côté
      # DROIT du tracé. align : 'gauche' (le mur est à gauche du trait),
      # 'droite' ou 'centre'.
      def decalages(epaisseurs, align)
        t = epaisseurs.sum.to_f
        o = case align
            when 'gauche' then 0.0
            when 'droite' then -t
            else -t / 2.0
            end
        epaisseurs.map do |e|
          r = [o, o + e.to_f]
          o += e.to_f
          r
        end
      end

      def epaisseur(d)
        d['couches'].sum { |c| c['ep'].to_f }
      end

      # ---------- jonctions en onglet ----------
      # Deux segments consécutifs de directions u1 puis u2 se rejoignent en un
      # point commun P. Pour une ligne décalée de o, renvoie [lambda, mu] :
      #   lambda = allongement (+) ou raccourcissement (-) de la fin du 1er segment,
      #   mu     = position du début du 2e segment, mesurée depuis P.
      # Au-delà de « limite » (angle très aigu) ou pour des segments alignés : [0, 0].
      def jonction(u1, u2, o, limite)
        n1 = gauche(u1)
        n2 = gauche(u2)
        r = [o * (n2[0] - n1[0]), o * (n2[1] - n1[1])]
        b = [-u2[0], -u2[1]]
        det = vect(u1, b)
        return [0.0, 0.0] if det.abs < 1e-6

        lam = vect(r, b) / det
        mu = vect(u1, r) / det
        return [0.0, 0.0] if lam.abs > limite || mu.abs > limite

        [lam, mu]
      end

      # ---------- description complète d'un mur ----------
      # d : données du mur (voir Murs) ; renvoie un Hash de calcul.
      def cadre(d)
        s = d['S']
        e = d['E']
        l = Math.hypot(e[0] - s[0], e[1] - s[1])
        u = unitaire([e[0] - s[0], e[1] - s[1]]) || [1.0, 0.0]
        n = gauche(u)
        prev = d['prev'] && unitaire(d['prev'])
        nxt = d['next'] && unitaire(d['next'])
        eps = d['couches'].map { |c| c['ep'].to_f }
        limite = [eps.sum * 5, 1.0].max
        couches = decalages(eps, d['align']).map do |lo, hi|
          bornes = [lo, hi].map do |o|
            s0 = prev ? jonction(prev, u, o, limite)[1] : 0.0
            s1 = l + (nxt ? jonction(u, nxt, o, limite)[0] : 0.0)
            [s0, s1]
          end
          { lo: lo, hi: hi, b_lo: bornes[0], b_hi: bornes[1] }
        end
        zone_debut = couches.map { |c| [c[:b_lo][0], c[:b_hi][0]].max }.max || 0.0
        zone_fin = couches.map { |c| [c[:b_lo][1], c[:b_hi][1]].min }.min || l
        { S: s, u: u, n: n, l: l, h: d['h'].to_f, couches: couches,
          zone: [zone_debut, zone_fin] }
      end

      def point(c, s, o, z)
        st = c[:S]
        [st[0] + c[:u][0] * s + c[:n][0] * o,
         st[1] + c[:u][1] * s + c[:n][1] * o,
         (st[2] || 0.0).to_f + z.to_f]
      end

      # ---------- ouvertures ----------
      def haut_ouv(ouv)
        ouv['allege'].to_f + ouv['h'].to_f
      end

      # Renvoie nil si l'ouverture est correcte, sinon un message en français.
      def erreur_ouverture(d, ouv, c = cadre(d))
        nom = TYPES_OUVERTURE[ouv['type']]
        return "type d'ouverture inconnu (#{ouv['type']})" unless nom
        return "#{nom} : largeur trop petite (minimum #{(CADRE * 2 + 1).round} cm)" if ouv['l'].to_f < CADRE * 2 + 1
        return "#{nom} : hauteur trop petite" if ouv['h'].to_f < CADRE * 2 + 1
        return "#{nom} : allège négative" if ouv['allege'].to_f.negative?
        if haut_ouv(ouv) > c[:h] - JEU_HAUT
          return "#{nom} : trop haute pour le mur (allège + hauteur = #{fmt(haut_ouv(ouv))} cm, " \
                 "mur = #{fmt(c[:h])} cm)"
        end
        a = ouv['pos'].to_f
        b = a + ouv['l'].to_f
        if a < c[:zone][0] - EPS || b > c[:zone][1] + EPS
          return "#{nom} : dépasse du mur (position possible de #{fmt(c[:zone][0])} " \
                 "à #{fmt(c[:zone][1] - ouv['l'].to_f)} cm)"
        end
        nil
      end

      # Erreurs de l'ensemble des ouvertures (dont les chevauchements).
      def erreurs_ouvertures(d)
        c = cadre(d)
        liste = d['ouvertures'] || []
        errs = liste.each_with_index.map do |o, i|
          e = erreur_ouverture(d, o, c)
          e && "Ouverture #{i + 1} — #{e}"
        end.compact
        tri = liste.each_with_index.sort_by { |o, _| o['pos'].to_f }
        tri.each_cons(2) do |(o1, i1), (o2, i2)|
          next unless o1['pos'].to_f + o1['l'].to_f > o2['pos'].to_f + EPS

          errs << "Les ouvertures #{i1 + 1} et #{i2 + 1} se chevauchent"
        end
        errs
      end

      # Position (bord gauche) pour centrer une ouverture de largeur l sur s,
      # en restant dans le mur et sans toucher les autres ouvertures.
      # nil si impossible.
      def placer(d, s_centre, l)
        c = cadre(d)
        z0, z1 = c[:zone]
        return nil if l > z1 - z0 + EPS

        pos = (s_centre - l / 2.0).clamp(z0, z1 - l)
        conflit = (d['ouvertures'] || []).any? do |o|
          pos < o['pos'].to_f + o['l'].to_f - EPS && pos + l > o['pos'].to_f + EPS
        end
        conflit ? nil : pos.round(1)
      end

      # ---------- faces d'une couche ----------
      # Chaque face : { pts: [[x,y,z],...], normale: [x,y,z], trous: [[...]] }
      def faces_couche(d, idx, c = cadre(d))
        k = c[:couches][idx]
        lo = k[:lo]
        hi = k[:hi]
        h = c[:h]
        u3 = [c[:u][0], c[:u][1], 0.0]
        n3 = [c[:n][0], c[:n][1], 0.0]
        neg = ->(v) { v.map(&:-@) }
        ouvs = (d['ouvertures'] || []).sort_by { |o| o['pos'].to_f }
        portes = ouvs.select { |o| o['allege'].to_f < EPS }
        fenetres = ouvs - portes
        faces = []

        # Les deux grandes faces (côté lo puis côté hi).
        [[lo, k[:b_lo], neg.call(n3)], [hi, k[:b_hi], n3]].each do |o, (s0, s1), nrm|
          contour = [point(c, s0, o, 0)]
          portes.each do |p|
            a = p['pos'].to_f
            b = a + p['l'].to_f
            zt = haut_ouv(p)
            contour << point(c, a, o, 0) << point(c, a, o, zt) << point(c, b, o, zt) << point(c, b, o, 0)
          end
          contour << point(c, s1, o, 0) << point(c, s1, o, h) << point(c, s0, o, h)
          trous = fenetres.map do |f|
            a = f['pos'].to_f
            b = a + f['l'].to_f
            z1 = f['allege'].to_f
            z2 = haut_ouv(f)
            [point(c, a, o, z1), point(c, b, o, z1), point(c, b, o, z2), point(c, a, o, z2)]
          end
          faces << { pts: contour, normale: nrm, trous: trous }
        end

        # Dessus.
        faces << { pts: [point(c, k[:b_lo][0], lo, h), point(c, k[:b_lo][1], lo, h),
                         point(c, k[:b_hi][1], hi, h), point(c, k[:b_hi][0], hi, h)],
                   normale: [0.0, 0.0, 1.0] }

        # Dessous, coupé par les portes.
        bords = [[k[:b_lo][0], k[:b_hi][0]]]
        portes.each do |p|
          a = p['pos'].to_f
          bords << [a, a] << [a + p['l'].to_f, a + p['l'].to_f]
        end
        bords << [k[:b_lo][1], k[:b_hi][1]]
        bords.each_slice(2) do |(g_lo, g_hi), (d_lo, d_hi)|
          faces << { pts: [point(c, g_lo, lo, 0), point(c, d_lo, lo, 0),
                           point(c, d_hi, hi, 0), point(c, g_hi, hi, 0)],
                     normale: [0.0, 0.0, -1.0] }
        end

        # Extrémités (coupes d'onglet).
        faces << { pts: [point(c, k[:b_lo][0], lo, 0), point(c, k[:b_hi][0], hi, 0),
                         point(c, k[:b_hi][0], hi, h), point(c, k[:b_lo][0], lo, h)],
                   normale: neg.call(u3) }
        faces << { pts: [point(c, k[:b_lo][1], lo, 0), point(c, k[:b_hi][1], hi, 0),
                         point(c, k[:b_hi][1], hi, h), point(c, k[:b_lo][1], lo, h)],
                   normale: u3 }

        # Tableaux, linteaux et appuis des ouvertures.
        ouvs.each do |ov|
          a = ov['pos'].to_f
          b = a + ov['l'].to_f
          z1 = ov['allege'].to_f
          z2 = haut_ouv(ov)
          faces << { pts: [point(c, a, lo, z1), point(c, a, hi, z1), point(c, a, hi, z2), point(c, a, lo, z2)],
                     normale: u3 }
          faces << { pts: [point(c, b, lo, z1), point(c, b, hi, z1), point(c, b, hi, z2), point(c, b, lo, z2)],
                     normale: neg.call(u3) }
          faces << { pts: [point(c, a, lo, z2), point(c, b, lo, z2), point(c, b, hi, z2), point(c, a, hi, z2)],
                     normale: [0.0, 0.0, -1.0] }
          next if z1 < EPS

          faces << { pts: [point(c, a, lo, z1), point(c, b, lo, z1), point(c, b, hi, z1), point(c, a, hi, z1)],
                     normale: [0.0, 0.0, 1.0] }
        end
        nettoyer(faces)
      end

      # Retire les points répétés (ouverture collée au bout du mur, etc.)
      # et les faces devenues plates.
      def nettoyer(faces)
        meme = ->(p, q) { p.zip(q).all? { |a, b| (a - b).abs < 1e-4 } }
        faces.filter_map do |f|
          pts = f[:pts].each_with_object([]) { |p, acc| acc << p unless acc.any? && meme.call(acc.last, p) }
          pts.pop while pts.size > 1 && meme.call(pts.first, pts.last)
          next nil if pts.size < 3

          f.merge(pts: pts)
        end
      end

      # ---------- menuiseries simples ----------
      # Liste de boîtes { role:, s: [a,b], o: [o1,o2], z: [z1,z2] }.
      def menuiserie(d, ov, c = cadre(d))
        t_lo = c[:couches].first[:lo]
        t_hi = c[:couches].last[:hi]
        milieu = (t_lo + t_hi) / 2.0
        prof = [PROF_CADRE, t_hi - t_lo].min
        oc = [milieu - prof / 2, milieu + prof / 2]
        a = ov['pos'].to_f
        b = a + ov['l'].to_f
        z1 = ov['allege'].to_f
        z2 = haut_ouv(ov)
        m = CADRE
        bas = ov['type'] == 'porte' ? z1 : z1 + m
        boites = [
          { role: 'cadre', s: [a, a + m], o: oc, z: [z1, z2] },
          { role: 'cadre', s: [b - m, b], o: oc, z: [z1, z2] },
          { role: 'cadre', s: [a + m, b - m], o: oc, z: [z2 - m, z2] }
        ]
        boites << { role: 'cadre', s: [a + m, b - m], o: oc, z: [z1, z1 + m] } unless ov['type'] == 'porte'
        if ov['type'] == 'porte'
          boites << { role: 'vantail', s: [a + m, b - m], o: [milieu - 2, milieu + 2], z: [bas, z2 - m] }
        else
          boites << { role: 'vitrage', s: [a + m, b - m], o: [milieu - 1, milieu + 1], z: [bas, z2 - m] }
        end
        boites
      end

      def faces_boite(c, bx)
        s0, s1 = bx[:s]
        o0, o1 = bx[:o]
        z0, z1 = bx[:z]
        p = ->(s, o, z) { point(c, s, o, z) }
        u3 = [c[:u][0], c[:u][1], 0.0]
        n3 = [c[:n][0], c[:n][1], 0.0]
        [
          { pts: [p[s0, o0, z0], p[s1, o0, z0], p[s1, o1, z0], p[s0, o1, z0]], normale: [0.0, 0.0, -1.0] },
          { pts: [p[s0, o0, z1], p[s1, o0, z1], p[s1, o1, z1], p[s0, o1, z1]], normale: [0.0, 0.0, 1.0] },
          { pts: [p[s0, o0, z0], p[s1, o0, z0], p[s1, o0, z1], p[s0, o0, z1]], normale: n3.map(&:-@) },
          { pts: [p[s0, o1, z0], p[s1, o1, z0], p[s1, o1, z1], p[s0, o1, z1]], normale: n3 },
          { pts: [p[s0, o0, z0], p[s0, o1, z0], p[s0, o1, z1], p[s0, o0, z1]], normale: u3.map(&:-@) },
          { pts: [p[s1, o0, z0], p[s1, o1, z0], p[s1, o1, z1], p[s1, o0, z1]], normale: u3 }
        ]
      end

      # ---------- métré ----------
      # Quantités d'un mur, par couche (unités : m, m², m³).
      def metre(d)
        c = cadre(d)
        ouvs = d['ouvertures'] || []
        trous_cm2 = ouvs.sum { |o| o['l'].to_f * o['h'].to_f }
        couches = c[:couches].each_with_index.map do |k, i|
          info = d['couches'][i]
          long = ((k[:b_lo][1] - k[:b_lo][0]) + (k[:b_hi][1] - k[:b_hi][0])) / 2.0
          brute = long * c[:h]
          nette = brute - trous_cm2
          { 'nom' => info['nom'], 'ep' => info['ep'].to_f,
            'longueur' => long / 100.0, 'brute' => brute / 10_000.0,
            'ouvertures' => trous_cm2 / 10_000.0, 'nette' => nette / 10_000.0,
            'volume' => nette * info['ep'].to_f / 1_000_000.0 }
        end
        { 'longueur' => c[:l] / 100.0, 'hauteur' => c[:h] / 100.0, 'couches' => couches,
          'ouvertures' => ouvs.map { |o| o.slice('type', 'l', 'h', 'allege') } }
      end

      def fmt(x)
        r = x.to_f.round(1)
        (r == r.round ? r.round.to_s : r.to_s).tr('.', ',')
      end
    end
  end
end
