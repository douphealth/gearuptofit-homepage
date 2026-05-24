import { ArrowRight } from "lucide-react";
import { LATEST_GUIDES } from "@/lib/homepage-data";

const LatestGuides = () => {
  return (
    <section aria-labelledby="latest-guides-heading" className="py-16 sm:py-20 bg-card/30 border-y border-border/40">
      <div className="container max-w-6xl">
        <h2 id="latest-guides-heading" className="text-3xl sm:text-4xl md:text-5xl font-bold uppercase tracking-tight font-display mb-3">
          Latest guides
        </h2>
        <p className="text-muted-foreground font-body mb-10 max-w-2xl">
          Fresh reads across running shoes, calculators, nutrition, and gear.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {LATEST_GUIDES.slice(0, 6).map((g) => (
            <article key={g.href} className="bg-background border border-border rounded-lg p-6 card-hover flex flex-col">
              <span className="text-[11px] font-display uppercase tracking-wider text-primary mb-2">
                {g.category}
              </span>
              <h3 className="text-base sm:text-lg font-bold font-display uppercase tracking-wide leading-snug mb-2">
                <a href={g.href} className="hover:text-primary transition-colors">
                  {g.title}
                </a>
              </h3>
              <p className="text-sm text-muted-foreground font-body leading-relaxed mb-4 flex-1">
                {g.excerpt}
              </p>
              <a
                href={g.href}
                className="inline-flex items-center gap-1.5 text-primary font-display text-xs uppercase tracking-wider font-semibold"
              >
                Read guide
                <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
              </a>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
};

export default LatestGuides;
