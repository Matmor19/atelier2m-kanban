# frozen_string_literal: true
# Panneau « A2M Construction » (fenêtre HTML dans SketchUp).
# Communication : la page appelle sketchup.<action>(json) ; Ruby répond par
# A2M.recevoir({quoi:, data:}).

require 'json'

module A2M
  module Construction
    module Panneau
      # Prévient le panneau quand la sélection change.
      class Observateur < Sketchup::SelectionObserver
        def onSelectionBulkChange(_sel)
          Panneau.selection_changee
        end

        def onSelectionCleared(_sel)
          Panneau.selection_changee
        end
      end

      module_function

      def ouvrir(onglet = nil)
        if @dlg&.visible?
          @dlg.bring_to_front
          envoyer('onglet', onglet) if onglet
          return
        end
        @onglet = onglet
        @dlg = UI::HtmlDialog.new(
          dialog_title: 'A2M Construction', preferences_key: 'A2M_Construction_Panneau',
          scrollable: true, resizable: true, width: 440, height: 720, min_width: 360, min_height: 420,
          style: UI::HtmlDialog::STYLE_DIALOG
        )
        @dlg.set_file(File.join(DIR, 'ui', 'panneau.html'))
        brancher(@dlg)
        observer
        @dlg.show
      end

      def observer
        model = Sketchup.active_model
        return if @observe == model

        @obs ||= Observateur.new
        model.selection.add_observer(@obs)
        @observe = model
      end

      def envoyer(quoi, data)
        return unless @dlg&.visible?

        @dlg.execute_script("A2M.recevoir(#{JSON.generate({ 'quoi' => quoi, 'data' => data })})")
      end

      def reglages_changes
        envoyer('reglages', Reglages.lire)
      end

      def selection_changee
        envoyer('selection', etat_selection)
      end

      def etat_selection
        model = Sketchup.active_model
        murs = Murs.selection(model)
        {
          'nombre' => murs.size,
          'autres' => model.selection.size - murs.size,
          'murs' => murs.first(50).map do |g|
            d = Murs.donnees(g)
            c = Geo.cadre(d)
            { 'nom' => g.name, 'd' => d, 'longueur' => c[:l], 'zone' => c[:zone] }
          end
        }
      end

      def lire_json(txt)
        JSON.parse(txt.to_s)
      rescue JSON::ParserError
        {}
      end

      def brancher(dlg)
        dlg.add_action_callback('pret') do |_ctx|
          observer
          envoyer('init', { 'reglages' => Reglages.lire, 'version' => VERSION,
                            'onglet' => @onglet, 'selection' => etat_selection })
        end
        dlg.add_action_callback('reglages') do |_ctx, txt|
          envoyer('reglages', Reglages.ecrire(lire_json(txt)))
        rescue StandardError => e
          envoyer('message', { 'erreur' => true, 'texte' => "Réglages non enregistrés : #{e.message}" })
        end
        dlg.add_action_callback('tracer') do |_ctx|
          Sketchup.active_model.select_tool(OutilMur.new)
          Sketchup.focus if Sketchup.respond_to?(:focus)
        end
        dlg.add_action_callback('ouverture') do |_ctx|
          Sketchup.active_model.select_tool(OutilOuverture.new)
          Sketchup.focus if Sketchup.respond_to?(:focus)
        end
        dlg.add_action_callback('selection') { |_ctx| selection_changee }
        dlg.add_action_callback('appliquer') do |_ctx, txt|
          murs = Murs.selection
          if murs.empty?
            envoyer('resultat', { 'ok' => false, 'erreurs' => ['Aucun mur A2M sélectionné.'] })
          else
            errs = Murs.modifier(murs, lire_json(txt))
            envoyer('resultat', { 'ok' => errs.empty?, 'erreurs' => errs })
            selection_changee if errs.empty?
          end
        rescue StandardError => e
          envoyer('resultat', { 'ok' => false, 'erreurs' => ["Erreur : #{e.message}"] })
        end
        dlg.add_action_callback('metre') { |_ctx| envoyer('metre', Metre.calculer) }
        dlg.add_action_callback('csv') do |_ctx|
          chemin = Metre.exporter
          envoyer('message', { 'texte' => "Métré enregistré : #{chemin}" }) if chemin
        rescue StandardError => e
          envoyer('message', { 'erreur' => true, 'texte' => "Export impossible : #{e.message}" })
        end
      end
    end
  end
end
