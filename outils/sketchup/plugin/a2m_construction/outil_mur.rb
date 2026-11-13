# frozen_string_literal: true
# Outil « Tracer des murs » : cliquer les points, double-clic ou Entrée pour
# finir, clic sur le 1er point pour fermer le contour. Une longueur peut être
# tapée au clavier (ex. 4,50m ou 450) après le 1er point.

module A2M
  module Construction
    class OutilMur
      ORANGE = Sketchup::Color.new(212, 118, 42)
      ALIGNS = %w[droite centre gauche].freeze
      NOMS_ALIGN = { 'droite' => 'à droite du trait', 'centre' => 'centré sur le trait',
                     'gauche' => 'à gauche du trait' }.freeze

      def initialize
        r = Reglages.lire
        @type = r['types'][r['type']]
        @h = r['hauteur'].to_f
        @align = r['align']
        @ip = Sketchup::InputPoint.new
        @ip_prec = Sketchup::InputPoint.new
        @pts = []
      end

      def activate
        Sketchup.vcb_label = 'Longueur'
        statut
      end

      def deactivate(view)
        view.invalidate
      end

      def resume(view)
        statut
        view.invalidate
      end

      def onCancel(_raison, view)
        @pts.clear
        statut
        view.invalidate
      end

      def onMouseMove(_flags, x, y, view)
        choisir(view, x, y)
        view.tooltip = @ip.tooltip if @ip.valid?
        view.invalidate
      end

      def onLButtonDown(_flags, x, y, view)
        if @pts.size >= 3
          p0 = view.screen_coords(monde(@pts.first))
          return terminer(true, view) if Math.hypot(p0.x - x, p0.y - y) < 12
        end
        choisir(view, x, y)
        return unless @ip.valid?

        ajouter(local(@ip.position), view)
        @ip_prec.copy!(@ip)
      end

      def onLButtonDoubleClick(_flags, _x, _y, view)
        terminer(false, view)
      end

      def onReturn(view)
        terminer(false, view)
      end

      def onKeyDown(key, _repeat, _flags, view)
        return false unless key == COPY_MODIFIER_KEY

        @align = ALIGNS[(ALIGNS.index(@align) + 1) % ALIGNS.size]
        r = Reglages.lire
        r['align'] = @align
        Reglages.ecrire(r)
        Panneau.reglages_changes
        statut
        view.invalidate
        true
      end

      # Longueur tapée au clavier, dans la direction de la souris.
      def onUserText(texte, view)
        return UI.beep if @pts.empty?

        long = texte.to_l.to_cm
        dernier = @pts.last
        cur = local(@ip.position)
        u = Geo.unitaire([cur[0] - dernier[0], cur[1] - dernier[1]])
        return UI.beep unless u && long.positive?

        p = [dernier[0] + u[0] * long, dernier[1] + u[1] * long, dernier[2]]
        ajouter(p, view)
        @ip_prec = Sketchup::InputPoint.new(monde(p))
      rescue ArgumentError
        UI.beep
      end

      def draw(view)
        @ip.draw(view) if @ip.valid? && @ip.display?
        return if @pts.empty?

        chaine = @pts + (@ip.valid? ? [horizontal(local(@ip.position))] : [])
        view.line_width = 1
        view.drawing_color = 'gray'
        view.draw(GL_LINE_STRIP, chaine.map { |p| monde(p) }) if chaine.size > 1
        view.line_width = 2
        view.drawing_color = ORANGE
        empreintes(chaine).each { |quad| view.draw(GL_LINE_LOOP, quad.map { |p| monde(p) }) }
        view.draw_points([monde(@pts.first)], 10, 2, ORANGE) if @pts.size >= 3
      end

      def getExtents
        bb = Geom::BoundingBox.new
        @pts.each { |p| bb.add(monde(p)) }
        bb.add(@ip.position) if @ip.valid?
        bb
      end

      private

      def choisir(view, x, y)
        @pts.empty? ? @ip.pick(view, x, y) : @ip.pick(view, x, y, @ip_prec)
      end

      def local(p)
        q = Sketchup.active_model.edit_transform.inverse * p
        [q.x.to_cm, q.y.to_cm, q.z.to_cm]
      end

      def monde(p)
        Sketchup.active_model.edit_transform * Murs.pt(p)
      end

      def horizontal(p)
        @pts.empty? ? p : [p[0], p[1], @pts.first[2]]
      end

      def ajouter(p, view)
        p = horizontal(p)
        return if @pts.any? && Math.hypot(p[0] - @pts.last[0], p[1] - @pts.last[1]) < 0.1

        @pts << p
        statut
        view.invalidate
      end

      def terminer(ferme, view)
        if @pts.size >= 2
          begin
            Murs.creer_chaine(@pts, ferme, @type, @h, @align)
          rescue StandardError => e
            UI.messagebox("A2M Construction : les murs n'ont pas pu être créés.\n#{e.message}")
          end
        end
        @pts = []
        @ip_prec.clear
        statut
        view.invalidate
      end

      # Contour au sol (épaisseur totale) de chaque segment, avec les onglets.
      def empreintes(chaine)
        ep = @type['couches'].sum { |c| c['ep'].to_f }
        (0...chaine.size - 1).map do |i|
          a = chaine[i]
          b = chaine[i + 1]
          d = { 'S' => a, 'E' => b, 'h' => @h, 'align' => @align, 'couches' => [{ 'ep' => ep }],
                'prev' => i.positive? ? [a[0] - chaine[i - 1][0], a[1] - chaine[i - 1][1]] : nil,
                'next' => i < chaine.size - 2 ? [chaine[i + 2][0] - b[0], chaine[i + 2][1] - b[1]] : nil }
          c = Geo.cadre(d)
          k = c[:couches][0]
          [Geo.point(c, k[:b_lo][0], k[:lo], 0), Geo.point(c, k[:b_lo][1], k[:lo], 0),
           Geo.point(c, k[:b_hi][1], k[:hi], 0), Geo.point(c, k[:b_hi][0], k[:hi], 0)]
        end
      end

      def statut
        ep = Geo.fmt(@type['couches'].sum { |c| c['ep'].to_f })
        Sketchup.status_text =
          "A2M — #{@type['nom']} (#{ep} cm), hauteur #{Geo.fmt(@h)} cm, #{NOMS_ALIGN[@align]}. " \
          'Clic : point suivant · Double-clic ou Entrée : terminer · Clic sur le 1er point : fermer · ' \
          'Ctrl : changer de côté · Échap : annuler'
      end
    end
  end
end
