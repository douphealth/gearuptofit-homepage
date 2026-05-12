import { motion, AnimatePresence } from "framer-motion";
import { Link, useLocation } from "react-router-dom";
import { Menu, X } from "lucide-react";
import { useState, useEffect } from "react";

const navItems = [
  { label: "Quiz", href: "/#quiz", internal: true },
  { label: "Fitness", to: "/fitness" },
  { label: "Running", to: "/running" },
  { label: "Nutrition", to: "/nutrition" },
  { label: "Health", to: "/health" },
  { label: "Reviews", to: "/reviews" },
  { label: "Calculators", to: "/calculators" },
];

const SiteHeader = () => {
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Close menu on route change
  useEffect(() => { setMobileOpen(false); }, [location.pathname]);

  // Prevent body scroll when menu is open
  useEffect(() => {
    document.body.style.overflow = mobileOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [mobileOpen]);

  return (
    <>
      <motion.header
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="sticky top-0 z-50 bg-background/80 backdrop-blur-md border-b border-border"
      >
        <div className="container flex items-center justify-between h-14 sm:h-16">
          <Link to="/" className="flex items-center gap-2 font-display text-lg sm:text-xl font-bold uppercase tracking-tight">
            <img
              src="https://gearuptofit.com/wp-content/uploads/2023/03/cropped-Grey-Black-Illustration-Gym-Fitness-Logo.png"
              alt="Gear Up To Fit"
              className="h-8 w-8 sm:h-9 sm:w-9 object-contain"
            />
            <span className="hidden sm:inline">Gear Up <span className="text-primary">To Fit</span></span>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden lg:flex items-center gap-1">
            {navItems.map((item) =>
              item.to ? (
                <Link key={item.label} to={item.to}
                  className={`px-3 py-2 text-xs font-display uppercase tracking-widest transition-colors duration-200 ${location.pathname === item.to ? "text-primary font-bold" : "text-muted-foreground hover:text-primary"}`}>
                  {item.label}
                </Link>
              ) : (
                <a key={item.label} href={item.href}
                  className="px-3 py-2 text-xs font-display uppercase tracking-widest text-muted-foreground hover:text-primary transition-colors duration-200">
                  {item.label}
                </a>
              )
            )}
          </nav>

          <div className="flex items-center gap-3">
            {/* Mobile hamburger */}
            <button onClick={() => setMobileOpen(!mobileOpen)} className="lg:hidden flex items-center justify-center w-10 h-10 text-foreground" aria-label="Toggle menu">
              {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </motion.header>

      {/* Mobile slide-out menu */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}
              className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden" onClick={() => setMobileOpen(false)} />
            <motion.nav initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              className="fixed top-0 right-0 bottom-0 z-50 w-[280px] bg-background border-l border-border flex flex-col lg:hidden">
              <div className="flex items-center justify-between p-4 border-b border-border">
                <span className="font-display text-sm font-bold uppercase tracking-widest text-primary">Menu</span>
                <button onClick={() => setMobileOpen(false)} className="w-10 h-10 flex items-center justify-center" aria-label="Close menu">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto py-4">
                {navItems.map((item, i) => {
                  const isActive = item.to && location.pathname === item.to;
                  const cls = `flex items-center gap-3 px-6 py-4 text-sm font-display uppercase tracking-widest transition-colors duration-200 ${isActive ? "text-primary font-bold bg-primary/5 border-r-2 border-primary" : "text-muted-foreground hover:text-foreground hover:bg-muted/30"}`;
                  return item.to ? (
                    <Link key={item.label} to={item.to} className={cls} onClick={() => setMobileOpen(false)}>{item.label}</Link>
                  ) : (
                    <a key={item.label} href={item.href} className={cls} onClick={() => setMobileOpen(false)}>{item.label}</a>
                  );
                })}
              </div>
              <div className="p-4 border-t border-border grid grid-cols-2 gap-3">
                <a href="https://gearuptofit.com/shoe-match/" target="_blank" rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 w-full px-4 py-3 bg-primary font-display text-xs uppercase tracking-widest font-bold rounded-sm text-primary-foreground">
                  Shoe Finder
                </a>
                <a href="https://gearuptofit.com/fitness-plan/" target="_blank" rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 w-full px-4 py-3 border border-primary/50 font-display text-xs uppercase tracking-widest font-bold rounded-sm text-primary hover:bg-primary/10">
                  Training Plan
                </a>
              </div>
            </motion.nav>
          </>
        )}
      </AnimatePresence>
    </>
  );
};

export default SiteHeader;
