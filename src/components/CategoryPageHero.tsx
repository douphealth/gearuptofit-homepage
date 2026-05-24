import { motion } from "framer-motion";
import { ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";

interface CategoryPageHeroProps {
  icon: string;
  title: string;
  gradient: string;
  description: string;
  stats: { num: string; label: string }[];
  categoryUrl: string;
  heroImage?: string;
  /** Override the default "{title} / Command Center" H1. When set, replaces both lines. */
  h1Override?: string;
  /** Override the small uppercase chip label (defaults to "{title} Hub"). */
  badgeLabel?: string;
  /** Custom label for the CTA link (defaults to "Browse All {title} Articles →"). */
  ctaLabel?: string;
}

const CategoryPageHero = ({ icon, title, gradient, description, stats, categoryUrl, heroImage, h1Override, badgeLabel, ctaLabel }: CategoryPageHeroProps) => (
  <section className="relative min-h-[50vh] sm:min-h-[60vh] md:min-h-[70vh] flex items-end overflow-hidden">
    {heroImage && (
      <div className="absolute inset-0">
        <img src={heroImage} alt={`${title} hero`} className="w-full h-full object-cover" loading="eager" />
        <div className="absolute inset-0 bg-gradient-to-r from-background via-background/90 sm:via-background/85 to-background/60 sm:to-background/30" />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 sm:via-background/50 to-transparent" />
      </div>
    )}

    {!heroImage && (
      <>
        <div className={`absolute inset-0 bg-gradient-to-br ${gradient} opacity-[0.07]`} />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-background/80" />
      </>
    )}

    <div className="container relative z-10 py-10 sm:py-16 md:py-24">
      <motion.div initial={{ opacity: 0, y: 20, filter: "blur(4px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }} transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}>
        <Link to="/" className="inline-flex items-center gap-2 text-xs sm:text-sm text-muted-foreground hover:text-primary font-display uppercase tracking-widest mb-5 sm:mb-8 transition-colors duration-200">
          <ArrowLeft className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> Back to Hub
        </Link>

        <div className="flex items-center gap-3 sm:gap-4 mb-4 sm:mb-6">
          <span className="text-3xl sm:text-5xl">{icon}</span>
          <div className="inline-flex items-center gap-2 px-3 sm:px-4 py-1.5 sm:py-2 bg-primary/10 border border-primary/25 rounded-sm backdrop-blur-sm">
            <span className="relative flex h-2 w-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" /><span className="relative inline-flex rounded-full h-2 w-2 bg-primary" /></span>
            <span className="text-[10px] sm:text-xs font-bold tracking-[0.2em] sm:tracking-[0.25em] uppercase text-primary font-display">{title} Hub</span>
          </div>
        </div>

        <h1 className="text-3xl sm:text-5xl md:text-7xl lg:text-8xl font-bold uppercase tracking-tight leading-[0.9] mb-4 sm:mb-6 font-display max-w-3xl">
          <span className="block">{title}</span>
          <span className="block text-gradient-red">Command Center</span>
        </h1>

        <p className="text-sm sm:text-lg md:text-xl text-muted-foreground max-w-xl mb-6 sm:mb-10 font-body leading-relaxed">{description}</p>

        <div className="flex flex-wrap gap-5 sm:gap-8 md:gap-12">
          {stats.map((s) => (
            <div key={s.label} className="flex flex-col">
              <span className="text-2xl sm:text-3xl md:text-4xl font-bold font-display text-primary tabular-nums">{s.num}</span>
              <span className="text-[10px] sm:text-sm text-muted-foreground uppercase tracking-wider font-display">{s.label}</span>
            </div>
          ))}
        </div>

        <a href={categoryUrl} target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-2 mt-6 sm:mt-8 px-5 sm:px-6 py-2.5 sm:py-3 bg-primary font-display text-xs sm:text-sm uppercase tracking-wider font-bold transition-all duration-200 hover:brightness-110 active:scale-[0.97] glow-red rounded-sm text-primary-foreground">
          Browse All {title} Articles →
        </a>
      </motion.div>
    </div>
  </section>
);

export default CategoryPageHero;
