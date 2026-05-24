// =============================================================
// Central homepage configuration.
// Edit titles, URLs, excerpts, and CTAs in this single file.
// All URLs are absolute https://gearuptofit.com/... since the
// React homepage is reverse-proxied into the WordPress domain.
// =============================================================

export const SITE = {
  origin: "https://gearuptofit.com",
} as const;

export interface LinkCard {
  title: string;
  description: string;
  href: string;
  ctaLabel?: string;
}

export interface QACard {
  question: string;
  answer: string;
  linkLabel: string;
  href: string;
}

// ----- HERO -----
export const HERO = {
  eyebrow: "Independent Running & Fitness Decision Platform",
  h1: "Running Shoe Reviews, Fitness Calculators & Smart Fitness Tools",
  sub: "GearUpToFit helps runners and active people choose better running shoes, compare fitness watches, use accurate training calculators, and build practical fitness, nutrition, and recovery plans with evidence-aware guides and practical decision tools.",
  trust: "Evidence-aware guides • Practical product comparisons • Free fitness calculators",
  ctas: [
    { title: "Find Your Running Shoes", href: "https://gearuptofit.com/shoe-finder/", primary: true },
    { title: "Explore Fitness Calculators", href: "https://gearuptofit.com/fitness-and-health-calculators/", primary: true },
    { title: "Compare Fitness Watches", href: "https://gearuptofit.com/review/best-smartwatches-for-runners/", primary: false },
  ],
  decisionPaths: [
    { label: "Running Shoes", href: "https://gearuptofit.com/review/best-running-shoes/" },
    { label: "Fitness Watches", href: "https://gearuptofit.com/review/best-smartwatches-for-runners/" },
    { label: "Calculators", href: "https://gearuptofit.com/fitness-and-health-calculators/" },
    { label: "Nutrition", href: "https://gearuptofit.com/nutrition/" },
    { label: "Training", href: "https://gearuptofit.com/fitness/" },
  ],
} as const;

// ----- QUICK ANSWER -----
export const QUICK_ANSWER = {
  heading: "What is GearUpToFit?",
  body: "GearUpToFit is a running, fitness, gear review, and calculator website that helps runners and active people choose better shoes, compare fitness watches, calculate training targets, and build practical fitness, nutrition, and recovery plans.",
} as const;

// ----- INTENT ROUTER -----
export const INTENT_CARDS: LinkCard[] = [
  {
    title: "Find the right running shoes",
    description: "Match shoes to your foot type, weekly mileage, terrain, cushioning preference, support needs, and budget.",
    href: "https://gearuptofit.com/shoe-finder/",
    ctaLabel: "Open Shoe Finder",
  },
  {
    title: "Calculate your training targets",
    description: "Use calculators for BMI, BMR, TDEE, macros, heart-rate zones, pace, calories, and body composition.",
    href: "https://gearuptofit.com/fitness-and-health-calculators/",
    ctaLabel: "Open Calculators",
  },
  {
    title: "Choose a fitness watch",
    description: "Compare GPS accuracy, battery life, health metrics, running features, mapping, recovery, and price.",
    href: "https://gearuptofit.com/review/best-smartwatches-for-runners/",
    ctaLabel: "Compare Watches",
  },
  {
    title: "Improve nutrition and recovery",
    description: "Learn how to fuel training, recover better, use supplements safely, and avoid common diet mistakes.",
    href: "https://gearuptofit.com/nutrition/",
    ctaLabel: "Read Nutrition Guides",
  },
];

// ----- POPULAR TOOLS -----
export const TOOL_CARDS: LinkCard[] = [
  {
    title: "Running Shoe Finder",
    description: "Answer a few questions and get shoe matches based on your training, fit, and goals.",
    href: "https://gearuptofit.com/shoe-finder/",
  },
  {
    title: "Fitness & Health Calculators",
    description: "BMI, BMR, TDEE, macros, body fat, heart-rate zones, pace, and calorie tools.",
    href: "https://gearuptofit.com/fitness-and-health-calculators/",
  },
  {
    title: "Fitness Plan Builder",
    description: "Build a realistic 8-week plan around your goal, schedule, and fitness level.",
    href: "https://gearuptofit.com/fitness-plan/",
  },
  {
    title: "Supplement Match",
    description: "Match safer, evidence-aware supplement options to your goals and diet.",
    href: "https://gearuptofit.com/supplement-match/",
  },
  {
    title: "Fitness Watch Finder",
    description: "Find a fitness watch matched to your sport, ecosystem, and budget.",
    href: "https://gearuptofit.com/watch-match/",
  },
];

