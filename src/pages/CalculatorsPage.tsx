import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import CategoryPageHero from "@/components/CategoryPageHero";
import CalculatorsHub from "@/components/CalculatorsHub";
import heroImg from "@/assets/hero-calculators-page.jpg";
import CategoryQuiz from "@/components/CategoryQuiz";
import type { QuizStep, Recommendation } from "@/components/CategoryQuiz";
import { Scale, Flame, Salad, Activity, Target, Dumbbell, Heart, Zap } from "lucide-react";

const steps: QuizStep[] = [
  {
    question: "What do you want to calculate?",
    subtitle: "We'll point you to the exact calculators that matter for your goal.",
    options: [
      { label: "Body Composition", value: "body", icon: <Scale className="w-7 h-7" />, description: "BMI, body fat %, lean mass, ideal weight", visual: "from-blue-600/20 to-indigo-700/20", stat: "4 tools" },
      { label: "Calories & Metabolism", value: "metabolism", icon: <Flame className="w-7 h-7" />, description: "TDEE, BMR, calorie needs, calorie burn", visual: "from-orange-600/20 to-red-700/20", stat: "4 tools" },
      { label: "Nutrition & Macros", value: "nutrition", icon: <Salad className="w-7 h-7" />, description: "Macro ratios, meal calories, keto macros", visual: "from-emerald-600/20 to-teal-700/20", stat: "4 tools" },
      { label: "Activity & Wellness", value: "activity", icon: <Activity className="w-7 h-7" />, description: "Calorie burn, water intake, meal planner", visual: "from-purple-600/20 to-violet-700/20", stat: "4 tools" },
    ],
  },
  {
    question: "What's your primary goal?",
    subtitle: "Your goal determines which numbers to prioritize.",
    options: [
      { label: "Lose Weight", value: "weight-loss", icon: <Target className="w-7 h-7" />, description: "Create a sustainable calorie deficit", visual: "from-orange-600/20 to-red-700/20", stat: "Deficit" },
      { label: "Build Muscle", value: "muscle", icon: <Dumbbell className="w-7 h-7" />, description: "Caloric surplus with high protein", visual: "from-blue-600/20 to-indigo-700/20", stat: "Surplus" },
      { label: "Health Monitoring", value: "health", icon: <Heart className="w-7 h-7" />, description: "Track baseline health metrics", visual: "from-pink-600/20 to-rose-700/20", stat: "Baseline" },
      { label: "Athletic Performance", value: "performance", icon: <Zap className="w-7 h-7" />, description: "Optimize fuel and recovery", visual: "from-amber-600/20 to-yellow-700/20", stat: "Optimize" },
    ],
  },
];

