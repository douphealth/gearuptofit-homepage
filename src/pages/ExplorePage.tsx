import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { ArrowRight, Sparkles, Search, ChevronDown, Compass } from "lucide-react";
import { Link } from "react-router-dom";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import { useLatestPosts, type LivePost } from "@/hooks/useLatestPosts";

/** ---------- AEO-ready FAQ data (also embedded as FAQPage JSON-LD) ---------- */
const FAQ: { q: string; a: string }[] = [
  {
    q: "What is GearUpToFit Explore?",
    a: "GearUpToFit Explore is a curated discovery hub that routes you to the most relevant fitness, running, nutrition, health, and gear-review articles on gearuptofit.com. Posts are pulled live from the site, organized by topic, and ranked by recency so you always land on current, expert-reviewed coverage.",
  },
  {
    q: "How are the recommended articles selected?",
    a: "Articles are sourced live from gearuptofit.com's editorial feed, filtered by category and freshness. Every piece is written or reviewed by certified strength coaches (NSCA-CSCS), registered dietitians (RD), and gear testers, then cross-checked against peer-reviewed sports-science research from journals like JISSN, ACSM, and the British Journal of Sports Medicine.",
  },
  {
    q: "Are GearUpToFit's gear reviews independent?",
    a: "Yes. GearUpToFit accepts no payment for positive coverage. All shoes, smartwatches, supplements, and home-gym gear are tested hands-on for at least 4 weeks before a verdict is published. Affiliate links may exist on retailer pages but never influence ratings or rankings.",
  },
  {
    q: "How do I find an article on a specific topic?",
    a: "Use the search box on this page to filter by keyword (e.g., 'creatine', 'marathon', 'Garmin'), or jump to a category card (Fitness, Running, Nutrition, Health, Reviews, Calculators). Each category routes you to a dedicated hub with quizzes, calculators, and our most-read guides on that topic.",
  },
  {
    q: "How often is the content on this page updated?",
    a: "The article feed refreshes every 15 minutes from gearuptofit.com's live WordPress publication. New articles, updated guides, and republished evergreen pieces appear automatically — you never need to reload the site to see fresh coverage.",
  },
  {
    q: "Does GearUpToFit offer free fitness calculators?",
    a: "Yes. GearUpToFit publishes 16+ free, science-based calculators including TDEE, BMR, BMI, Macro, Body Fat %, Lean Body Mass, 1RM, VO2max, and Marathon Pace calculators. All work without signup, return instant results, and link to in-depth guides explaining the formulas (Mifflin-St Jeor, Katch-McArdle, etc.) behind each.",
  },
];

/** Topic pillars — match homepage CategoryPillars routing */
const PILLARS = [
  { slug: "fitness", label: "Fitness", desc: "Strength, hypertrophy, programming", path: "/fitness" },
  { slug: "running", label: "Running", desc: "5K to marathon, gait, recovery", path: "/running" },
  { slug: "nutrition", label: "Nutrition", desc: "Macros, protein, supplements", path: "/nutrition" },
  { slug: "health", label: "Health", desc: "Sleep, stress, longevity", path: "/health" },
  { slug: "reviews", label: "Reviews", desc: "Shoes, watches, gear", path: "/reviews" },
  { slug: "calculators", label: "Calculators", desc: "16 science-based tools", path: "/calculators" },
];

const SCHEMA_ID = "ld-explore-page";
const ORG = {
  "@type": "Organization",
  name: "GearUpToFit",
  url: "https://gearuptofit.com",
  logo: { "@type": "ImageObject", url: "https://gearuptofit.com/wp-content/uploads/2023/03/cropped-Grey-Black-Illustration-Gym-Fitness-Logo.png" },
};