// ----- TOPICAL AUTHORITY MAP -----
export const TOPIC_CARDS: LinkCard[] = [
  {
    title: "Running",
    description: "Training plans, running form, endurance, VO2 max, heart-rate zones, race preparation, and beginner running guides.",
    href: "https://gearuptofit.com/running/",
  },
  {
    title: "Running Shoes",
    description: "Daily trainers, beginner shoes, wide-foot shoes, walking shoes, trail shoes, racing shoes, and comfort picks.",
    href: "https://gearuptofit.com/review/best-running-shoes/",
  },
  {
    title: "Fitness Calculators",
    description: "BMI, BMR, TDEE, macros, body fat, ideal weight, heart-rate zones, pace, calories, and training targets.",
    href: "https://gearuptofit.com/fitness-and-health-calculators/",
  },
  {
    title: "Nutrition",
    description: "Protein, creatine, hydration, supplements, meal planning, fat loss, muscle gain, and athlete nutrition.",
    href: "https://gearuptofit.com/nutrition/",
  },
  {
    title: "Fitness",
    description: "Strength training, low-impact workouts, HIIT, mobility, cardio, home workouts, and beginner fitness plans.",
    href: "https://gearuptofit.com/fitness/",
  },
  {
    title: "Gear Reviews",
    description: "Fitness watches, running sunglasses, recovery tools, hydration gear, heart-rate straps, shoes, and accessories.",
    href: "https://gearuptofit.com/review/",
  },
];

// ----- BEST PLACES TO START -----
export const START_LINKS: { label: string; href: string }[] = [
  { label: "Best Running Shoes", href: "https://gearuptofit.com/review/best-running-shoes/" },
  { label: "Best Daily Running Shoes", href: "https://gearuptofit.com/review/best-daily-running-shoes/" },
  { label: "Best Running Shoes for Beginners", href: "https://gearuptofit.com/review/best-running-shoes-for-beginners/" },
  { label: "Best Running Shoes for Wide Feet", href: "https://gearuptofit.com/review/best-running-shoes-for-wide-feet/" },
  { label: "Best Walking Shoes", href: "https://gearuptofit.com/review/best-walking-shoes/" },
  { label: "Most Comfortable Shoes", href: "https://gearuptofit.com/review/most-comfortable-shoes/" },
  { label: "Best Smartwatches for Runners", href: "https://gearuptofit.com/review/best-smartwatches-for-runners/" },
  { label: "Fitness & Health Calculators", href: "https://gearuptofit.com/fitness-and-health-calculators/" },
  { label: "Best Supplements Worth Considering", href: "https://gearuptofit.com/health/best-supplements-2025/" },
  { label: "Essential Nutrients for Athletes", href: "https://gearuptofit.com/nutrition/essential-nutrients-for-athletes/" },
];

// ----- FEATURED RUNNING SHOE GUIDES -----
export const FEATURED_GUIDES: LinkCard[] = [
  { title: "Best Running Shoes", description: "Our top picks across daily training, racing, and recovery use cases.", href: "https://gearuptofit.com/review/best-running-shoes/" },
  { title: "Best Daily Running Shoes", description: "Durable, comfortable trainers for most weekly mileage.", href: "https://gearuptofit.com/review/best-daily-running-shoes/" },
  { title: "Best Running Shoes for Beginners", description: "Forgiving, easy-to-run-in shoes for new runners.", href: "https://gearuptofit.com/review/best-running-shoes-for-beginners/" },
  { title: "Best Running Shoes for Wide Feet", description: "Roomy toe boxes and accommodating fits for wider feet.", href: "https://gearuptofit.com/review/best-running-shoes-for-wide-feet/" },
  { title: "Best Walking Shoes", description: "Stable, cushioned options for long walks and all-day comfort.", href: "https://gearuptofit.com/review/best-walking-shoes/" },
  { title: "Most Comfortable Shoes", description: "Plush, low-fatigue picks for running, walking, and standing.", href: "https://gearuptofit.com/review/most-comfortable-shoes/" },
];

