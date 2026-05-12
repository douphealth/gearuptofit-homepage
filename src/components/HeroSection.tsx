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
          alt="Athlete sprinting with dramatic red lighting"
          className="w-full h-full object-cover"
          loading="eager"
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
              Your Fitness Command Center
            </span>
          </div>

          <h1 className="text-5xl md:text-7xl lg:text-8xl font-bold uppercase tracking-tight leading-[0.9] mb-6" data-speakable>
            <span className="block">Gear Up.</span>
            <span className="block text-gradient-red">Get Fit.</span>
            <span className="block text-muted-foreground text-3xl md:text-4xl lg:text-5xl mt-2 font-medium">
              Expert Guides • Honest Reviews • Real Results
            </span>
          </h1>

          <p className="text-lg md:text-xl text-muted-foreground max-w-xl mb-8 font-body leading-relaxed">
            Answer 9 quick questions and get a personalized shoe recommendation based on your training, pace, and goals.
            Or build your custom 8-week running & fitness plan — all backed by science and real-world testing.
          </p>

          <div className="flex flex-col gap-4">
            {/* Primary CTAs */}
            <div className="flex flex-col sm:flex-row gap-4">
              <a
                href="https://gearuptofit.com/shoe-match/"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-primary font-display text-lg uppercase tracking-wider font-semibold transition-all duration-200 hover:brightness-110 active:scale-[0.97] glow-red rounded-sm"
              >
                <span className="hidden sm:inline">Find Your Perfect Shoe</span>
                <span className="sm:hidden">Shoe Finder</span>
                <ArrowRight className="w-5 h-5" />
              </a>
              <a
                href="https://gearuptofit.com/fitness-plan/"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 px-8 py-4 border border-primary/50 font-display text-lg uppercase tracking-wider font-semibold transition-all duration-200 hover:bg-primary/10 hover:border-primary active:scale-[0.97] rounded-sm text-primary"
              >
                <span className="hidden sm:inline">8-Week Training Plan</span>
                <span className="sm:hidden">Training Plan</span>
              </a>
              <a
                href="https://gearuptofit.com/watch-match/"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 px-8 py-4 border border-primary/50 font-display text-lg uppercase tracking-wider font-semibold transition-all duration-200 hover:bg-primary/10 hover:border-primary active:scale-[0.97] rounded-sm text-primary"
              >
                <span className="hidden sm:inline">Watch Match</span>
                <span className="sm:hidden">Watch Match</span>
                <ArrowRight className="w-5 h-5" />
              </a>
            </div>
            
            {/* Secondary CTA */}
            <a
              href="#categories"
              className="inline-flex items-center justify-center gap-2 px-8 py-3 border border-foreground/20 font-display text-sm uppercase tracking-wider font-semibold transition-all duration-200 hover:border-primary hover:text-primary active:scale-[0.97] rounded-sm text-muted-foreground"
            >
              Browse All Topics
            </a>
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
            { num: "200+", label: "Expert Articles" },
            { num: "6", label: "Core Categories" },
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
