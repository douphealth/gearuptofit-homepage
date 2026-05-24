import { ArrowRight } from "lucide-react";
import { TOPIC_CARDS } from "@/lib/homepage-data";

const TopicMap = () => {
  return (
    <section aria-labelledby="topic-map-heading" className="py-16 sm:py-20 border-b border-border/40">
      <div className="container max-w-6xl">
        <h2 id="topic-map-heading" className="text-3xl sm:text-4xl md:text-5xl font-bold uppercase tracking-tight font-display mb-3">
          Explore GearUpToFit by topic
        </h2>
        <p className="text-muted-foreground font-body mb-10 max-w-2xl">
          Start with the most useful hub for your goal, then move into detailed guides, reviews, calculators, and tools.
        </p>

        <nav aria-label="Topic hubs" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {TOPIC_CARDS.map((topic) => (
            <a
              key={topic.href}
              href={topic.href}
              aria-label={`Explore ${topic.title}`}
              className="group block bg-card border border-border rounded-lg p-6 card-hover"
            >
              <h3 className="text-lg font-bold uppercase tracking-wide font-display mb-2 group-hover:text-primary transition-colors">
                {topic.title}
              </h3>
              <p className="text-sm text-muted-foreground font-body leading-relaxed mb-4">
                {topic.description}
              </p>
              <span className="inline-flex items-center gap-1.5 text-primary font-display text-xs uppercase tracking-wider font-semibold">
                Explore {topic.title}
                <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-1" aria-hidden="true" />
              </span>
            </a>
          ))}
        </nav>
      </div>
    </section>
  );
};

export default TopicMap;
