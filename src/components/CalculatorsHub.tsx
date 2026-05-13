import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";

interface Calculator {
  name: string;
  description: string;
  url: string;
  tag?: string;
}

interface CalcCategory {
  title: string;
  emoji: string;
  calcs: Calculator[];
}

const calcCategories: CalcCategory[] = [
  {
    title: "Body Metrics",
    emoji: "📏",
    calcs: [
      { name: "BMI Calculator", description: "Body Mass Index with visual health indicators", url: "https://gearuptofit.com/fitness-and-health-calculators/calculate-bmi-bmr-and-whr-now/", tag: "Popular" },
      { name: "Body Fat %", description: "Gender-specific body fat percentage", url: "https://gearuptofit.com/fitness-and-health-calculators/body-fat-calculator/" },
      { name: "Lean Body Mass", description: "Muscle composition & fitness goals", url: "https://gearuptofit.com/fitness-and-health-calculators/lean-body-mass-calculator/" },
      { name: "Ideal Body Weight", description: "Based on height, age & body frame", url: "https://gearuptofit.com/fitness-and-health-calculators/ideal-body-weight-ibw-calculator/" },
    ],
  },
  {
    title: "Metabolism & Energy",
    emoji: "⚡",
    calcs: [
      { name: "TDEE Calculator", description: "Total Daily Energy Expenditure", url: "https://gearuptofit.com/fitness-and-health-calculators/total-daily-energy-expenditure-calculation-tool/", tag: "Essential" },
      { name: "BMR Calculator", description: "Basal Metabolic Rate at rest", url: "https://gearuptofit.com/fitness-and-health-calculators/basal-metabolic-rate-calculation-tool/" },
      { name: "Calorie Calculator", description: "Personalized calorie recommendations", url: "https://gearuptofit.com/fitness-and-health-calculators/calorie-calculation-tool/" },
      { name: "Advanced Fitness Calc", description: "BMI + BMR + body fat in one tool", url: "https://gearuptofit.com/fitness-and-health-calculators/advanced-fitness-calculator/", tag: "All-in-One" },
    ],
  },
  {
    title: "Nutrition & Diet",
    emoji: "🥗",
    calcs: [
      { name: "Macro Calculator", description: "Optimal macronutrient ratios", url: "https://gearuptofit.com/fitness-and-health-calculators/macro-calculator/", tag: "New" },
      { name: "Weight Loss Macros", description: "Macros optimized for fat loss", url: "https://gearuptofit.com/fitness-and-health-calculators/calculate-macronutrients-for-weight-loss/" },
      { name: "Meal Calorie Calc", description: "Track meal-level calories", url: "https://gearuptofit.com/fitness-and-health-calculators/meal-calorie-calculator/" },
      { name: "Keto Macros", description: "Ketogenic diet macro planning", url: "https://gearuptofit.com/nutrition/keto-macronutrients/" },
    ],
  },
  {
    title: "Activity & Wellness",
    emoji: "🏃",
    calcs: [
      { name: "Calorie Burn Calc", description: "Calories burned per activity", url: "https://gearuptofit.com/fitness-and-health-calculators/calculate-your-calorie-burn-today/" },
      { name: "Water Intake", description: "Optimal daily hydration", url: "https://gearuptofit.com/nutrition/how-water-can-benefit-your-health/" },
      { name: "Meal Planner", description: "Personalized calorie-controlled plans", url: "https://gearuptofit.com/fitness-and-health-calculators/meal-planning-with-calorie-control/" },
      { name: "RMR Calculator", description: "Resting Metabolic Rate", url: "https://gearuptofit.com/fitness/resting-metabolic-rate-rmr-calculation-tool/" },
    ],
  },
];

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06 } },
};

const item = {
  hidden: { opacity: 0, y: 12, filter: "blur(4px)" },
  show: { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: 0.45, ease: [0.16, 1, 0.3, 1] } },
};

const CalculatorsHub = () => {
  return (
    <section id="calculators" className="py-24 md:py-32 relative">
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-primary/[0.03] to-transparent" />

      <div className="container relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="mb-12"
        >
          <h2 className="text-4xl md:text-5xl lg:text-6xl font-bold uppercase tracking-tight font-display mb-3 leading-[0.95]">
            Free Fitness <span className="text-gradient-red">Calculators</span>
          </h2>
          <p className="text-muted-foreground text-lg font-body max-w-2xl">
            16 science-based tools to measure, track, and optimize every aspect of your fitness. All free, no signup required.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {calcCategories.map((cat, catIdx) => (
            <motion.div
              key={cat.title}
              initial={{ opacity: 0, y: 16, filter: "blur(4px)" }}
              whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              viewport={{ once: true, amount: 0.2 }}
              transition={{ duration: 0.5, delay: catIdx * 0.1, ease: [0.16, 1, 0.3, 1] }}
              className="bg-card border border-border rounded-sm overflow-hidden"
            >
              <div className="px-6 py-4 border-b border-border flex items-center gap-3">
                <span className="text-xl">{cat.emoji}</span>
                <h3 className="font-display text-lg uppercase tracking-wide font-bold">
                  {cat.title}
                </h3>
              </div>

              <motion.div
                variants={container}
                initial="hidden"
                whileInView="show"
                viewport={{ once: true, amount: 0.1 }}
                className="divide-y divide-border"
              >
                {cat.calcs.map((calc) => (
                  <motion.a
                    key={calc.url}
                    variants={item}
                    href={calc.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group flex items-center justify-between px-6 py-4 hover:bg-primary/5 transition-colors duration-200 active:scale-[0.99]"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-display text-sm uppercase tracking-wide font-semibold group-hover:text-primary transition-colors duration-200">
                          {calc.name}
                        </span>
                        {calc.tag && (
                          <span className="text-[10px] font-display uppercase tracking-widest px-2 py-0.5 bg-primary/15 text-primary border border-primary/30 rounded-sm">
                            {calc.tag}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground font-body mt-0.5 truncate">
                        {calc.description}
                      </p>
                    </div>
                    <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all duration-200 flex-shrink-0 ml-4" />
                  </motion.a>
                ))}
              </motion.div>
            </motion.div>
          ))}
        </div>

        {/* Full calculator hub link */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{ duration: 0.5, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
          className="mt-8 text-center"
        >
          <a
            href="https://gearuptofit.com/fitness-and-health-calculators/"
            aria-label="Explore all fitness and health calculators"
            className="inline-flex items-center gap-2 px-8 py-4 bg-primary font-display text-lg uppercase tracking-wider font-semibold transition-all duration-200 hover:brightness-110 active:scale-[0.97] glow-red rounded-sm"
          >
            Explore Fitness Calculators
            <ArrowRight className="w-5 h-5" />
          </a>
        </motion.div>
      </div>
    </section>
  );
};

export default CalculatorsHub;
