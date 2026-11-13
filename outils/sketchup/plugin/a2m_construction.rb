# frozen_string_literal: true
# A2M Construction — extension SketchUp de l'Atelier 2M.
# Murs paramétriques (simples ou multicouches), portes et fenêtres, métré.
# Fonctionne entièrement en local : aucune licence, aucun serveur.

require 'sketchup.rb'
require 'extensions.rb'

module A2M
  module Construction
    unless file_loaded?(__FILE__)
      ext = SketchupExtension.new('A2M Construction', File.join(__dir__, 'a2m_construction', 'main'))
      ext.version     = '1.0.0'
      ext.creator     = 'Atelier 2M'
      ext.copyright   = '© 2026 Atelier 2M'
      ext.description = 'Murs paramétriques simples ou multicouches, portes et fenêtres ' \
                        'découpées automatiquement, métré exportable en CSV. 100 % local.'
      Sketchup.register_extension(ext, true)
      file_loaded(__FILE__)
    end
  end
end
