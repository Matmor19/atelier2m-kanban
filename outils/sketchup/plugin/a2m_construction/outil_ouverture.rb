# frozen_string_literal: true
# Outil « Ajouter une ouverture » : survoler un mur A2M, cliquer pour placer
# la porte / fenêtre centrée sur la souris. Ctrl change de type.

module A2M
  module Construction
    class OutilOuverture
      VERT = Sketchup::Color.new(31, 157, 85)
      ROUGE = Sketchup::Color.new(212, 43, 43)
      TYPES = Geo::TYPES_OUVERTURE.keys.freeze

      def initialize
        @ip = Sketchup::InputPoint.new
        charger(Reglages.lire['ouverture'])
      end

      def activate
        statut
      end

      def deactivate(view)
        view.invalidate
      end

      def resume(view)
        charger(@ov['type'])
        statut
        view.invalidate
      end

      def onMouseMove(_flags, x, y, view)
        @ip.pick(view, x, y)
        @cible = chercher(view, x, y)
        statut
        view.invalidate
      end

      def onLButtonDown(_flags, x, y, view)
        @ip.pick(view, x, y)
        @cible = chercher(view, x, y)
        return UI.beep unless @cible

        if @cible[:pos].nil?
          UI.messagebox("Pas assez de place à cet endroit pour : #{libelle}.")
          return
        end
        errs = Murs.ajouter_ouverture(@cible[:g], @ov.merge('pos' => @cible[:pos]))
        UI.messagebox("Ouverture refusée :\n• #{errs.join("\n• ")}") unless errs.empty?
        Panneau.selection_changee
        view.invalidate
      end

      def onKeyDown(key, _repeat, _flags, view)
        return false unless key == COPY_MODIFIER_KEY

        charger(TYPES[(TYPES.index(@ov['type']) + 1) % TYPES.size])
        r = Reglages.lire
        r['ouverture'] = @ov['type']
        Reglages.ecrire(r)
        Panneau.reglages_changes
        statut
        view.invalidate
        true
      end

      def draw(view)
        return unless @cible

        c = @cible[:c]
        pos = @cible[:pos] || (@cible[:s] - @ov['l'].to_f / 2)
        a = pos
        b = pos + @ov['l'].to_f
        z1 = @ov['allege'].to_f
        z2 = z1 + @ov['h'].to_f
        view.line_width = 3
        view.drawing_color = @cible[:pos] ? VERT : ROUGE
        [c[:couches].first[:lo], c[:couches].last[:hi]].each do |o|
          rect = [[a, z1], [b, z1], [b, z2], [a, z2]].map do |s, z|
            @cible[:tr] * Murs.pt(Geo.point(c, s, o, z))
          end
          view.draw(GL_LINE_LOOP, rect)
        end
      end

      private

      def charger(type)
        type = 'fenetre' unless TYPES.include?(type)
        @ov = { 'type' => type }.merge(Reglages.lire['dims'][type])
      end

      def libelle
        "#{Geo::TYPES_OUVERTURE[@ov['type']]} #{Geo.fmt(@ov['l'])} × #{Geo.fmt(@ov['h'])} cm" \
          "#{@ov['allege'].to_f.positive? ? ", allège #{Geo.fmt(@ov['allege'])} cm" : ''}"
      end

      # Mur A2M sous la souris : groupe, transformation, position proposée.
      def chercher(view, x, y)
        return nil unless @ip.valid?

        ph = view.pick_helper
        ph.do_pick(x, y)
        ph.count.times do |i|
          chemin = ph.path_at(i)
          next unless chemin

          idx = chemin.index { |e| Murs.mur?(e) }
          next unless idx

          g = chemin[idx]
          tr = chemin[0..idx].inject(Geom::Transformation.new) do |t, e|
            e.respond_to?(:transformation) ? t * e.transformation : t
          end
          d = Murs.donnees(g)
          next unless d

          c = Geo.cadre(d)
          loc = tr.inverse * @ip.position
          s = Geo.scal([loc.x.to_cm - c[:S][0], loc.y.to_cm - c[:S][1]], c[:u])
          return { g: g, tr: tr, d: d, c: c, s: s, pos: Geo.placer(d, s, @ov['l'].to_f) }
        end
        nil
      end

      def statut
        etat = if @cible.nil? then 'Survolez un mur A2M.'
               elsif @cible[:pos] then 'Cliquez pour placer.'
               else 'Pas assez de place ici.'
               end
        Sketchup.status_text = "A2M — #{libelle}. #{etat} Ctrl : changer de type · " \
                               'Dimensions : panneau A2M, onglet « Ouverture ».'
      end
    end
  end
end