// ----- QUICK ANSWERS (AEO) -----
export const QUICK_ANSWER_CARDS: QACard[] = [
  {
    question: "How do I choose running shoes?",
    answer: "Start with your foot width, arch comfort, weekly mileage, running surface, cushioning preference, stability needs, and budget. Compare shoes by use case instead of brand hype.",
    linkLabel: "Use the Running Shoe Finder",
    href: "https://gearuptofit.com/shoe-finder/",
  },
  {
    question: "Which fitness calculator should I use first?",
    answer: "Start with BMR and TDEE to estimate daily energy needs, then use macro, body-fat, heart-rate-zone, and pace calculators to refine your training and nutrition plan.",
    linkLabel: "Explore Fitness Calculators",
    href: "https://gearuptofit.com/fitness-and-health-calculators/",
  },
  {
    question: "What matters most in a running watch?",
    answer: "Prioritize GPS accuracy, battery life, heart-rate tracking, training metrics, recovery insights, navigation, comfort, and compatibility with your phone and apps.",
    linkLabel: "Compare Running Watches",
    href: "https://gearuptofit.com/review/best-smartwatches-for-runners/",
  },
  {
    question: "Are supplements necessary for fitness?",
    answer: "Supplements are optional tools, not replacements for food, sleep, and training. Protein, creatine, caffeine, vitamin D, omega-3, magnesium, and electrolytes may help specific people depending on goals and needs.",
    linkLabel: "Read Supplement Guides",
    href: "https://gearuptofit.com/nutrition/",
  },
];

// ----- TRUST -----
export const TRUST_CARDS: LinkCard[] = [
  {
    title: "Evidence-aware guidance",
    description: "We explain what current research supports, where evidence is limited, and when personal needs matter more than generic advice.",
    href: "https://gearuptofit.com/about-us/",
  },
  {
    title: "Practical product comparisons",
    description: "Gear reviews prioritize fit, comfort, durability, real-world usability, value, and who each product is actually best for.",
    href: "https://gearuptofit.com/review/",
  },
  {
    title: "Transparent recommendations",
    description: "Affiliate links may earn a commission, but recommendations are organized by use case, not brand hype.",
    href: "https://gearuptofit.com/about-us/",
  },
];

// ----- LATEST GUIDES (editable static list) -----
export interface LatestGuide {
  category: string;
  title: string;
  excerpt: string;
  href: string;
  imageUrl?: string;
}

export const LATEST_GUIDES: LatestGuide[] = [
  {
    category: "Running Shoes",
    title: "Hoka Speedgoat 7 Review",
    excerpt: "An updated trail trainer with grippier outsole and refined upper for long days on technical terrain.",
    href: "https://gearuptofit.com/running/hoka-speedgoat-7/",
  },
  {
    category: "Calculators",
    title: "How to Use TDEE for Smarter Fat Loss",
    excerpt: "Translate your TDEE into a sustainable calorie target and protein floor without crash dieting.",
    href: "https://gearuptofit.com/fitness-and-health-calculators/",
  },
  {
    category: "Nutrition",
    title: "Essential Nutrients for Athletes",
    excerpt: "The vitamins, minerals, and macros that matter most when training volume goes up.",
    href: "https://gearuptofit.com/nutrition/essential-nutrients-for-athletes/",
  },
  {
    category: "Watches",
    title: "Best Smartwatches for Runners",
    excerpt: "Compare GPS accuracy, battery, training metrics, and recovery features across the top picks.",
    href: "https://gearuptofit.com/review/best-smartwatches-for-runners/",
  },
  {
    category: "Health",
    title: "Best Supplements Worth Considering in 2025",
    excerpt: "A short, evidence-aware shortlist with who each one actually helps and who can skip it.",
    href: "https://gearuptofit.com/health/best-supplements-2025/",
  },
  {
    category: "Running",
    title: "Heart-Rate Zones for Endurance Runners",
    excerpt: "Set easy, threshold, and VO2 zones with simple math you can apply this week.",
    href: "https://gearuptofit.com/running/",
  },
];

// ----- FINAL CTA -----
export const FINAL_CTA = {
  heading: "Make your next fitness decision easier",
  body: "Use GearUpToFit's free tools and evidence-aware guides to choose better shoes, compare gear, calculate realistic targets, and build a smarter plan.",
  ctas: [
    { title: "Start with the Shoe Finder", href: "https://gearuptofit.com/shoe-finder/" },
    { title: "Open Fitness Calculators", href: "https://gearuptofit.com/fitness-and-health-calculators/" },
  ],
} as const;
