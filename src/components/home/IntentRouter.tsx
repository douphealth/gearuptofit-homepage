import { ArrowRight } from "lucide-react";
import { INTENT_CARDS } from "@/lib/homepage-data";

const IntentRouter = () => {
  return (
    <section aria-labelledby="intent-router-heading" className="py-16 sm:py-20 border-b border-border/40">
      <div className="container max-w-6xl">
        <h2
          id="intent-router-heading"
          className="text-3xl sm:text-4xl md:text-5xl font-bold uppercase tracking-tight font-display mb-3"
        >
          What do you want to solve today?
        </h2>
        <p className="text-muted-foreground font-body mb-10 max-w-2xl">
          Pick the goal that matches your moment. Each path leads to a focused tool or guide.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {INTENT_CARDS.map((card) => (
            <a
              key={card.href}
              href={card.href}
              aria-label={card.title}
              className="group block bg-card border border-border rounded-lg p-6 sm:p-7 card-hover"
            >
              <h3 className="text-lg sm:text-xl font-bold uppercase tracking-wide font-display mb-2 group-hover:text-primary transition-colors">
                {card.title}
              </h3>
              <p className="text-sm sm:text-base text-muted-foreground font-body leading-relaxed mb-4">
                {card.description}
              </p>
              <span className="inline-flex items-center gap-1.5 text-primary font-display text-sm uppercase tracking-wider font-semibold">
                {card.ctaLabel}
                <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" aria-hidden="true" />
              </span>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
};

export default IntentRouter;
