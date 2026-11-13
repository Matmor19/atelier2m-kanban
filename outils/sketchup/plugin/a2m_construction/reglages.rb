# frozen_string_literal: true
# Réglages de A2M Construction, enregistrés dans un petit fichier JSON
# sur l'ordinateur (dossier %APPDATA%\A2M_Construction sous Windows).

require 'json'
require 'fileutils'

module A2M
  module Construction
    module Reglages
      # Couches : la 1re est du côté DROIT du sens de tracé
      # (côté extérieur si l'on dessine le contour dans le sens inverse des aiguilles d'une montre).
      DEFAUT = {
        'types' => [
          { 'nom' => 'Mur doublé : parpaing + isolant + plâtre',
            'couches' => [
              { 'nom' => 'Parpaing', 'ep' => 20, 'couleur' => '#b8b2a7' },
              { 'nom' => 'Isolant', 'ep' => 10, 'couleur' => '#f0cf55' },
              { 'nom' => 'Plaque de plâtre', 'ep' => 1.3, 'couleur' => '#f3efe7' }
            ] },
          { 'nom' => 'Mur simple parpaing 20',
            'couches' => [{ 'nom' => 'Parpaing', 'ep' => 20, 'couleur' => '#b8b2a7' }] },
          { 'nom' => 'Ossature bois',
            'couches' => [
              { 'nom' => 'Bardage bois', 'ep' => 2.2, 'couleur' => '#a9744a' },
              { 'nom' => 'Ossature + isolant', 'ep' => 14.5, 'couleur' => '#e8c27a' },
              { 'nom' => 'Plaque de plâtre', 'ep' => 1.3, 'couleur' => '#f3efe7' }
            ] },
          { 'nom' => 'Cloison 72/48',
            'couches' => [{ 'nom' => 'Cloison plâtre', 'ep' => 7.2, 'couleur' => '#f3efe7' }] }
        ],
        'type' => 0,
        'hauteur' => 250,
        'align' => 'centre',
        'ouverture' => 'fenetre',
        'dims' => {
          'porte' => { 'l' => 90, 'h' => 215, 'allege' => 0 },
          'fenetre' => { 'l' => 120, 'h' => 135, 'allege' => 90 },
          'baie' => { 'l' => 240, 'h' => 215, 'allege' => 0 }
        }
      }.freeze

      module_function

      def dossier
        base = ENV['APPDATA'] || ENV['HOME'] || Dir.home
        File.join(base, 'A2M_Construction')
      end

      def fichier
        File.join(dossier, 'reglages.json')
      end

      def copie(obj)
        JSON.parse(JSON.generate(obj))
      end

      # Réglages enregistrés, complétés par les valeurs par défaut.
      def lire
        r = copie(DEFAUT)
        if File.exist?(fichier)
          lu = JSON.parse(File.read(fichier, encoding: 'UTF-8'))
          r.merge!(lu.slice(*r.keys)) if lu.is_a?(Hash)
          r['dims'] = copie(DEFAUT['dims']).merge(r['dims'] || {})
        end
        nettoyer(r)
      rescue StandardError => e
        warn "A2M Construction : réglages illisibles (#{e.message}), valeurs par défaut utilisées."
        copie(DEFAUT)
      end

      def ecrire(r)
        r = nettoyer(copie(r))
        FileUtils.mkdir_p(dossier)
        File.write(fichier, JSON.pretty_generate(r), encoding: 'UTF-8')
        r
      end

      # Garde-fous : au moins un type, des épaisseurs positives, etc.
      def nettoyer(r)
        types = Array(r['types']).select { |t| t.is_a?(Hash) }.map do |t|
          couches = Array(t['couches']).select { |c| c.is_a?(Hash) && c['ep'].to_f.positive? }.map do |c|
            { 'nom' => c['nom'].to_s.strip.empty? ? 'Couche' : c['nom'].to_s.strip,
              'ep' => c['ep'].to_f.round(2),
              'couleur' => c['couleur'].to_s =~ /\A#\h{6}\z/ ? c['couleur'] : '#cccccc' }
          end
          next nil if couches.empty?

          { 'nom' => t['nom'].to_s.strip.empty? ? 'Type sans nom' : t['nom'].to_s.strip, 'couches' => couches }
        end.compact
        r['types'] = types.empty? ? copie(DEFAUT['types']) : types
        r['type'] = r['type'].to_i.clamp(0, r['types'].size - 1)
        r['hauteur'] = r['hauteur'].to_f.positive? ? r['hauteur'].to_f : 250.0
        r['align'] = 'centre' unless %w[gauche centre droite].include?(r['align'])
        r['ouverture'] = 'fenetre' unless Geo::TYPES_OUVERTURE.key?(r['ouverture'])
        r
      end
    end
  end
end
