import { categories } from "@/lib/blog-data";
import { Link } from "react-router-dom";

const SiteFooter = () => {
  return (
    <footer className="border-t border-border bg-card/50 py-16">
      <div className="container">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-12">
          {/* Brand */}
          <div className="md:col-span-2">
            <Link
              to="/"
              className="font-display text-2xl font-bold uppercase tracking-tight mb-4 block"
            >
              Gear Up <span className="text-primary">To Fit</span>
            </Link>
            <p className="text-muted-foreground font-body text-sm leading-relaxed max-w-md">
              Your comprehensive resource for fitness, running, nutrition, and health.
              Expert-written articles, honest gear reviews, and science-backed advice to help you achieve
              your fitness goals.
            </p>
          </div>

          {/* Categories */}
          <div>
            <h4 className="font-display text-sm uppercase tracking-widest font-semibold mb-4 text-primary">
              Categories
            </h4>
            <ul className="space-y-2">
              {categories.map((cat) => (
                <li key={cat.slug}>
                  <Link
                    to={`/${cat.slug}`}
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors duration-200 font-body"
                  >
                    {cat.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Quick Links */}
          <div>
            <h4 className="font-display text-sm uppercase tracking-widest font-semibold mb-4 text-primary">
              Quick Links
            </h4>
            <ul className="space-y-2">
              <li>
                <a href="https://shoe-match.gearuptofit.com/" target="_blank" rel="noopener noreferrer" className="text-sm text-muted-foreground hover:text-foreground transition-colors duration-200 font-body">
                  Shoe Finder Tool
                </a>
              </li>
              <li>
                <a href="https://fitness-plan.gearuptofit.com/" target="_blank" rel="noopener noreferrer" className="text-sm text-muted-foreground hover:text-foreground transition-colors duration-200 font-body">
                  8-Week Training Plan
                </a>
              </li>
              <li>
                <a href="https://fitness-calculators.gearuptofit.com/" target="_blank" rel="noopener noreferrer" className="text-sm text-muted-foreground hover:text-foreground transition-colors duration-200 font-body">
                  Fitness Calculators
                </a>
              </li>
              <li>
                <a href="/calculators" className="text-sm text-muted-foreground hover:text-foreground transition-colors duration-200 font-body">
                  All Calculators
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t border-border pt-8 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-xs text-muted-foreground font-body">
            © {new Date().getFullYear()} GearUpToFit.com — All rights reserved.
          </p>
          <p className="text-xs text-muted-foreground font-body">
            Expert Fitness Guidance • Honest Reviews • Real Results
          </p>
        </div>
      </div>
    </footer>
  );
};

export default SiteFooter;