function injectStructuredData(posts: LivePost[]) {
  if (typeof document === "undefined") return;
  const existing = document.getElementById(SCHEMA_ID);
  if (existing) existing.remove();

  const itemList = {
    "@type": "ItemList",
    name: "Editor-curated fitness, nutrition, and gear articles",
    numberOfItems: posts.length,
    itemListOrder: "https://schema.org/ItemListOrderDescending",
    itemListElement: posts.slice(0, 24).map((p, i) => ({
      "@type": "ListItem",
      position: i + 1,
      url: p.url,
      name: p.title,
    })),
  };

  const faqPage = {
    "@type": "FAQPage",
    mainEntity: FAQ.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };

  const webPage = {
    "@type": "CollectionPage",
    "@id": "https://gearup-flow-master.lovable.app/explore#webpage",
    url: "https://gearup-flow-master.lovable.app/explore",
    name: "Explore — Expert Fitness, Running & Gear Articles | GearUpToFit",
    description:
      "Discover expert fitness, running, nutrition, health, and gear-review articles from GearUpToFit. Curated by NSCA-CSCS coaches and registered dietitians, refreshed every 15 minutes.",
    inLanguage: "en-US",
    isPartOf: { "@type": "WebSite", url: "https://gearuptofit.com", name: "GearUpToFit" },
    publisher: ORG,
    breadcrumb: {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: "https://gearuptofit.com" },
        { "@type": "ListItem", position: 2, name: "Explore", item: "https://gearup-flow-master.lovable.app/explore" },
      ],
    },
  };

  const graph = {
    "@context": "https://schema.org",
    "@graph": [webPage, itemList, faqPage, ORG],
  };

  const script = document.createElement("script");
  script.type = "application/ld+json";
  script.id = SCHEMA_ID;
  script.text = JSON.stringify(graph);
  document.head.appendChild(script);
}

/** ---------- Page meta (Title + Description for SEO) ---------- */
function setSeoMeta() {
  if (typeof document === "undefined") return;
  document.title = "Explore — Expert Fitness, Running & Gear Articles | GearUpToFit";
  const desc =
    "Discover expert fitness, running, nutrition, health, and gear-review articles from GearUpToFit. Curated by NSCA-CSCS coaches and RDs, updated every 15 minutes.";
  let m = document.querySelector('meta[name="description"]');
  if (!m) { m = document.createElement("meta"); m.setAttribute("name", "description"); document.head.appendChild(m); }
  m.setAttribute("content", desc);

  let canonical = document.querySelector('link[rel="canonical"]');
  if (!canonical) { canonical = document.createElement("link"); canonical.setAttribute("rel", "canonical"); document.head.appendChild(canonical); }
  canonical.setAttribute("href", "https://gearup-flow-master.lovable.app/explore");
}

/** ---------- Article card ---------- */
const PostCard = ({ post, i }: { post: LivePost; i: number }) => (
  <motion.a
    href={post.url}
    target="_blank"
    rel="noreferrer"
    initial={{ opacity: 0, y: 16 }}
    whileInView={{ opacity: 1, y: 0 }}
    viewport={{ once: true, margin: "-50px" }}
    transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1], delay: (i % 6) * 0.04 }}
    className="group bg-card border border-border rounded-sm overflow-hidden hover:border-primary/60 transition-all"
  >
    <div className="aspect-[16/10] overflow-hidden bg-muted">
      <img
        src={post.imageUrl}
        alt={post.title}
        loading="lazy"
        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
      />
    </div>
    <div className="p-4 space-y-2">
      <div className="text-xs uppercase tracking-wider text-primary font-display">{post.category}</div>
      <h3 className="text-base md:text-lg font-bold leading-snug group-hover:text-primary transition-colors line-clamp-2">
        {post.title}
      </h3>
      <p className="text-sm text-muted-foreground line-clamp-2">{post.excerpt}</p>
      <div className="flex items-center justify-between pt-2">
        <span className="text-xs text-muted-foreground">{post.date}</span>
        <ArrowRight className="size-4 text-primary group-hover:translate-x-1 transition-transform" />
      </div>
    </div>
  </motion.a>
);

