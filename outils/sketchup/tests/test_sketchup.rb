# frozen_string_literal: true
# Exécute la partie SketchUp de l'extension avec une imitation de l'API :
#   ruby outils/sketchup/tests/test_sketchup.rb
require 'minitest/autorun'
require 'tmpdir'
require_relative 'faux_sketchup'
P = File.expand_path('../plugin/a2m_construction', __dir__)
module A2M
  module Construction
    DIR = P
    VERSION = 'test'
  end
end
%w[geo reglages murs metre].each { |f| require File.join(P, f) }

class TestSketchup < Minitest::Test
  C = A2M::Construction

  def setup
    Sketchup.reset!
    @tmp = Dir.mktmpdir
    ENV['APPDATA'] = @tmp
  end

  def type
    C::Reglages::DEFAUT['types'][0]
  end

  def murs
    Sketchup.active_model.entities.select { |e| C::Murs.mur?(e) }
  end

  def test_reglages_aller_retour
    r = C::Reglages.lire
    r['hauteur'] = 270
    r['types'] << { 'nom' => '', 'couches' => [{ 'nom' => 'X', 'ep' => -2 }] } # type invalide, retiré
    C::Reglages.ecrire(r)
    lu = C::Reglages.lire
    assert_equal 270.0, lu['hauteur']
    assert_equal 4, lu['types'].size
  end

  def test_contour_ferme_et_metre
    pts = [[0, 0, 0], [1000, 0, 0], [1000, 800, 0], [0, 800, 0]]
    gr = C::Murs.creer_chaine(pts, true, type, 250, 'centre')
    assert_equal 4, gr.size
    assert_equal 4, murs.size
    g = gr.first
    assert_equal 3, g.entities.count # 3 couches
    faces = g.entities.first.entities.to_a
    assert(faces.all? { |f| f.material })
    assert_match(/Mur A2M/, g.name)

    errs = C::Murs.ajouter_ouverture(g, { 'type' => 'fenetre', 'pos' => 200, 'l' => 120, 'h' => 135, 'allege' => 90 })
    assert_empty errs
    assert_equal 4, g.entities.count # 3 couches + menuiseries
    errs = C::Murs.ajouter_ouverture(g, { 'type' => 'porte', 'pos' => 250, 'l' => 90, 'h' => 215, 'allege' => 0 })
    refute_empty errs # chevauchement refusé
    assert_equal 1, C::Murs.donnees(g)['ouvertures'].size

    res = C::Metre.calculer
    assert_equal 4, res['murs'].size
    assert_equal 3, res['couches'].size
    assert_equal 1, res['ouvertures'].first['nombre']
    parpaing = res['couches'].find { |c| c['nom'] == 'Parpaing' }
    assert_operator parpaing['volume'], :>, 0

    $chemin_csv = File.join(@tmp, 'metre')
    chemin = C::Metre.exporter(res)
    assert chemin.end_with?('.csv')
    txt = File.read(chemin, encoding: 'UTF-8')
    assert txt.start_with?("﻿")
    assert_includes txt, 'Fenêtre;120;135;90;1'
  end

  def test_modifier
    gr = C::Murs.creer_chaine([[0, 0, 0], [500, 0, 0], [500, 400, 0]], false, type, 250, 'gauche')
    assert_equal 2, gr.size
    errs = C::Murs.modifier([gr[0]], { 'h' => 280, 'couches' => C::Reglages::DEFAUT['types'][1]['couches'],
                                       'type_nom' => 'Mur simple', 'align' => 'centre',
                                       'ouvertures' => [{ 'type' => 'porte', 'pos' => 100, 'l' => 90, 'h' => 215, 'allege' => 0 }] })
    assert_empty errs
    d = C::Murs.donnees(gr[0])
    assert_equal 280.0, d['h']
    assert_equal 1, d['couches'].size
    assert_equal 1, d['ouvertures'].size

    errs = C::Murs.modifier([gr[0]], { 'h' => 150 }) # porte de 215 cm trop haute
    refute_empty errs
    assert_equal 280.0, C::Murs.donnees(gr[0])['h'] # rien n'a changé
  end

  def test_points_doubles_ignores
    gr = C::Murs.creer_chaine([[0, 0, 0], [0, 0.01, 0], [300, 0, 0]], false, type, 250, 'centre')
    assert_equal 1, gr.size
  end
end
