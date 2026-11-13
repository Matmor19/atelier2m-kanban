# frozen_string_literal: true
# Métré : quantités de tous les murs A2M du modèle, export CSV (Excel).

module A2M
  module Construction
    module Metre
      module_function

      def nombre(x, dec = 2)
        format("%.#{dec}f", x.to_f).tr('.', ',')
      end

      # Résultat : { 'murs' => [...], 'couches' => [...], 'ouvertures' => [...] }
      def calculer(model = Sketchup.active_model)
        murs = []
        Murs.chaque_mur(model.entities) do |g|
          d = Murs.donnees(g)
          next unless d

          murs << Geo.metre(d).merge('nom' => g.name, 'type_nom' => d['type_nom'])
        end
        totaux(murs)
      end

      # Regroupe par couche (nom + épaisseur) et par ouverture (type + dimensions).
      def totaux(murs)
        couches = Hash.new { |h, k| h[k] = { 'longueur' => 0.0, 'brute' => 0.0, 'ouvertures' => 0.0, 'nette' => 0.0, 'volume' => 0.0 } }
        ouvs = Hash.new(0)
        murs.each do |m|
          m['couches'].each do |c|
            t = couches[[c['nom'], c['ep']]]
            %w[longueur brute ouvertures nette volume].each { |k| t[k] += c[k] }
          end
          m['ouvertures'].each do |o|
            ouvs[[o['type'], o['l'].to_f, o['h'].to_f, o['allege'].to_f]] += 1
          end
        end
        {
          'murs' => murs,
          'couches' => couches.map { |(nom, ep), t| t.merge('nom' => nom, 'ep' => ep) }
                              .sort_by { |t| [t['nom'], t['ep']] },
          'ouvertures' => ouvs.map do |(type, l, h, al), n|
            { 'type' => type, 'libelle' => Geo::TYPES_OUVERTURE[type], 'l' => l, 'h' => h, 'allege' => al, 'nombre' => n }
          end.sort_by { |o| [o['type'], o['l'], o['h']] }
        }
      end

      def csv(res)
        l = []
        l << 'MÉTRÉ A2M CONSTRUCTION'
        l << ''
        l << 'TOTAUX PAR COUCHE'
        l << 'Couche;Épaisseur (cm);Longueur (m);Surface brute (m²);Ouvertures (m²);Surface nette (m²);Volume (m³)'
        res['couches'].each do |c|
          l << [c['nom'], nombre(c['ep'], 1), nombre(c['longueur']), nombre(c['brute']),
                nombre(c['ouvertures']), nombre(c['nette']), nombre(c['volume'], 3)].join(';')
        end
        l << ''
        l << 'OUVERTURES'
        l << 'Type;Largeur (cm);Hauteur (cm);Allège (cm);Nombre'
        res['ouvertures'].each do |o|
          l << [o['libelle'], nombre(o['l'], 0), nombre(o['h'], 0), nombre(o['allege'], 0), o['nombre']].join(';')
        end
        l << ''
        l << 'DÉTAIL PAR MUR'
        l << 'Mur;Type de mur;Couche;Épaisseur (cm);Longueur (m);Hauteur (m);Surface brute (m²);Ouvertures (m²);Surface nette (m²);Volume (m³)'
        res['murs'].each do |m|
          m['couches'].each do |c|
            l << [m['nom'], m['type_nom'], c['nom'], nombre(c['ep'], 1), nombre(c['longueur']), nombre(m['hauteur']),
                  nombre(c['brute']), nombre(c['ouvertures']), nombre(c['nette']), nombre(c['volume'], 3)]
                 .map { |v| v.to_s.tr(';', ',') }.join(';')
          end
        end
        "﻿#{l.join("\r\n")}\r\n"
      end

      def exporter(res = calculer)
        model = Sketchup.active_model
        dossier = model.path.empty? ? nil : File.dirname(model.path)
        base = model.title.empty? ? 'Modele' : model.title
        chemin = UI.savepanel('Exporter le métré (CSV)', dossier, "Metre_A2M_#{base}.csv")
        return nil unless chemin

        chemin += '.csv' unless chemin.downcase.end_with?('.csv')
        File.write(chemin, csv(res), encoding: 'UTF-8')
        chemin
      end
    end
  end
end
