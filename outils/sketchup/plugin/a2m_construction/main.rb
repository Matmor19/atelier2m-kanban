# frozen_string_literal: true
# A2M Construction — chargement, menu, barre d'outils et clic droit.

module A2M
  module Construction
    DIR = __dir__
    VERSION = '1.0.0'

    %w[geo reglages murs outil_mur outil_ouverture metre panneau].each do |f|
      require File.join(DIR, f)
    end

    def self.icone(nom)
      File.join(DIR, 'icones', "#{nom}.svg")
    end

    def self.commande(titre, icone, aide, &blk)
      cmd = UI::Command.new(titre, &blk)
      cmd.small_icon = icone(icone)
      cmd.large_icon = icone(icone)
      cmd.tooltip = titre
      cmd.status_bar_text = aide
      cmd
    end

    unless file_loaded?(__FILE__)
      cmds = [
        commande('Tracer des murs', 'mur', 'Tracer des murs point par point (type et hauteur : panneau A2M).') do
          Sketchup.active_model.select_tool(OutilMur.new)
        end,
        commande('Ajouter une porte ou une fenêtre', 'ouverture', 'Cliquer sur un mur A2M pour y placer une ouverture.') do
          Sketchup.active_model.select_tool(OutilOuverture.new)
        end,
        commande('Modifier le mur sélectionné', 'modifier', 'Hauteur, type de mur et ouvertures du mur sélectionné.') do
          Panneau.ouvrir('mur')
        end,
        commande('Métré', 'metre', 'Quantités des murs et des ouvertures, export CSV.') do
          Panneau.ouvrir('metre')
        end,
        commande('Panneau A2M Construction', 'panneau', 'Réglages, types de murs et dimensions des ouvertures.') do
          Panneau.ouvrir
        end
      ]

      menu = UI.menu('Extensions').add_submenu('A2M Construction')
      cmds.each { |c| menu.add_item(c) }

      barre = UI::Toolbar.new('A2M Construction')
      cmds.each { |c| barre.add_item(c) }
      barre.get_last_state == TB_NEVER_SHOWN ? barre.show : barre.restore

      UI.add_context_menu_handler do |m|
        next if Murs.selection.empty?

        sous = m.add_submenu('A2M Construction')
        sous.add_item(cmds[2])
        sous.add_item(cmds[1])
      end

      file_loaded(__FILE__)
    end
  end
end
