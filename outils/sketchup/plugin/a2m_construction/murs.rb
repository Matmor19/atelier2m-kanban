# frozen_string_literal: true
# Création et reconstruction des murs dans SketchUp.
#
# Chaque mur est un groupe SketchUp qui garde ses données (en centimètres,
# coordonnées locales) dans le dictionnaire d'attributs « A2M_Construction ».
# La géométrie est toujours REFAITE à partir de ces données : modifier une
# ouverture ou la hauteur reconstruit le mur proprement.

require 'json'

module A2M
  module Construction
    module Murs
      DICO = 'A2M_Construction'
      CALQUE_MURS = 'A2M Murs'
      CALQUE_MENUISERIES = 'A2M Menuiseries'
      MATIERES = {
        'cadre' => ['A2M Menuiserie', '#f4f4f2', nil],
        'vitrage' => ['A2M Vitrage', '#9cc7e0', 0.35],
        'vantail' => ['A2M Porte', '#8a5a3b', nil]
      }.freeze

      module_function

      # ---------- données ----------
      def mur?(e)
        e.is_a?(Sketchup::Group) && e.valid? && !e.get_attribute(DICO, 'donnees').nil?
      end

      def donnees(g)
        JSON.parse(g.get_attribute(DICO, 'donnees'))
      rescue StandardError
        nil
      end

      def ecrire(g, d)
        g.set_attribute(DICO, 'donnees', JSON.generate(d))
      end

      def selection(model = Sketchup.active_model)
        model.selection.select { |e| mur?(e) }
      end

      # ---------- outils SketchUp ----------
      def pt(p)
        Geom::Point3d.new(p[0].to_f.cm, p[1].to_f.cm, p[2].to_f.cm)
      end

      def materiau(model, nom, couleur, alpha = nil)
        m = model.materials[nom]
        return m if m

        m = model.materials.add(nom)
        m.color = Sketchup::Color.new(couleur)
        m.alpha = alpha if alpha
        m
      end

      def calque(model, nom)
        model.layers[nom] || model.layers.add(nom)
      end

      # Ajoute des faces décrites par Geo ; renvoie le nombre de faces ratées.
      def ajouter_faces(ents, faces, mat)
        ratees = 0
        faces.each do |f|
          face = ents.add_face(f[:pts].map { |p| pt(p) })
          unless face
            ratees += 1
            next
          end
          face.reverse! if face.normal % Geom::Vector3d.new(*f[:normale]) < 0
          (f[:trous] || []).each do |t|
            trou = ents.add_face(t.map { |p| pt(p) })
            trou.erase! if trou&.valid?
          end
        rescue ArgumentError
          ratees += 1
        end
        ents.grep(Sketchup::Face).each do |face|
          face.material = mat
          face.back_material = mat
        end
        ratees
      end

      # ---------- construction ----------
      def construire(g)
        d = donnees(g)
        return 0 unless d

        g.make_unique if g.definition.instances.size > 1
        model = g.model
        ents = g.entities
        ents.clear!
        c = Geo.cadre(d)
        ratees = 0
        d['couches'].each_with_index do |k, i|
          sg = ents.add_group
          sg.name = "#{k['nom']} #{Geo.fmt(k['ep'])} cm"
          mat = materiau(model, "A2M #{k['nom']}", k['couleur'] || '#cccccc')
          ratees += ajouter_faces(sg.entities, Geo.faces_couche(d, i, c), mat)
        end
        ouvs = d['ouvertures'] || []
        unless ouvs.empty?
          mg = ents.add_group
          mg.name = 'Menuiseries'
          mg.layer = calque(model, CALQUE_MENUISERIES)
          ouvs.each do |ov|
            og = mg.entities.add_group
            og.name = "#{Geo::TYPES_OUVERTURE[ov['type']]} #{Geo.fmt(ov['l'])} × #{Geo.fmt(ov['h'])}"
            Geo.menuiserie(d, ov, c).each do |bx|
              nom, coul, alpha = MATIERES[bx[:role]]
              ratees += ajouter_faces(og.entities, Geo.faces_boite(c, bx), materiau(model, nom, coul, alpha))
            end
          end
        end
        g.name = "Mur A2M — #{d['type_nom']} — #{Geo.fmt(c[:l])} cm"
        warn "A2M Construction : #{ratees} face(s) non créée(s) pour #{g.name}" if ratees.positive?
        ratees
      end

      # Crée une suite de murs à partir de points (cm, repère du contexte actif).
      def creer_chaine(points, ferme, type, h, align)
        pts = points.each_with_object([]) do |p, acc|
          acc << p unless acc.any? && Math.hypot(p[0] - acc.last[0], p[1] - acc.last[1]) < 0.1
        end
        ferme &&= pts.size >= 3
        n = pts.size
        nseg = ferme ? n : n - 1
        return [] if nseg < 1

        dirs = (0...nseg).map do |i|
          a = pts[i]
          b = pts[(i + 1) % n]
          [b[0] - a[0], b[1] - a[1]]
        end
        model = Sketchup.active_model
        model.start_operation('A2M : tracer des murs', true)
        groupes = (0...nseg).map do |i|
          a = pts[i]
          b = pts[(i + 1) % n]
          d = {
            'v' => 1, 'type_nom' => type['nom'],
            'couches' => Reglages.copie(type['couches']),
            'S' => a, 'E' => [b[0], b[1], a[2]], 'h' => h.to_f, 'align' => align,
            'prev' => i.positive? || ferme ? dirs[i - 1] : nil,
            'next' => i < nseg - 1 || ferme ? dirs[(i + 1) % nseg] : nil,
            'ouvertures' => []
          }
          g = model.active_entities.add_group
          ecrire(g, d)
          g.layer = calque(model, CALQUE_MURS)
          construire(g)
          g
        end
        model.commit_operation
        groupes
      rescue StandardError
        model&.abort_operation
        raise
      end

      # Ajoute une ouverture ; renvoie la liste des erreurs (vide si réussi).
      def ajouter_ouverture(g, ov)
        d = donnees(g)
        d['ouvertures'] = (d['ouvertures'] || []) + [ov]
        errs = Geo.erreurs_ouvertures(d)
        return errs unless errs.empty?

        model = g.model
        model.start_operation('A2M : ajouter une ouverture', true)
        ecrire(g, d)
        construire(g)
        model.commit_operation
        []
      end

      # Modifie les murs donnés. chg : 'h', 'couches' + 'type_nom', 'align',
      # 'ouvertures' (un seul mur). Rien n'est modifié en cas d'erreur.
      def modifier(groupes, chg)
        nouv = groupes.map do |g|
          d = donnees(g)
          d['h'] = chg['h'].to_f if chg['h'].to_f.positive?
          if chg['couches']
            d['couches'] = Reglages.copie(chg['couches'])
            d['type_nom'] = chg['type_nom']
          end
          d['align'] = chg['align'] if %w[gauche centre droite].include?(chg['align'])
          d['ouvertures'] = chg['ouvertures'] if chg['ouvertures'] && groupes.size == 1
          [g, d]
        end
        errs = nouv.flat_map do |g, d|
          e = Geo.erreurs_ouvertures(d)
          groupes.size > 1 ? e.map { |m| "#{g.name} : #{m}" } : e
        end
        return errs unless errs.empty?

        model = Sketchup.active_model
        model.start_operation('A2M : modifier les murs', true)
        nouv.each do |g, d|
          ecrire(g, d)
          construire(g)
        end
        model.commit_operation
        []
      end

      # Parcourt tous les murs du modèle (y compris dans des groupes/composants).
      def chaque_mur(ents = Sketchup.active_model.entities, prof = 0, &blk)
        return if prof > 20

        ents.each do |e|
          if mur?(e)
            blk.call(e)
          elsif e.is_a?(Sketchup::Group)
            chaque_mur(e.entities, prof + 1, &blk)
          elsif e.is_a?(Sketchup::ComponentInstance)
            chaque_mur(e.definition.entities, prof + 1, &blk)
          end
        end
      end
    end
  end
end
