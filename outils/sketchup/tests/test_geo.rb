# frozen_string_literal: true
# Tests des calculs de A2M Construction, sans SketchUp :
#   ruby outils/sketchup/tests/test_geo.rb
require 'minitest/autorun'
require_relative '../plugin/a2m_construction/geo'

class TestGeo < Minitest::Test
  G = A2M::Construction::Geo

  def mur(s, e, ep: [20], h: 250, align: 'centre', prev: nil, nxt: nil, ouv: [])
    { 'S' => s, 'E' => e, 'h' => h, 'align' => align, 'prev' => prev, 'next' => nxt,
      'couches' => ep.map { |x| { 'nom' => "c#{x}", 'ep' => x } }, 'ouvertures' => ouv }
  end

  # Vecteur surface (méthode de Newell).
  def newell(pts)
    n = [0.0, 0.0, 0.0]
    pts.each_with_index do |p, i|
      q = pts[(i + 1) % pts.size]
      n[0] += (p[1] - q[1]) * (p[2] + q[2])
      n[1] += (p[2] - q[2]) * (p[0] + q[0])
      n[2] += (p[0] - q[0]) * (p[1] + q[1])
    end
    n.map { |x| x / 2.0 }
  end

  def oriente(v, nrm)
    v.zip(nrm).sum { |a, b| a * b }.negative? ? v.map(&:-@) : v
  end

  # Volume d'un solide fermé (théorème de la divergence), en cm³.
  def volume(faces)
    faces.sum do |f|
      a = oriente(newell(f[:pts]), f[:normale])
      (f[:trous] || []).each do |t|
        h = oriente(newell(t), f[:normale])
        a = a.zip(h).map { |x, y| x - y }
      end
      a.zip(f[:pts][0]).sum { |x, y| x * y } / 3.0
    end
  end

  # Chaque arête doit appartenir à exactement deux faces (solide fermé).
  # Les arêtes longues découpées par des sommets intermédiaires sont
  # comparées par longueur totale sur chaque droite.
  def ferme?(faces)
    cle = ->(p) { p.map { |x| x.to_f.round(3) } }
    aretes = Hash.new(0)
    faces.each do |f|
      ([f[:pts]] + (f[:trous] || [])).each do |boucle|
        boucle.each_with_index do |p, i|
          q = boucle[(i + 1) % boucle.size]
          aretes[[cle.call(p), cle.call(q)].sort] += 1
        end
      end
    end
    aretes.values.all? { |v| v == 2 }
  end

  def test_jonction_angle_droit
    lam, mu = G.jonction([1.0, 0.0], [0.0, 1.0], 10.0, 100)
    assert_in_delta(-10.0, lam)
    assert_in_delta(10.0, mu)
    lam, mu = G.jonction([1.0, 0.0], [0.0, 1.0], -10.0, 100)
    assert_in_delta(10.0, lam)
    assert_in_delta(-10.0, mu)
    assert_equal [0.0, 0.0], G.jonction([1.0, 0.0], [1.0, 0.0], 10.0, 100)
  end

  def test_decalages
    assert_equal [[-15.0, 5.0], [5.0, 15.0]], G.decalages([20, 10], 'centre')
    assert_equal [[0.0, 20.0]], G.decalages([20], 'gauche')
    assert_equal [[-20.0, 0.0]], G.decalages([20], 'droite')
  end

  def test_rectangle_ferme_volume_exact
    pts = [[0, 0, 0], [1000, 0, 0], [1000, 800, 0], [0, 800, 0]]
    dirs = 4.times.map { |i| a = pts[i]; b = pts[(i + 1) % 4]; [b[0] - a[0], b[1] - a[1]] }
    total = 0.0
    total_metre = 0.0
    4.times do |i|
      d = mur(pts[i], pts[(i + 1) % 4], ep: [20, 10], prev: dirs[i - 1], nxt: dirs[(i + 1) % 4])
      2.times do |k|
        f = G.faces_couche(d, k)
        assert ferme?(f), "mur #{i} couche #{k} non fermé"
        total += volume(f)
      end
      total_metre += G.metre(d)['couches'].sum { |c| c['volume'] }
    end
    attendu = 3600 * 30 * 250.0 # périmètre de l'axe × épaisseur × hauteur (cm³)
    assert_in_delta attendu, total, 1e-3
    assert_in_delta attendu / 1e6, total_metre, 1e-9
  end

  def test_angle_quelconque_volume_metre
    d = mur([0, 0, 0], [400, 300, 0], ep: [20], prev: [1, 2], nxt: [-1, 3])
    f = G.faces_couche(d, 0)
    assert ferme?(f)
    assert_in_delta G.metre(d)['couches'][0]['volume'] * 1e6, volume(f), 1e-3
  end

  def test_ouvertures_volume
    ouv = [
      { 'type' => 'porte', 'pos' => 50, 'l' => 90, 'h' => 215, 'allege' => 0 },
      { 'type' => 'fenetre', 'pos' => 200, 'l' => 120, 'h' => 135, 'allege' => 90 },
      { 'type' => 'baie', 'pos' => 360, 'l' => 240, 'h' => 215, 'allege' => 0 }
    ]
    d = mur([0, 0, 0], [700, 0, 0], ep: [20, 10, 1.3], ouv: ouv)
    assert_empty G.erreurs_ouvertures(d)
    3.times do |k|
      f = G.faces_couche(d, k)
      assert ferme?(f), "couche #{k} non fermée"
      assert_in_delta G.metre(d)['couches'][k]['volume'] * 1e6, volume(f), 1e-3
    end
    m = G.metre(d)
    assert_in_delta (90 * 215 + 120 * 135 + 240 * 215) / 1e4, m['couches'][0]['ouvertures'], 1e-9
    assert_in_delta 7.0 * 2.5 - m['couches'][0]['ouvertures'], m['couches'][0]['nette'], 1e-9
  end

  def test_porte_au_bout_du_mur
    d = mur([0, 0, 0], [300, 0, 0], ouv: [{ 'type' => 'porte', 'pos' => 0, 'l' => 90, 'h' => 215, 'allege' => 0 }])
    f = G.faces_couche(d, 0)
    assert ferme?(f)
    assert_in_delta G.metre(d)['couches'][0]['volume'] * 1e6, volume(f), 1e-3
  end

  def test_erreurs
    base = { 'type' => 'fenetre', 'l' => 120, 'h' => 135, 'allege' => 90 }
    d = mur([0, 0, 0], [300, 0, 0], ouv: [base.merge('pos' => 10), base.merge('pos' => 100)])
    assert(G.erreurs_ouvertures(d).any? { |e| e.include?('chevauchent') })
    d = mur([0, 0, 0], [300, 0, 0], ouv: [base.merge('pos' => 250)])
    assert(G.erreurs_ouvertures(d).any? { |e| e.include?('dépasse') })
    d = mur([0, 0, 0], [300, 0, 0], ouv: [base.merge('pos' => 10, 'allege' => 150)])
    assert(G.erreurs_ouvertures(d).any? { |e| e.include?('trop haute') })
    d = mur([0, 0, 0], [300, 0, 0], ouv: [base.merge('pos' => 10, 'type' => 'x')])
    assert(G.erreurs_ouvertures(d).any? { |e| e.include?('inconnu') })
  end

  def test_placer
    d = mur([0, 0, 0], [300, 0, 0])
    assert_in_delta 0.0, G.placer(d, 10, 90)
    assert_in_delta 210.0, G.placer(d, 295, 90)
    assert_in_delta 105.0, G.placer(d, 150, 90)
    assert_nil G.placer(d, 150, 400)
    d['ouvertures'] = [{ 'type' => 'porte', 'pos' => 100, 'l' => 90, 'h' => 215, 'allege' => 0 }]
    assert_nil G.placer(d, 150, 90)
  end

  def test_zone_tient_compte_des_onglets
    # Angle intérieur : la couche intérieure est raccourcie aux deux bouts.
    d = mur([0, 0, 0], [500, 0, 0], ep: [20], align: 'gauche', prev: [0, -1], nxt: [0, 1])
    c = G.cadre(d)
    assert_in_delta 20.0, c[:zone][0]
    assert_in_delta 480.0, c[:zone][1]
  end

  def test_menuiseries
    d = mur([0, 0, 0], [300, 0, 0], ep: [20, 10])
    porte = { 'type' => 'porte', 'pos' => 50, 'l' => 90, 'h' => 215, 'allege' => 0 }
    fen = { 'type' => 'fenetre', 'pos' => 160, 'l' => 100, 'h' => 120, 'allege' => 95 }
    bp = G.menuiserie(d, porte)
    bf = G.menuiserie(d, fen)
    assert_equal 4, bp.size
    assert_equal 5, bf.size
    assert(bp.any? { |b| b[:role] == 'vantail' })
    assert(bf.any? { |b| b[:role] == 'vitrage' })
    c = G.cadre(d)
    (bp + bf).each do |b|
      f = G.faces_boite(c, b)
      assert ferme?(f)
      attendu = (b[:s][1] - b[:s][0]) * (b[:o][1] - b[:o][0]) * (b[:z][1] - b[:z][0])
      assert_in_delta attendu, volume(f), 1e-6
    end
  end

  def test_fmt
    assert_equal '12', G.fmt(12.0)
    assert_equal '12,5', G.fmt(12.5)
  end
end
