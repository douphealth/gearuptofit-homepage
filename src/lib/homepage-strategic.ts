// Central config for strategic homepage internal links & cards.
// Used by BestPlacesToStart, FeaturedShoeGuides, WhyTrustGearUpToFit, QuickAnswers.

export interface StrategicLink {
  label: string;
  url: string;
}

export const bestPlacesToStart: StrategicLink[] = [
  { label: "Best Running Shoes", url: "https://gearuptofit.com/review/best-running-shoes/" },
  { label: "Best Daily Running Shoes", url: "https://gearuptofit.com/review/best-daily-running-shoes/" },
  { label: "Best Running Shoes for Beginners", url: "https://gearuptofit.com/review/best-running-shoes-for-beginners/" },
  { label: "Best Running Shoes for Wide Feet", url: "https://gearuptofit.com/review/best-running-shoes-for-wide-feet/" },
  { label: "Best Walking Shoes", url: "https://gearuptofit.com/review/best-walking-shoes/" },
  { label: "Most Comfortable Shoes", url: "https://gearuptofit.com/review/most-comfortable-shoes/" },
  { label: "Best Smartwatches for Runners", url: "https://gearuptofit.com/review/best-smartwatches-for-runners/" },
  { label: "Best Compression Boots", url: "https://gearuptofit.com/review/best-compression-boots/" },
  { label: "Fitness & Health Calculators", url: "https://gearuptofit.com/fitness-and-health-calculators/" },
  { label: "Best Supplements Worth Considering", url: "https://gearuptofit.com/health/best-supplements-2025/" },
  { label: "Essential Nutrients for Athletes", url: "https://gearuptofit.com/nutrition/essential-nutrients-for-athletes/" },
  { label: "How to Choose Running Shoes", url: "https://gearuptofit.com/running/how-to-choose-the-right-running-shoes/" },
];

export interface ShoeGuideCard {
  title: string;
  url: string;
  text: string;
}

export const featuredShoeGuides: ShoeGuideCard[] = [
  {
    title: "Best Running Shoes",
    url: "https://gearuptofit.com/review/best-running-shoes/",
    text: "Compare the best running shoes for daily training, long runs, speed work, stability, cushioning, value, and race-day use.",
  },
  {
    title: "Best Daily Running Shoes",
    url: "https://gearuptofit.com/review/best-daily-running-shoes/",
    text: "Find reliable daily trainers for easy runs, weekly mileage, long runs, gym-to-road use, and one-shoe rotations.",
  },
  {
    title: "Best Running Shoes for Beginners",
    url: "https://gearuptofit.com/review/best-running-shoes-for-beginners/",
    text: "Beginner-friendly shoes focused on comfort, stable landings, durability, value, and confidence during walk-run training.",
  },
  {
    title: "Best Running Shoes for Wide Feet",
    url: "https://gearuptofit.com/review/best-running-shoes-for-wide-feet/",
    text: "Roomier shoes for wide feet, toe comfort, bunions, 2E and 4E widths, stable platforms, and better long-run fit.",
  },
  {
    title: "Best Walking Shoes",
    url: "https://gearuptofit.com/review/best-walking-shoes/",
    text: "Comfortable walking shoes for daily steps, standing, travel, treadmill walking, wide feet, and all-day support.",
  },
  {
    title: "Most Comfortable Shoes",
    url: "https://gearuptofit.com/review/most-comfortable-shoes/",
    text: "Comfort-first shoes for walking, standing, recovery, travel, soft cushioning, stable support, and long days on your feet.",
  },
];

export interface TrustCard {
  title: string;
  text: string;
}

export const trustCards: TrustCard[] = [
  {
    title: "Evidence-aware guidance",
    text: "We explain what current research supports, where evidence is limited, and when personal needs matter more than generic advice.",
  },
  {
    title: "Practical product comparisons",
    text: "Gear reviews prioritize fit, comfort, durability, real-world usability, value, and who each product is actually best for.",
  },
  {
    title: "Transparent recommendations",
    text: "Some pages include affiliate links, but recommendations are organized by user need, not brand hype.",
  },
];

export interface QuickAnswer {
  question: string;
  answer: string;
  linkLabel: string;
  linkUrl: string;
}

export const quickAnswers: QuickAnswer[] = [
  {
    question: "How do I choose running shoes?",
    answer:
      "Start with your foot width, weekly mileage, running surface, cushioning preference, comfort, support needs, and budget. Compare shoes by use case, not brand hype.",
    linkLabel: "Use the Running Shoe Finder",
    linkUrl: "https://gearuptofit.com/shoe-finder/",
  },
  {
    question: "Which fitness calculator should I use first?",
    answer:
      "Start with BMR and TDEE to estimate daily energy needs, then use macro, body-fat, heart-rate-zone, and pace calculators to refine your training and nutrition plan.",
    linkLabel: "Explore Fitness Calculators",
    linkUrl: "https://gearuptofit.com/fitness-and-health-calculators/",
  },
  {
    question: "What matters most in a running watch?",
    answer:
      "Prioritize GPS accuracy, battery life, heart-rate tracking, training metrics, recovery insights, navigation, comfort, and compatibility with your phone and apps.",
    linkLabel: "Compare Running Watches",
    linkUrl: "https://gearuptofit.com/review/best-smartwatches-for-runners/",
  },
  {
    question: "Are supplements necessary for fitness?",
    answer:
      "Supplements are optional tools, not replacements for food, sleep, and training. Protein, creatine, caffeine, vitamin D, omega-3, magnesium, and electrolytes may help specific people depending on goals and needs.",
    linkLabel: "Read Supplement Guides",
    linkUrl: "https://gearuptofit.com/nutrition/",
  },
];