const getRec = (answers: string[]): Recommendation => {
  const [category, goal] = answers;
  const recs: Record<string, Recommendation> = {
    "body+weight-loss": {
      title: "Your Weight Loss Body Metrics",
      subtitle: "Essential calculators for fat loss tracking",
      description: "Start by establishing your baseline body composition. Track these numbers monthly to see real progress beyond the scale.",
      tip: "Measure body fat % alongside scale weight. You might be losing fat and gaining muscle — the scale won't show that.",
      links: [
        { label: "Why Water Fasting Is Dangerous", url: "https://gearuptofit.com/nutrition/why-water-fasting-is-an-unhealthy-way-to-lose-weight-dangers/", tag: "Must Read" },
      ],
      calculators: [
        { label: "Body Fat Calculator", url: "https://gearuptofit.com/fitness-and-health-calculators/body-fat-calculator/", tag: "Start Here" },
        { label: "BMI Calculator", url: "https://gearuptofit.com/fitness-and-health-calculators/calculate-bmi-bmr-and-whr-now/", tag: "Baseline" },
        { label: "Lean Body Mass Calculator", url: "https://gearuptofit.com/fitness-and-health-calculators/lean-body-mass-calculator/" },
        { label: "Ideal Body Weight", url: "https://gearuptofit.com/fitness-and-health-calculators/ideal-body-weight-ibw-calculator/" },
      ],
    },
    "metabolism+weight-loss": {
      title: "Your Metabolism & Deficit Calculator",
      subtitle: "Find your exact calorie target for fat loss",
      description: "Your TDEE is the starting point. Subtract 300–500 calories for a sustainable deficit that preserves muscle while burning fat.",
      tip: "Recalculate every 4–6 weeks. As you lose weight, your TDEE drops — your calorie target needs to adjust too.",
      links: [
        { label: "Glycogen Metabolism Explained", url: "https://gearuptofit.com/nutrition/glycogen-metabolism/", tag: "Science" },
      ],
      calculators: [
        { label: "TDEE Calculator", url: "https://gearuptofit.com/fitness-and-health-calculators/total-daily-energy-expenditure-calculation-tool/", tag: "Essential" },
        { label: "BMR Calculator", url: "https://gearuptofit.com/fitness-and-health-calculators/basal-metabolic-rate-calculation-tool/", tag: "Baseline" },
        { label: "Calorie Calculator", url: "https://gearuptofit.com/fitness-and-health-calculators/calorie-calculation-tool/" },
        { label: "Calorie Burn Calculator", url: "https://gearuptofit.com/fitness-and-health-calculators/calculate-your-calorie-burn-today/" },
      ],
    },
    "nutrition+muscle": {
      title: "Your Muscle-Building Macro Setup",
      subtitle: "Calculate the perfect macros for gains",
      description: "Muscle growth requires a caloric surplus and high protein. Use these calculators to dial in your exact macro ratios.",
      tip: "Aim for 1.6–2.2g protein per kg bodyweight. Distribute evenly across 4–5 meals for optimal muscle protein synthesis.",
      links: [
        { label: "Creatine: The No-BS Guide", url: "https://gearuptofit.com/running/creatine-for-runners/", tag: "Supplement" },
      ],
      calculators: [
        { label: "Macro Calculator", url: "https://gearuptofit.com/fitness-and-health-calculators/macro-calculator/", tag: "Essential" },
        { label: "Meal Calorie Calculator", url: "https://gearuptofit.com/fitness-and-health-calculators/meal-calorie-calculator/" },
        { label: "Weight Loss Macros", url: "https://gearuptofit.com/fitness-and-health-calculators/calculate-macronutrients-for-weight-loss/" },
        { label: "Keto Macros", url: "https://gearuptofit.com/nutrition/keto-macronutrients/" },
      ],
    },
    "activity+performance": {
      title: "Your Performance Activity Tracker",
      subtitle: "Optimize fuel, hydration, and recovery",
      description: "Track calories burned per activity, plan meals around training, and optimize hydration for peak performance.",
      tip: "Weigh yourself before and after long sessions. Every pound lost = 16oz of fluid to replace.",
      links: [
        { label: "VO2 Max for Performance", url: "https://gearuptofit.com/fitness/vo2-max-for-endurance-performance/", tag: "Key Metric" },
      ],
      calculators: [
        { label: "Calorie Burn Calculator", url: "https://gearuptofit.com/fitness-and-health-calculators/calculate-your-calorie-burn-today/", tag: "Essential" },
        { label: "Water Intake Guide", url: "https://gearuptofit.com/nutrition/how-water-can-benefit-your-health/", tag: "Hydration" },
        { label: "Meal Planner", url: "https://gearuptofit.com/fitness-and-health-calculators/meal-planning-with-calorie-control/" },
        { label: "RMR Calculator", url: "https://gearuptofit.com/fitness/resting-metabolic-rate-rmr-calculation-tool/" },
      ],
    },
  };

  const key = `${category}+${goal}`;
  return recs[key] || {
    title: "Your Calculator Toolkit",
    subtitle: "Personalized calculator recommendations",
    description: "Based on your goals, here are the most impactful calculators to establish your baseline and track progress.",
    tip: "Start with TDEE — it's the foundation for every nutrition and fitness strategy.",
    links: [
      { label: "All Fitness Calculators", url: "https://fitness-calculators.gearuptofit.com/", tag: "Full Suite" },
    ],
    calculators: [
      { label: "TDEE Calculator", url: "https://gearuptofit.com/fitness-and-health-calculators/total-daily-energy-expenditure-calculation-tool/", tag: "Essential" },
      { label: "BMI Calculator", url: "https://gearuptofit.com/fitness-and-health-calculators/calculate-bmi-bmr-and-whr-now/" },
      { label: "Macro Calculator", url: "https://gearuptofit.com/fitness-and-health-calculators/macro-calculator/" },
      { label: "Advanced Fitness Calculator", url: "https://gearuptofit.com/fitness-and-health-calculators/advanced-fitness-calculator/", tag: "All-in-One" },
    ],
  };
};

const CalculatorsPage = () => (
  <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
    <SiteHeader />
    <main>
      <CategoryPageHero
        icon="🔢"
        title="Calculators"
        gradient="from-fuchsia-600 to-pink-700"
        h1Override="Fitness & Health Calculators"
        badgeLabel="Calculators Hub"
        ctaLabel="Open All Calculators →"
        description="Free calculators for BMI, BMR, TDEE, macros, body fat, calories, heart-rate zones, running pace, protein targets, and training decisions."
        stats={[{ num: "16", label: "Calculators" }, { num: "4", label: "Categories" }, { num: "0", label: "Signup Needed" }]}
        categoryUrl="https://gearuptofit.com/fitness-and-health-calculators/"
        heroImage={heroImg}
      />
      <CategoryQuiz steps={steps} getRecommendation={getRec} badge="Calculator Finder · 20 Seconds" heading={<>Find Your <span className="text-gradient-red block mt-2">Numbers</span></>} subheading="Answer 2 quick questions and get pointed to the exact calculators you need — no wading through tools you don't." stepLabels={["Category", "Goal"]} />
      <CalculatorsHub />
    </main>
    <SiteFooter />
  </div>
);

export default CalculatorsPage;
