import { motion } from "framer-motion";
import { toolLinks } from "@/lib/blog-data";
import { Calculator, Dumbbell, Pill, ArrowRight } from "lucide-react";

const icons = [Calculator, Pill, Dumbbell];

const ToolsSection = () => {
  return (
    <section className="py-24 md:py-32">
      <div className="container">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="mb-12"
        >
          <h2 className="text-4xl md:text-5xl font-bold uppercase tracking-tight font-display mb-3">
            Free Fitness Tools
          </h2>
          <p className="text-muted-foreground text-lg font-body">
            Interactive calculators and resources to fuel your progress.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {toolLinks.map((tool, i) => {
            const Icon = icons[i];
            return (
              <motion.a
                key={tool.url}
                href={tool.url}
                target="_blank"
                rel="noopener noreferrer"
                initial={{ opacity: 0, y: 16, filter: "blur(4px)" }}
                whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                viewport={{ once: true, amount: 0.2 }}
                transition={{ duration: 0.5, delay: i * 0.1, ease: [0.16, 1, 0.3, 1] }}
                className="group relative bg-card border border-border p-8 card-hover block rounded-sm overflow-hidden"
              >
                <div className="absolute bottom-0 right-0 w-32 h-32 bg-primary/5 rounded-full translate-y-12 translate-x-12 group-hover:scale-[2] transition-transform duration-700" />
                <Icon className="w-8 h-8 text-primary mb-4" />
                <h3 className="text-lg font-bold uppercase tracking-wide font-display mb-1 group-hover:text-primary transition-colors duration-200">
                  {tool.name}
                </h3>
                <p className="text-sm text-muted-foreground font-body">
                  {tool.description}
                </p>
              </motion.a>
            );
          })}
        </div>

        {/* New Featured Tools */}
        <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4">
          <motion.a
            href="https://gearuptofit.com/shoe-match/"
            target="_blank"
            rel="noopener noreferrer"
            initial={{ opacity: 0, y: 16, filter: "blur(4px)" }}
            whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            viewport={{ once: true, amount: 0.2 }}
            transition={{ duration: 0.5, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="group relative bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/30 p-8 card-hover block rounded-sm overflow-hidden"
          >
            <div className="absolute top-0 right-0 w-40 h-40 bg-primary/10 rounded-full -translate-y-20 translate-x-20 group-hover:scale-[2] transition-transform duration-700" />
            <div className="relative z-10">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 bg-primary/20 text-primary text-xs font-bold uppercase tracking-wider rounded-sm mb-3">
                New
              </span>
              <h3 className="text-xl font-bold uppercase tracking-wide font-display mb-2 group-hover:text-primary transition-colors duration-200">
                Shoe Finder Tool
              </h3>
              <p className="text-sm text-muted-foreground font-body mb-4">
                Answer 9 quick questions and get a personalized shoe recommendation based on your training, pace, and goals.
              </p>
              <span className="inline-flex items-center gap-2 text-primary font-display text-sm uppercase tracking-wider font-semibold">
                Find Your Perfect Shoe
                <ArrowRight className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-1" />
              </span>
            </div>
          </motion.a>

          <motion.a
            href="https://gearuptofit.com/fitness-plan/"
            target="_blank"
            rel="noopener noreferrer"
            initial={{ opacity: 0, y: 16, filter: "blur(4px)" }}
            whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            viewport={{ once: true, amount: 0.2 }}
            transition={{ duration: 0.5, delay: 0.4, ease: [0.16, 1, 0.3, 1] }}
            className="group relative bg-gradient-to-br from-secondary/30 to-secondary/10 border border-secondary/30 p-8 card-hover block rounded-sm overflow-hidden"
          >
            <div className="absolute top-0 right-0 w-40 h-40 bg-secondary/20 rounded-full -translate-y-20 translate-x-20 group-hover:scale-[2] transition-transform duration-700" />
            <div className="relative z-10">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 bg-secondary text-secondary-foreground text-xs font-bold uppercase tracking-wider rounded-sm mb-3">
                Popular
              </span>
              <h3 className="text-xl font-bold uppercase tracking-wide font-display mb-2 group-hover:text-primary transition-colors duration-200">
                8-Week Training Plan
              </h3>
              <p className="text-sm text-muted-foreground font-body mb-4">
                BUILD YOUR CUSTOM RUNNING & FITNESS PLAN — personalized to your goals, fitness level, and schedule.
              </p>
              <span className="inline-flex items-center gap-2 text-primary font-display text-sm uppercase tracking-wider font-semibold">
                Explore Training Plans
                <ArrowRight className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-1" />
              </span>
            </div>
          </motion.a>

          <motion.a
            href="https://gearuptofit.com/watch-match/"
            target="_blank"
            rel="noopener noreferrer"
            initial={{ opacity: 0, y: 16, filter: "blur(4px)" }}
            whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            viewport={{ once: true, amount: 0.2 }}
            transition={{ duration: 0.5, delay: 0.5, ease: [0.16, 1, 0.3, 1] }}
            className="group relative bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/30 p-8 card-hover block rounded-sm overflow-hidden"
          >
            <div className="absolute top-0 right-0 w-40 h-40 bg-primary/10 rounded-full -translate-y-20 translate-x-20 group-hover:scale-[2] transition-transform duration-700" />
            <div className="relative z-10">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 bg-primary/20 text-primary text-xs font-bold uppercase tracking-wider rounded-sm mb-3">
                New
              </span>
              <h3 className="text-xl font-bold uppercase tracking-wide font-display mb-2 group-hover:text-primary transition-colors duration-200">
                Watch Match
              </h3>
              <p className="text-sm text-muted-foreground font-body mb-4">
                Find your ideal smartwatch or fitness tracker — matched to your sport, budget, and ecosystem.
              </p>
              <span className="inline-flex items-center gap-2 text-primary font-display text-sm uppercase tracking-wider font-semibold">
                Match Your Watch
                <ArrowRight className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-1" />
              </span>
            </div>
          </motion.a>
        </div>
      </div>
    </section>
  );
};

export default ToolsSection;
