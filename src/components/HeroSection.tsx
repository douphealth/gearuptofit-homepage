import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import heroImage from "@/assets/hero-fitness.jpg";

const HeroSection = () => {
  return (
    <section className="relative min-h-[90vh] flex items-center overflow-hidden">
      {/* Background image */}
      <div className="absolute inset-0">
        <img
          src={heroImage}
          alt="Runner training at sunrise — running shoes, fitness watch, and training plan"
          className="w-full h-full object-cover"
          loading="eager"
          width={1920}
          height={1080}
        />
        <div className="absolute inset-0 bg-gradient-to-r from-background via-background/90 to-background/40" />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-background/60" />
      </div>

      <div className="container relative z-10 py-24 md:py-32">
        <motion.div
          initial={{ opacity: 0, y: 20, filter: "blur(4px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          className="max-w-3xl"
        >
          <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-primary/15 border border-primary/30 rounded-sm mb-6">
            <span className="w-2 h-2 rounded-full bg-primary animate-pulse-red" />
            <span className="text-sm font-medium tracking-wide uppercase text-primary font-display">
              Independent Running &amp; Fitness Tools
            </span>
          </div>

          <h1
            className="text-4xl md:text-6xl lg:text-7xl font-bold uppercase tracking-tight leading-[0.95] mb-6"
            data-speakable
          >
            Running Shoe Reviews,{" "}
            <span className="text-gradient-red">Fitness Calculators</span> &amp; Training Tools for Smarter Fitness
          </h1>

          <p
            className="text-lg md:text-xl text-muted-foreground max-w-2xl mb-8 font-body leading-relaxed"
            data-speakable
          >
            GearUpToFit helps runners and active people choose better running shoes, compare fitness gear, find the
            right fitness watch, calculate training targets, and build realistic workout plans using evidence-aware
            guides, free tools, and practical recommendations.
          </p>

          <div className="flex flex-col gap-4">
            {/* Primary CTAs — all four homepage tools */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <a
                href="https://gearuptofit.com/shoe-finder/"
                aria-label="Find your running shoes with the Running Shoe Finder"
                className="inline-flex items-center justify-center gap-2 px-6 py-4 bg-primary font-display text-base md:text-lg uppercase tracking-wider font-semibold transition-all duration-200 hover:brightness-110 active:scale-[0.97] glow-red rounded-sm"
              >
                Find Your Running Shoes
                <ArrowRight className="w-5 h-5" />
              </a>
              <a
                href="https://gearuptofit.com/watch-match/"
                aria-label="Find your fitness watch with Watch Match"
                className="inline-flex items-center justify-center gap-2 px-6 py-4 bg-primary font-display text-base md:text-lg uppercase tracking-wider font-semibold transition-all duration-200 hover:brightness-110 active:scale-[0.97] glow-red rounded-sm"
              >
                Find Your Fitness Watch
                <ArrowRight className="w-5 h-5" />
              </a>
              <a
                href="https://gearuptofit.com/supplement-match/"
                aria-label="Find your supplement match with Supplement Match"
                className="inline-flex items-center justify-center gap-2 px-6 py-4 bg-primary font-display text-base md:text-lg uppercase tracking-wider font-semibold transition-all duration-200 hover:brightness-110 active:scale-[0.97] glow-red rounded-sm"
              >
                Find Your Supplement Match
                <ArrowRight className="w-5 h-5" />
              </a>
              <a
                href="https://gearuptofit.com/fitness-plan/"
                aria-label="Build your fitness plan"
                className="inline-flex items-center justify-center gap-2 px-6 py-4 border border-primary/50 font-display text-base md:text-lg uppercase tracking-wider font-semibold transition-all duration-200 hover:bg-primary/10 hover:border-primary active:scale-[0.97] rounded-sm text-primary"
              >
                Build Your Fitness Plan
              </a>
              <a
                href="https://gearuptofit.com/fitness-and-health-calculators/"
                aria-label="Explore fitness and health calculators"
                className="inline-flex items-center justify-center gap-2 px-6 py-4 border border-primary/50 font-display text-base md:text-lg uppercase tracking-wider font-semibold transition-all duration-200 hover:bg-primary/10 hover:border-primary active:scale-[0.97] rounded-sm text-primary sm:col-span-2"
              >
                Explore Fitness Calculators
              </a>
            </div>

            <p className="text-xs sm:text-sm text-muted-foreground/80 font-body italic">
              Independent gear guidance, practical fitness tools, transparent reviews, and research-aware recommendations.
            </p>
          </div>
        </motion.div>

        {/* Stats bar */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
          className="mt-16 flex flex-wrap gap-8 md:gap-16"
        >
          {[
            { num: "200+", label: "Expert Guides" },
            { num: "16+", label: "Fitness Calculators" },
            { num: "150+", label: "Gear Reviews" },
            { num: "50K+", label: "Monthly Readers" },
          ].map((stat) => (
            <div key={stat.label} className="flex flex-col">
              <span className="text-3xl md:text-4xl font-bold font-display text-primary tabular-nums">
                {stat.num}
              </span>
              <span className="text-sm text-muted-foreground uppercase tracking-wider font-display">
                {stat.label}
              </span>
            </div>
          ))}
        </motion.div>
      </div>
    </section>
  );
};

export default HeroSection;
