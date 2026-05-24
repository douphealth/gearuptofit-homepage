import { ArrowRight } from "lucide-react";
import { FINAL_CTA } from "@/lib/homepage-data";

const FinalCTA = () => {
  return (
    <section aria-labelledby="final-cta-heading" className="py-20 sm:py-24">
      <div className="container max-w-4xl text-center">
        <h2
          id="final-cta-heading"
          className="text-3xl sm:text-4xl md:text-5xl font-bold uppercase tracking-tight font-display mb-4"
        >
          {FINAL_CTA.heading}
        </h2>
        <p className="text-base sm:text-lg text-muted-foreground font-body leading-relaxed mb-8 max-w-2xl mx-auto">
          {FINAL_CTA.body}
        </p>
        <div className="flex flex-col sm:flex-row justify-center gap-3">
          {FINAL_CTA.ctas.map((cta, i) => (
            <a
              key={cta.href}
              href={cta.href}
              aria-label={cta.title}
              className={
                i === 0
                  ? "inline-flex items-center justify-center gap-2 px-6 py-3.5 bg-primary text-primary-foreground font-display text-sm sm:text-base uppercase tracking-wider font-semibold rounded-md hover:brightness-110 active:scale-[0.98] glow-red transition-all"
                  : "inline-flex items-center justify-center gap-2 px-6 py-3.5 border border-primary/50 text-primary font-display text-sm sm:text-base uppercase tracking-wider font-semibold rounded-md hover:bg-primary/10 hover:border-primary active:scale-[0.98] transition-all"
              }
            >
              {cta.title}
              <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </a>
          ))}
        </div>
      </div>
    </section>
  );
};

export default FinalCTA;
