import { ArrowRight } from "lucide-react";
import { FEATURED_GUIDES } from "@/lib/homepage-data";

const FeaturedGuides = () => {
  return (
    <section aria-labelledby="featured-guides-heading" className="py-16 sm:py-20 border-b border-border/40">
      <div className="container max-w-6xl">
        <h2 id="featured-guides-heading" className="text-3xl sm:text-4xl md:text-5xl font-bold uppercase tracking-tight font-display mb-3">
          Featured running shoe guides
        </h2>
        <p className="text-muted-foreground font-body mb-10 max-w-2xl">
          Use-case-first guides for daily training, beginners, wide feet, walking, and comfort-first runners.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {FEATURED_GUIDES.map((g) => (
            <article key={g.href} className="bg-card border border-border rounded-lg p-6 card-hover">
              <h3 className="text-lg font-bold uppercase tracking-wide font-display mb-2">
                <a href={g.href} className="hover:text-primary transition-colors">
                  {g.title}
                </a>
              </h3>
              <p className="text-sm text-muted-foreground font-body leading-relaxed mb-4">
                {g.description}
              </p>
              <a
                href={g.href}
                className="inline-flex items-center gap-1.5 text-primary font-display text-xs uppercase tracking-wider font-semibold"
                aria-label={`Read the ${g.title} guide`}
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

export default FeaturedGuides;
