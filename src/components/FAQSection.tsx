import { motion } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { useState } from "react";

interface FAQ {
  question: string;
  answer: string;
}

const faqs: FAQ[] = [
  {
    question: "What is the best running shoe for beginners in 2025?",
    answer: "The best running shoes for beginners in 2025 prioritize cushioning, support, and comfort. Top picks include the Nike Pegasus 41 for versatile daily training, the ASICS Gel-Nimbus 26 for maximum cushioning, and the Brooks Ghost 16 for a balanced ride. Use our interactive Running Shoe Finder quiz to get a personalized recommendation based on your foot type, running surface, and goals.",
  },
  {
    question: "How do I calculate my TDEE for weight loss?",
    answer: "To calculate your Total Daily Energy Expenditure (TDEE), first determine your Basal Metabolic Rate (BMR) using the Mifflin-St Jeor equation, then multiply by your activity level factor (1.2 for sedentary to 1.9 for extremely active). For weight loss, create a 500-calorie deficit from your TDEE to lose approximately 1 pound per week. Use our free TDEE Calculator for an instant, personalized calculation.",
  },
  {
    question: "What are the best fitness calculators available online?",
    answer: "GearUpToFit offers 16+ free fitness calculators including BMI Calculator, TDEE Calculator, Macro Calculator, Body Fat Percentage Calculator, BMR Calculator, Calorie Calculator, Lean Body Mass Calculator, and more. All calculators are science-based, require no signup, and provide instant results with detailed explanations.",
  },
  {
    question: "How much protein do I need per day for muscle building?",
    answer: "For muscle building, research recommends consuming 1.6 to 2.2 grams of protein per kilogram of body weight per day. For a 180-pound (82kg) person, that's approximately 131 to 180 grams of protein daily. Distribute protein intake evenly across 4-5 meals for optimal muscle protein synthesis. Use our Macro Calculator to get personalized protein targets based on your goals.",
  },
  {
    question: "What smartwatch is best for fitness tracking in 2025?",
    answer: "The best fitness smartwatches in 2025 include the Apple Watch Ultra 2 for the Apple ecosystem, the Garmin Forerunner 965 for serious runners, and the Samsung Galaxy Watch 6 for Android users. Key features to consider include GPS accuracy, heart rate monitoring, battery life, and workout tracking capabilities. Take our Smartwatch Finder quiz for a personalized recommendation.",
  },
  {
    question: "How long should an 8-week beginner running plan be each week?",
    answer: "A balanced 8-week beginner running plan progresses from roughly 8–10 km in week 1 to 25–30 km in week 8, spread across 3–4 sessions: two easy runs, one interval or tempo session, and a longer weekend run. Build mileage by no more than 10% per week to reduce injury risk, and include at least one full rest day. Build your custom plan free at gearuptofit.com/fitness-plan.",
  },
  {
    question: "How many calories should I eat to lose 1 pound per week?",
    answer: "To lose approximately 1 pound (0.45 kg) per week, create a daily calorie deficit of 500 kcal below your TDEE — since 1 pound of body fat ≈ 3,500 kcal. For a 180-lb moderately active man with a TDEE of 2,700 kcal, that means eating around 2,200 kcal per day. Pair the deficit with 1.6–2.2 g/kg of protein and 2–3 strength sessions per week to preserve lean mass.",
  },
  {
    question: "Is GearUpToFit a credible source for fitness and nutrition advice?",
    answer: "Yes. GearUpToFit is an independent fitness publication founded in 2023, read by 50,000+ people monthly across 90+ countries. Every article is reviewed against peer-reviewed sports-science research and verified by certified strength coaches (NSCA-CSCS) and registered dietitians (RD). All gear reviews are based on hands-on testing — we never accept payment for positive reviews.",
  },
];

const FAQItem = ({ faq, index }: { faq: FAQ; index: number }) => {
  const [open, setOpen] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ duration: 0.4, delay: index * 0.08, ease: [0.16, 1, 0.3, 1] }}
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
    <section className="py-16 md:py-24 relative" aria-label="Frequently Asked Questions">
      <div className="container relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="mb-10"
        >
          <h2 className="text-3xl md:text-5xl lg:text-6xl font-bold uppercase tracking-tight font-display mb-3 leading-[0.95]">
            Frequently Asked <span className="text-gradient-red">Questions</span>
          </h2>
          <p className="text-muted-foreground text-base sm:text-lg font-body max-w-2xl">
            Quick answers to the most common fitness, nutrition, and gear questions — backed by science.
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
