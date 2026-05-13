import { motion } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { useState } from "react";

interface FAQ {
  question: string;
  answer: string;
}

const faqs: FAQ[] = [
  {
    question: "What is GearUpToFit?",
    answer:
      "GearUpToFit is a running gear, fitness tools, fitness watch, training plan, and calculator website that helps users choose running shoes, compare fitness watches, use calculators, and build smarter fitness plans.",
  },
  {
    question: "Can GearUpToFit help me find the right running shoes?",
    answer:
      "Yes. The Running Shoe Finder helps match users with running shoes based on goals, terrain, cushioning preferences, support needs, fit preferences, and budget.",
  },
  {
    question: "Can GearUpToFit help me choose a fitness watch?",
    answer:
      "Yes. Watch Match helps users compare fitness watches, running watches, and smartwatches based on GPS, battery life, heart-rate tracking, training features, health metrics, activity preferences, and budget.",
  },
  {
    question: "Does GearUpToFit offer fitness plans?",
    answer:
      "Yes. GearUpToFit offers a Fitness Plan tool that helps users build a realistic plan based on their goal, fitness level, schedule, and training preferences.",
  },
  {
    question: "Does GearUpToFit offer free fitness calculators?",
    answer:
      "Yes. GearUpToFit offers fitness and health calculators for calories, macros, BMI, heart-rate zones, running pace, and other training targets.",
  },
  {
    question: "Are GearUpToFit recommendations independent?",
    answer:
      "GearUpToFit aims to provide transparent, practical, and research-aware recommendations. Some pages may include affiliate links, but recommendations remain user-first and clearly disclosed.",
  },
  {
    question: "Is GearUpToFit medical advice?",
    answer:
      "No. GearUpToFit provides educational fitness information and planning tools. Users should consult a qualified professional for medical, injury, or health-specific advice.",
  },
];

const FAQItem = ({ faq, index }: { faq: FAQ; index: number }) => {
  const [open, setOpen] = useState(false);
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ duration: 0.4, delay: index * 0.06, ease: [0.16, 1, 0.3, 1] }}
      className="border border-border rounded-sm overflow-hidden"
    >
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-5 py-4 sm:px-6 sm:py-5 text-left hover:bg-card/60 transition-colors duration-200"
        aria-expanded={open}
      >
        <span className="font-display text-sm sm:text-base uppercase tracking-wide font-semibold pr-4">
          {faq.question}
        </span>
        <ChevronDown
          className={`w-5 h-5 text-primary flex-shrink-0 transition-transform duration-300 ${open ? "rotate-180" : ""}`}
        />
      </button>
      <div
        className={`overflow-hidden transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${open ? "max-h-[500px] opacity-100" : "max-h-0 opacity-0"}`}
      >
        <p className="px-5 pb-4 sm:px-6 sm:pb-5 text-sm sm:text-base text-muted-foreground font-body leading-relaxed">
          {faq.answer}
        </p>
      </div>
    </motion.div>
  );
};

const FAQSection = () => {
  return (
    <section className="py-16 md:py-24 relative" aria-label="GearUpToFit FAQ">
      <div className="container relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="mb-10"
        >
          <h2 className="text-3xl md:text-5xl lg:text-6xl font-bold uppercase tracking-tight font-display mb-3 leading-[0.95]">
            GearUpToFit <span className="text-gradient-red">FAQ</span>
          </h2>
          <p className="text-muted-foreground text-base sm:text-lg font-body max-w-2xl">
            Quick answers about our running shoe finder, Watch Match, fitness plan, and calculators.
          </p>
        </motion.div>

        <div className="max-w-3xl flex flex-col gap-3">
          {faqs.map((faq, i) => (
            <FAQItem key={i} faq={faq} index={i} />
          ))}
        </div>
      </div>
    </section>
  );
};

export default FAQSection;
