if ENV['RPGM_RGSS_VERSION'].to_i.between?(1, 2)
  module RpgmRuby18
    class Names < Array
      def include?(name)
        super(name.is_a?(String) ? name.to_sym : name)
      end
    end

    module ObjectMethods
      def type
        self.class
      end

      %i[methods singleton_methods public_methods private_methods].each do |m|
        define_method(m) { |*args| Names.new(super(*args)) }
      end
    end

    module ModuleMethods
      %i[instance_methods public_instance_methods private_instance_methods protected_instance_methods].each do |m|
        define_method(m) { |*args| Names.new(super(*args)) }
      end
    end
  end

  Object.prepend(RpgmRuby18::ObjectMethods)
  Module.prepend(RpgmRuby18::ModuleMethods)

  class Array
    def nitems
      count { |x| !x.nil? }
    end unless method_defined?(:nitems)

    def choice
      sample
    end unless method_defined?(:choice)
  end
end

class Hash
  def index(value)
    key(value)
  end unless method_defined?(:index)
end
