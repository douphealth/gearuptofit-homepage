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
              className="flex items-center gap-3 font-display text-2xl font-bold uppercase tracking-tight mb-4"
            >
              <img
                src="https://gearuptofit.com/wp-content/uploads/2023/03/cropped-Grey-Black-Illustration-Gym-Fitness-Logo.png"
                alt="Gear Up To Fit"
                className="h-10 w-10 object-contain"
              />
              <span>Gear Up <span className="text-primary">To Fit</span></span>
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
                <a href="https://gearuptofit.com/shoe-finder/" className="text-sm text-muted-foreground hover:text-foreground transition-colors duration-200 font-body">
                  Running Shoe Finder
                </a>
              </li>
              <li>
                <a href="https://gearuptofit.com/watch-match/" className="text-sm text-muted-foreground hover:text-foreground transition-colors duration-200 font-body">
                  Watch Match
                </a>
              </li>
              <li>
                <a href="https://gearuptofit.com/fitness-plan/" className="text-sm text-muted-foreground hover:text-foreground transition-colors duration-200 font-body">
                  Fitness Plan
                </a>
              </li>
              <li>
                <a href="https://gearuptofit.com/fitness-and-health-calculators/" className="text-sm text-muted-foreground hover:text-foreground transition-colors duration-200 font-body">
                  Fitness &amp; Health Calculators
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
