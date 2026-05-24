import { motion } from "framer-motion";
import { ArrowRight, Footprints } from "lucide-react";
import { featuredShoeGuides } from "@/lib/homepage-strategic";

const FeaturedShoeGuides = () => {
  return (
    <section
      id="featured-shoe-guides"
      aria-labelledby="featured-shoe-guides-heading"
      className="py-20 md:py-28 relative"
    >
      <div className="container relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="mb-10 max-w-3xl"
        >
          <h2
            id="featured-shoe-guides-heading"
            className="text-3xl md:text-5xl lg:text-6xl font-bold uppercase tracking-tight font-display mb-3 leading-[0.95]"
          >
            Featured <span className="text-gradient-red">running shoe guides</span>
          </h2>
          <p className="text-base md:text-lg text-muted-foreground font-body leading-relaxed">
            Start with the right shoe category before comparing brands. These guides help you choose based on fit,
            comfort, mileage, support needs, surface, and budget.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-5">
          {featuredShoeGuides.map((card, i) => (
            <motion.a
              key={card.url}
              href={card.url}
              aria-label={card.title}
              initial={{ opacity: 0, y: 16, filter: "blur(4px)" }}
              whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              viewport={{ once: true, amount: 0.15 }}
              transition={{ duration: 0.5, delay: i * 0.06, ease: [0.16, 1, 0.3, 1] }}
              className="group relative bg-card border border-border hover:border-primary/50 p-6 md:p-7 rounded-sm overflow-hidden transition-colors duration-300"
            >
              <div className="absolute top-0 right-0 w-40 h-40 bg-primary/5 rounded-full -translate-y-20 translate-x-20 group-hover:scale-150 transition-transform duration-700" />
              <div className="relative z-10">
                <Footprints className="w-7 h-7 text-primary mb-4" />
                <h3 className="text-lg md:text-xl font-bold uppercase tracking-wide font-display mb-2 group-hover:text-primary transition-colors duration-200">
                  {card.title}
                </h3>
                <p className="text-sm md:text-base text-muted-foreground font-body leading-relaxed mb-5">
                  {card.text}
                </p>
                <span className="inline-flex items-center gap-2 text-primary font-display text-xs md:text-sm uppercase tracking-wider font-semibold">
                  Read the guide
                  <ArrowRight className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-1" />
                </span>
              </div>
            </motion.a>
          ))}
        </div>
      </div>
    </section>
  );
};

export default FeaturedShoeGuides;
