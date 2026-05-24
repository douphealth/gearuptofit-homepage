import { motion } from "framer-motion";
import { ArrowRight, BookOpen, Scale, ShieldCheck } from "lucide-react";
import { trustCards } from "@/lib/homepage-strategic";

const icons = [BookOpen, Scale, ShieldCheck];

const WhyTrustGearUpToFit = () => {
  return (
    <section
      id="why-trust"
      aria-labelledby="why-trust-heading"
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
            id="why-trust-heading"
            className="text-3xl md:text-5xl lg:text-6xl font-bold uppercase tracking-tight font-display mb-3 leading-[0.95]"
          >
            Why trust <span className="text-gradient-red">GearUpToFit?</span>
          </h2>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-5">
          {trustCards.map((card, i) => {
            const Icon = icons[i];
            return (
              <motion.div
                key={card.title}
                initial={{ opacity: 0, y: 16, filter: "blur(4px)" }}
                whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                viewport={{ once: true, amount: 0.15 }}
                transition={{ duration: 0.5, delay: i * 0.08, ease: [0.16, 1, 0.3, 1] }}
                className="bg-card border border-border p-6 md:p-7 rounded-sm"
              >
                {Icon ? <Icon className="w-7 h-7 text-primary mb-4" /> : null}
                <h3 className="text-lg md:text-xl font-bold uppercase tracking-wide font-display mb-2">
                  {card.title}
                </h3>
                <p className="text-sm md:text-base text-muted-foreground font-body leading-relaxed">
                  {card.text}
                </p>
              </motion.div>
            );
          })}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.5, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className="mt-8"
        >
          <a
            href="https://gearuptofit.com/about-us/"
            className="inline-flex items-center gap-2 text-primary font-display text-sm uppercase tracking-wider font-semibold hover:brightness-110"
          >
            Read our editorial approach
            <ArrowRight className="w-4 h-4" />
          </a>
        </motion.div>
      </div>
    </section>
  );
};

export default WhyTrustGearUpToFit;
