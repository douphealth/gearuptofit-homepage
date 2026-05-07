import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";

const CTASection = () => {
  return (
    <section className="py-24 md:py-32 relative overflow-hidden">
      {/* Background accent */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-background to-background" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-primary/5 blur-[120px]" />

      <div className="container relative z-10 text-center">
        <motion.div
          initial={{ opacity: 0, y: 20, filter: "blur(4px)" }}
          whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        >
          <h2 className="text-4xl md:text-6xl lg:text-7xl font-bold uppercase tracking-tight font-display mb-6 leading-[0.95]">
            Ready to
            <span className="text-gradient-red block">Transform?</span>
          </h2>

          <p className="text-lg md:text-xl text-muted-foreground font-body max-w-2xl mx-auto mb-10 leading-relaxed">
            Get personalized shoe recommendations with our AI-powered Shoe Finder, or build your custom
            8-week training plan. Science-backed fitness tools designed for real results.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a
              href="https://gearuptofit.com/shoe-match/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 px-10 py-5 bg-primary font-display text-xl uppercase tracking-wider font-semibold transition-all duration-200 hover:brightness-110 active:scale-[0.97] glow-red rounded-sm"
            >
              Find Your Perfect Shoe
              <ArrowRight className="w-5 h-5" />
            </a>
            <a
              href="https://fitness-plan.gearuptofit.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 px-10 py-5 border border-primary/50 font-display text-xl uppercase tracking-wider font-semibold transition-all duration-200 hover:bg-primary/10 hover:border-primary active:scale-[0.97] rounded-sm text-primary"
            >
              8-Week Plan
            </a>
          </div>
        </motion.div>
      </div>
    </section>
  );
};

export default CTASection;
