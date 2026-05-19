import { motion } from "framer-motion";
import { ArrowRight, Footprints, Watch, Pill, ClipboardList, Calculator } from "lucide-react";

interface ToolCard {
  title: string;
  description: string;
  cta: string;
  url: string;
  icon: React.ComponentType<{ className?: string }>;
  anchorLabel: string;
}

const tools: ToolCard[] = [
  {
    title: "Running Shoe Finder",
    description:
      "Find running shoes that match your foot type, running goals, terrain, cushioning needs, support needs, and budget.",
    cta: "Find My Running Shoes",
    url: "https://gearuptofit.com/shoe-finder/",
    icon: Footprints,
    anchorLabel: "running shoe finder",
  },
  {
    title: "Watch Match",
    description:
      "Compare fitness watches, running watches, and smartwatches based on GPS, battery life, heart-rate tracking, training features, health metrics, activity preferences, and budget.",
    cta: "Find My Fitness Watch",
    url: "https://gearuptofit.com/watch-match/",
    icon: Watch,
    anchorLabel: "fitness watch finder",
  },
  {
    title: "Supplement Match",
    description:
      "Match vitamins and supplements to your training goals, diet, health profile, and budget with evidence-based recommendations and safety-aware guidance.",
    cta: "Find My Supplement Match",
    url: "https://lovable.dev/projects/c0d2104a-7e3c-45a2-9f52-6ab2ec917c44",
    icon: Pill,
    anchorLabel: "supplement and vitamin match",
  },
  {
    title: "Fitness Plan",
    description:
      "Build a realistic fitness plan based on your goal, fitness level, schedule, training preferences, and available equipment.",
    cta: "Build My Fitness Plan",
    url: "https://gearuptofit.com/fitness-plan/",
    icon: ClipboardList,
    anchorLabel: "build a fitness plan",
  },
  {
    title: "Fitness & Health Calculators",
    description:
      "Calculate calories, macros, BMI, heart-rate zones, pace, and training targets using practical fitness calculators.",
    cta: "Explore Calculators",
    url: "https://gearuptofit.com/fitness-and-health-calculators/",
    icon: Calculator,
    anchorLabel: "fitness and health calculators",
  },
];

const StartWithRightTool = () => {
  return (
    <section
      id="tools"
      className="py-20 md:py-28 relative"
      aria-label="Start With the Right Fitness Tool"
    >
      <div className="container relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="mb-10 max-w-3xl"
        >
          <h2 className="text-3xl md:text-5xl lg:text-6xl font-bold uppercase tracking-tight font-display mb-3 leading-[0.95]">
            Start With the <span className="text-gradient-red">Right Fitness Tool</span>
          </h2>
          <p className="text-base md:text-lg text-muted-foreground font-body leading-relaxed" data-speakable>
            GearUpToFit gives you free tools to match your shoes, watch, training, and fitness goals — without
            guessing.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-5">
          {tools.map((tool, i) => {
            const Icon = tool.icon;
            return (
              <motion.a
                key={tool.url}
                href={tool.url}
                aria-label={tool.anchorLabel}
                initial={{ opacity: 0, y: 16, filter: "blur(4px)" }}
                whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                viewport={{ once: true, amount: 0.15 }}
                transition={{ duration: 0.5, delay: i * 0.08, ease: [0.16, 1, 0.3, 1] }}
                className="group relative bg-card border border-border hover:border-primary/50 p-6 md:p-7 rounded-sm overflow-hidden transition-colors duration-300"
              >
                <div className="absolute top-0 right-0 w-40 h-40 bg-primary/5 rounded-full -translate-y-20 translate-x-20 group-hover:scale-150 transition-transform duration-700" />
                <div className="relative z-10">
                  <Icon className="w-8 h-8 text-primary mb-4" />
                  <h3 className="text-xl md:text-2xl font-bold uppercase tracking-wide font-display mb-2 group-hover:text-primary transition-colors duration-200">
                    {tool.title}
                  </h3>
                  <p className="text-sm md:text-base text-muted-foreground font-body leading-relaxed mb-5">
                    {tool.description}
                  </p>
                  <span className="inline-flex items-center gap-2 text-primary font-display text-sm uppercase tracking-wider font-semibold">
                    {tool.cta}
                    <ArrowRight className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-1" />
                  </span>
                </div>
              </motion.a>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default StartWithRightTool;
