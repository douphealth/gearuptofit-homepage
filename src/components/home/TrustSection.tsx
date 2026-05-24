import { ArrowRight } from "lucide-react";
import { TRUST_CARDS } from "@/lib/homepage-data";

const TrustSection = () => {
  return (
    <section aria-labelledby="trust-heading" className="py-16 sm:py-20 border-b border-border/40">
      <div className="container max-w-6xl">
        <h2 id="trust-heading" className="text-3xl sm:text-4xl md:text-5xl font-bold uppercase tracking-tight font-display mb-3">
          Why trust GearUpToFit?
        </h2>
        <p className="text-muted-foreground font-body mb-10 max-w-2xl">
          How we choose what to publish, what to recommend, and how to disclose our incentives.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          {TRUST_CARDS.map((t) => (
            <div key={t.title} className="bg-card border border-border rounded-lg p-6">
              <h3 className="text-lg font-bold uppercase tracking-wide font-display mb-2">
                {t.title}
              </h3>
              <p className="text-sm text-muted-foreground font-body leading-relaxed">
                {t.description}
              </p>
            </div>
          ))}
        </div>

        <a
          href="https://gearuptofit.com/about-us/"
          className="inline-flex items-center gap-1.5 text-primary font-display text-sm uppercase tracking-wider font-semibold"
        >
          Read our editorial approach
          <ArrowRight className="w-4 h-4" aria-hidden="true" />
        </a>
      </div>
    </section>
  );
};

export default TrustSection;
