import { ArrowRight } from "lucide-react";
import { TOOL_CARDS } from "@/lib/homepage-data";

const ToolsSection = () => {
  return (
    <section aria-labelledby="tools-heading" className="py-16 sm:py-20 bg-card/30 border-y border-border/40">
      <div className="container max-w-6xl">
        <h2 id="tools-heading" className="text-3xl sm:text-4xl md:text-5xl font-bold uppercase tracking-tight font-display mb-3">
          Free tools to make better fitness decisions
        </h2>
        <p className="text-muted-foreground font-body mb-10 max-w-2xl">
          Interactive tools built for runners and active people. No signup. Always free.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {TOOL_CARDS.map((tool) => (
            <a
              key={tool.href}
              href={tool.href}
              aria-label={tool.title}
              className="group block bg-background border border-border rounded-lg p-6 card-hover"
            >
              <h3 className="text-lg font-bold uppercase tracking-wide font-display mb-2 group-hover:text-primary transition-colors">
                {tool.title}
              </h3>
              <p className="text-sm text-muted-foreground font-body leading-relaxed mb-4">
                {tool.description}
              </p>
              <span className="inline-flex items-center gap-1.5 text-primary font-display text-xs uppercase tracking-wider font-semibold">
                Open tool
                <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-1" aria-hidden="true" />
              </span>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
};

export default ToolsSection;
