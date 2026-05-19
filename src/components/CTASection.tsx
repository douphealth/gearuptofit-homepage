import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";

const CTASection = () => {
  return (
    <section className="py-24 md:py-32 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-background to-background" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-primary/5 blur-[120px]" />

      <div className="container relative z-10 text-center">
        <motion.div
          initial={{ opacity: 0, y: 20, filter: "blur(4px)" }}
          whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        >
          <h2 className="text-4xl md:text-6xl lg:text-7xl font-bold uppercase tracking-tight font-display mb-6 leading-[0.95]">
            Ready to
            <span className="text-gradient-red block">Train Smarter?</span>
          </h2>

          <p className="text-lg md:text-xl text-muted-foreground font-body max-w-2xl mx-auto mb-10 leading-relaxed">
            Match your running shoes, find the right fitness watch, dial in your supplement stack, build a realistic
            plan, and use free calculators — all in one place.
          </p>

          <div className="flex flex-col sm:flex-row flex-wrap gap-3 justify-center">
            <a
              href="https://gearuptofit.com/shoe-finder/"
              className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-primary font-display text-base md:text-lg uppercase tracking-wider font-semibold transition-all duration-200 hover:brightness-110 active:scale-[0.97] glow-red rounded-sm"
            >
              Find Your Running Shoes
              <ArrowRight className="w-5 h-5" />
            </a>
            <a
              href="https://gearuptofit.com/watch-match/"
              className="inline-flex items-center justify-center gap-2 px-8 py-4 border border-primary/50 font-display text-base md:text-lg uppercase tracking-wider font-semibold transition-all duration-200 hover:bg-primary/10 hover:border-primary active:scale-[0.97] rounded-sm text-primary"
            >
              Find Your Fitness Watch
            </a>
            <a
              href="https://lovable.dev/projects/c0d2104a-7e3c-45a2-9f52-6ab2ec917c44"
              className="inline-flex items-center justify-center gap-2 px-8 py-4 border border-primary/50 font-display text-base md:text-lg uppercase tracking-wider font-semibold transition-all duration-200 hover:bg-primary/10 hover:border-primary active:scale-[0.97] rounded-sm text-primary"
            >
              Find Your Supplement Match
            </a>
            <a
              href="https://gearuptofit.com/fitness-plan/"
              className="inline-flex items-center justify-center gap-2 px-8 py-4 border border-primary/50 font-display text-base md:text-lg uppercase tracking-wider font-semibold transition-all duration-200 hover:bg-primary/10 hover:border-primary active:scale-[0.97] rounded-sm text-primary"
            >
              Build Your Fitness Plan
            </a>
            <a
              href="https://gearuptofit.com/fitness-and-health-calculators/"
              className="inline-flex items-center justify-center gap-2 px-8 py-4 border border-primary/50 font-display text-base md:text-lg uppercase tracking-wider font-semibold transition-all duration-200 hover:bg-primary/10 hover:border-primary active:scale-[0.97] rounded-sm text-primary"
            >
              Explore Calculators
            </a>
          </div>
        </motion.div>
      </div>
    </section>
  );
};

export default CTASection;