/** ---------- FAQ accordion ---------- */
const FaqRow = ({ q, a, i }: { q: string; a: string; i: number }) => {
  const [open, setOpen] = useState(i === 0);
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.4 }}
      className="border border-border bg-card rounded-sm overflow-hidden"
    >
      <button
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="w-full text-left p-4 flex items-start justify-between gap-4"
      >
        <span className="font-display font-semibold uppercase tracking-tight text-base md:text-lg">{q}</span>
        <ChevronDown className={`size-5 shrink-0 mt-1 transition-transform ${open ? "rotate-180 text-primary" : "text-muted-foreground"}`} />
      </button>
      {open && (
        <div className="px-4 pb-4 text-sm md:text-base text-muted-foreground leading-relaxed">{a}</div>
      )}
    </motion.div>
  );
};

const ExplorePage = () => {
  const { data: posts = [], isLoading } = useLatestPosts(24);
  const [query, setQuery] = useState("");
  const [activePillar, setActivePillar] = useState<string>("all");

  useEffect(() => { setSeoMeta(); }, []);
  useEffect(() => { if (posts.length) injectStructuredData(posts); }, [posts]);

  const filtered = useMemo(() => {
    let list = posts;
    if (activePillar !== "all") {
      const needle = activePillar.toLowerCase();
      list = list.filter((p) => p.category.toLowerCase().includes(needle) || p.url.toLowerCase().includes(`/${needle}`));
    }
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter((p) => p.title.toLowerCase().includes(q) || p.excerpt.toLowerCase().includes(q));
    }
    return list;
  }, [posts, query, activePillar]);

  const featured = filtered[0];
  const rest = filtered.slice(1);

  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
      <SiteHeader />

      <main role="main">
        {/* HERO */}
        <section className="relative overflow-hidden border-b border-border">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-background to-background" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/15 via-transparent to-transparent opacity-60" />
          <div className="container relative z-10 py-20 md:py-28">
            <motion.div
              initial={{ opacity: 0, y: 20, filter: "blur(4px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
              className="max-w-3xl"
            >
              <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-primary/15 border border-primary/30 rounded-sm mb-6">
                <Compass className="size-4 text-primary" />
                <span className="text-sm font-medium tracking-wide uppercase text-primary font-display">Editor's Discovery Hub</span>
              </div>
              <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold uppercase tracking-tight leading-[0.95] mb-6">
                <span className="block">Explore Every</span>
                <span className="block text-gradient-red">Expert Article.</span>
              </h1>
              <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mb-8 font-body leading-relaxed">
                The fastest way to find exactly the fitness, running, nutrition, or gear coverage you need — curated by NSCA-CSCS coaches and registered dietitians, refreshed live from gearuptofit.com.
              </p>

              {/* SEARCH */}
              <div className="relative max-w-xl">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 size-5 text-muted-foreground" />
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search articles — e.g. creatine, marathon, Garmin…"
                  aria-label="Search articles"
                  className="w-full pl-12 pr-4 py-4 bg-card border border-border rounded-sm focus:outline-none focus:border-primary/60 text-base"
                />
              </div>
            </motion.div>
          </div>
        </section>

        {/* PILLAR FILTERS */}
        <section className="border-b border-border bg-card/30">
          <div className="container py-6">
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setActivePillar("all")}
                className={`px-4 py-2 rounded-sm text-sm font-display uppercase tracking-wide transition-colors border ${activePillar === "all" ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border hover:border-primary/60"}`}
              >
                All
              </button>
              {PILLARS.map((p) => (
                <button
                  key={p.slug}
                  onClick={() => setActivePillar(p.slug)}
                  className={`px-4 py-2 rounded-sm text-sm font-display uppercase tracking-wide transition-colors border ${activePillar === p.slug ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border hover:border-primary/60"}`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* PILLARS GRID (deep links) */}
        <section className="container py-12 md:py-16">
          <div className="flex items-end justify-between mb-8">
            <div>
              <h2 className="text-3xl md:text-4xl font-bold uppercase tracking-tight">Browse by topic</h2>
              <p className="text-muted-foreground mt-2">Six pillars · 16 calculators · hundreds of guides.</p>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4">
            {PILLARS.map((p, i) => (
              <motion.div
                key={p.slug}
                initial={{ opacity: 0, y: 14 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: i * 0.04 }}
              >
                <Link
                  to={p.path}
                  className="group block p-5 md:p-6 bg-card border border-border rounded-sm hover:border-primary/60 transition-all"
                >
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-xl md:text-2xl font-display font-bold uppercase tracking-tight group-hover:text-primary transition-colors">{p.label}</h3>
                    <ArrowRight className="size-5 text-primary opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
                  </div>
                  <p className="text-sm text-muted-foreground">{p.desc}</p>
                </Link>
              </motion.div>
            ))}
          </div>
        </section>

        {/* FEATURED + LATEST GRID */}
        <section className="container pb-16 md:pb-24">
          <div className="flex items-end justify-between mb-8">
            <div>
              <h2 className="text-3xl md:text-4xl font-bold uppercase tracking-tight">
                {activePillar === "all" ? "Latest articles" : `Latest in ${PILLARS.find((p) => p.slug === activePillar)?.label}`}
              </h2>
              <p className="text-muted-foreground mt-2">{filtered.length} article{filtered.length === 1 ? "" : "s"} · live from gearuptofit.com</p>
            </div>
            <Sparkles className="size-6 text-primary hidden md:block" />
          </div>

          {isLoading && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="bg-card border border-border rounded-sm overflow-hidden animate-pulse">
                  <div className="aspect-[16/10] bg-muted" />
                  <div className="p-4 space-y-2"><div className="h-3 bg-muted rounded w-1/3" /><div className="h-5 bg-muted rounded w-3/4" /><div className="h-3 bg-muted rounded w-full" /></div>
                </div>
              ))}
            </div>
          )}

          {!isLoading && featured && (
            <motion.a
              href={featured.url}
              target="_blank"
              rel="noreferrer"
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5 }}
              className="group grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8 bg-card border border-border rounded-sm overflow-hidden hover:border-primary/60 transition-all"
            >
              <div className="aspect-[16/10] lg:aspect-auto overflow-hidden bg-muted">
                <img src={featured.imageUrl} alt={featured.title} loading="eager" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" />
              </div>
              <div className="p-6 md:p-8 flex flex-col justify-center">
                <div className="text-xs uppercase tracking-wider text-primary font-display mb-3">FEATURED · {featured.category}</div>
                <h3 className="text-2xl md:text-4xl font-bold leading-tight uppercase tracking-tight mb-4 group-hover:text-primary transition-colors">{featured.title}</h3>
                <p className="text-base text-muted-foreground mb-6 line-clamp-3">{featured.excerpt}</p>
                <div className="inline-flex items-center gap-2 text-primary font-display uppercase tracking-wide text-sm">
                  Read article <ArrowRight className="size-4 group-hover:translate-x-1 transition-transform" />
                </div>
              </div>
            </motion.a>
          )}

          {!isLoading && rest.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {rest.map((p, i) => <PostCard key={p.id} post={p} i={i} />)}
            </div>
          )}

          {!isLoading && filtered.length === 0 && (
            <div className="text-center py-16 border border-dashed border-border rounded-sm">
              <p className="text-muted-foreground">No articles match your search. Try a different keyword or pillar.</p>
            </div>
          )}
        </section>

        {/* AEO FAQ */}
        <section className="container pb-16 md:pb-24">
          <div className="max-w-3xl mx-auto">
            <div className="text-center mb-10">
              <h2 className="text-3xl md:text-5xl font-bold uppercase tracking-tight mb-4">Frequently asked questions</h2>
              <p className="text-muted-foreground">Everything you need to know about how GearUpToFit Explore works.</p>
            </div>
            <div className="space-y-3">
              {FAQ.map((f, i) => <FaqRow key={f.q} q={f.q} a={f.a} i={i} />)}
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
};

export default ExplorePage;
