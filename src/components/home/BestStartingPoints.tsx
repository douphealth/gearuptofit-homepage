import { ArrowUpRight } from "lucide-react";
import { START_LINKS } from "@/lib/homepage-data";

const BestStartingPoints = () => {
  return (
    <section
      aria-labelledby="start-heading"
      className="py-16 sm:py-20 bg-card/30 border-y border-border/40"
    >
      <div className="container max-w-6xl">
        <h2 id="start-heading" className="text-3xl sm:text-4xl md:text-5xl font-bold uppercase tracking-tight font-display mb-3">
          Best places to start
        </h2>
        <p className="text-muted-foreground font-body mb-10 max-w-2xl">
          The most useful entry points across the site — fast routes to the guides and tools most readers come for.
        </p>

        <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {START_LINKS.map((link) => (
            <li key={link.href}>
              <a
                href={link.href}
                className="group flex items-center justify-between gap-3 bg-background border border-border rounded-md px-4 py-3.5 hover:border-primary/60 hover:text-primary transition-colors"
              >
                <span className="font-display text-sm uppercase tracking-wide font-medium">
                  {link.label}
                </span>
                <ArrowUpRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" aria-hidden="true" />
              </a>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
};

export default BestStartingPoints;
