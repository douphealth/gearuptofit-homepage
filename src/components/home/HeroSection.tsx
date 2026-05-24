import { ArrowRight } from "lucide-react";
import { HERO } from "@/lib/homepage-data";
import heroImage from "@/assets/hero-fitness.jpg";

const HeroSection = () => {
  return (
    <section className="relative overflow-hidden border-b border-border/40">
      <div className="absolute inset-0">
        <img
          src={heroImage}
          alt="Runner training at sunrise with running shoes and a fitness watch"
          className="w-full h-full object-cover opacity-25"
          loading="eager"
          fetchPriority="high"
          width={1920}
          height={1080}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-background/95 via-background/85 to-background" />
      </div>

      <div className="container relative z-10 py-16 sm:py-20 md:py-28 lg:py-32 max-w-6xl">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-primary/10 border border-primary/25 rounded-full mb-6">
          <span className="w-1.5 h-1.5 rounded-full bg-primary" />
          <span className="text-[11px] sm:text-xs font-medium tracking-wider uppercase text-primary font-display">
            {HERO.eyebrow}
          </span>
        </div>

        <h1
          className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold uppercase tracking-tight leading-[1.05] mb-5 max-w-4xl"
          data-speakable
        >
          Running Shoe Reviews,{" "}
          <span className="text-gradient-red">Fitness Calculators</span>{" "}
          &amp; Smart Fitness Tools
        </h1>

        <p
          className="text-base sm:text-lg md:text-xl text-muted-foreground max-w-3xl mb-8 font-body leading-relaxed"
          data-speakable
        >
          {HERO.sub}
        </p>

        <div className="flex flex-col sm:flex-row flex-wrap gap-3 mb-6">
          {HERO.ctas.map((cta) => (
            <a
              key={cta.href}
              href={cta.href}
              aria-label={cta.title}
              className={
                cta.primary
                  ? "inline-flex items-center justify-center gap-2 px-5 sm:px-6 py-3.5 bg-primary text-primary-foreground font-display text-sm sm:text-base uppercase tracking-wider font-semibold rounded-md transition-all duration-200 hover:brightness-110 active:scale-[0.98] glow-red"
                  : "inline-flex items-center justify-center gap-2 px-5 sm:px-6 py-3.5 border border-primary/50 text-primary font-display text-sm sm:text-base uppercase tracking-wider font-semibold rounded-md transition-all duration-200 hover:bg-primary/10 hover:border-primary active:scale-[0.98]"
              }
            >
              {cta.title}
              <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </a>
          ))}
        </div>

        <p className="text-xs sm:text-sm text-muted-foreground/90 font-body mb-8">
          {HERO.trust}
        </p>

        <nav aria-label="Main decision paths" className="flex flex-wrap gap-2">
          {HERO.decisionPaths.map((p) => (
            <a
              key={p.href}
              href={p.href}
              className="inline-flex items-center px-3 py-1.5 text-xs sm:text-sm font-display uppercase tracking-wider border border-border bg-card/60 hover:border-primary/60 hover:text-primary rounded-full transition-colors"
            >
              {p.label}
            </a>
          ))}
        </nav>
      </div>
    </section>
  );
};

export default HeroSection;
