# frozen_string_literal: true
# Imitation minimale de l'API SketchUp, pour exécuter le code de l'extension
# en dehors de SketchUp (tests uniquement : ne reproduit pas la géométrie réelle).

class Numeric
  def cm = to_f / 2.54
  def to_cm = to_f * 2.54
end

module Geom
  class Point3d
    attr_reader :x, :y, :z

    def initialize(x = 0, y = 0, z = 0)
      @x = x.to_f
      @y = y.to_f
      @z = z.to_f
    end

    def -(o) = Vector3d.new(x - o.x, y - o.y, z - o.z)
  end

  class Vector3d
    attr_reader :x, :y, :z

    def initialize(x = 0, y = 0, z = 0)
      @x = x.to_f
      @y = y.to_f
      @z = z.to_f
    end

    def %(o) = x * o.x + y * o.y + z * o.z
    def *(o) = Vector3d.new(y * o.z - z * o.y, z * o.x - x * o.z, x * o.y - y * o.x)
    def length = Math.sqrt(self % self)
    def reverse = Vector3d.new(-x, -y, -z)
  end

  class Transformation
    def inverse = self
    def *(o) = o
  end
end

module Sketchup
  class Entity
    def initialize
      @attrs = {}
      @valid = true
    end

    def valid? = @valid
    def erase! = (@valid = false)
    def get_attribute(d, k) = @attrs.dig(d, k)
    def set_attribute(d, k, v) = ((@attrs[d] ||= {})[k] = v)
  end

  class Face < Entity
    attr_accessor :material, :back_material
    attr_reader :pts, :normal

    def initialize(pts)
      super()
      raise ArgumentError, 'points confondus' if pts.size < 3

      @pts = pts
      n = Geom::Vector3d.new
      pts.each_with_index do |p, i|
        q = pts[(i + 1) % pts.size]
        n = Geom::Vector3d.new(n.x + (p.y - q.y) * (p.z + q.z), n.y + (p.z - q.z) * (p.x + q.x),
                               n.z + (p.x - q.x) * (p.y + q.y))
      end
      raise ArgumentError, 'face plate' if n.length < 1e-9

      @normal = n
    end

    def reverse! = (@normal = @normal.reverse)
  end

  class Entities
    include Enumerable

    def initialize = @liste = []
    def each(&) = @liste.select(&:valid?).each(&)
    def clear! = @liste.clear

    def add_face(pts)
      f = Face.new(pts)
      @liste << f
      f
    end

    def add_group
      g = Group.new
      @liste << g
      g
    end
  end

  class Definition
    attr_reader :instances

    def initialize(g) = @instances = [g]
  end

  class Group < Entity
    attr_accessor :name, :layer
    attr_reader :entities, :definition

    def initialize
      super
      @entities = Entities.new
      @definition = Definition.new(self)
      @name = ''
    end

    def model = Sketchup.active_model
    def transformation = Geom::Transformation.new
  end

  class ComponentInstance < Entity; end

  class Color
    def initialize(*) = nil
  end

  class Materiau
    attr_accessor :color, :alpha
  end

  class Collection < Hash
    def add(nom) = (self[nom] = Materiau.new)
  end

  class Selection < Array
    def add_observer(_) = true
  end

  class SelectionObserver; end

  class Model
    attr_reader :entities, :materials, :layers, :selection, :operations
    attr_accessor :path, :title

    def initialize
      @entities = Entities.new
      @materials = Collection.new
      @layers = Collection.new
      @selection = Selection.new
      @operations = []
      @path = ''
      @title = 'Essai'
    end

    def active_entities = @entities
    def start_operation(nom, *) = @operations << nom
    def commit_operation = true
    def abort_operation = @operations << :annule
  end

  def self.active_model = (@model ||= Model.new)
  def self.reset! = (@model = Model.new)
end

module UI
  def self.savepanel(*) = $chemin_csv
  def self.messagebox(m) = ($messages ||= []) << m
  def self.beep = nil
end
