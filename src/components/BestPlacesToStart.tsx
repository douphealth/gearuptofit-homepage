import { motion } from "framer-motion";
import { ArrowUpRight } from "lucide-react";
import { bestPlacesToStart } from "@/lib/homepage-strategic";

const BestPlacesToStart = () => {
  return (
    <section
      id="best-places-to-start"
      aria-labelledby="best-places-heading"
      className="py-20 md:py-28"
    >
      <div className="container">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="mb-10 max-w-3xl"
        >
          <h2
            id="best-places-heading"
            className="text-3xl md:text-5xl lg:text-6xl font-bold uppercase tracking-tight font-display mb-3 leading-[0.95]"
          >
            Best places to <span className="text-gradient-red">start</span>
          </h2>
          <p className="text-base md:text-lg text-muted-foreground font-body leading-relaxed">
            These are GearUpToFit&apos;s most useful guides for choosing better gear, calculating realistic fitness
            targets, and building smarter training habits.
          </p>
        </motion.div>

        <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4 list-none p-0">
          {bestPlacesToStart.map((link, i) => (
            <motion.li
              key={link.url}
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.1 }}
              transition={{ duration: 0.4, delay: Math.min(i * 0.03, 0.3), ease: [0.16, 1, 0.3, 1] }}
            >
              <a
                href={link.url}
                className="group flex items-center justify-between gap-3 bg-card border border-border hover:border-primary/50 hover:bg-card/70 px-4 py-3.5 rounded-sm transition-colors duration-200"
              >
                <span className="font-body text-sm md:text-base text-foreground group-hover:text-primary transition-colors duration-200">
                  {link.label}
                </span>
                <ArrowUpRight className="w-4 h-4 text-muted-foreground group-hover:text-primary shrink-0 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </a>
            </motion.li>
          ))}
        </ul>
      </div>
    </section>
  );
};

export default BestPlacesToStart;
