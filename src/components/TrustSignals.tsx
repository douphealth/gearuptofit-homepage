import { motion } from "framer-motion";
import { ShieldCheck, BookOpenCheck, FlaskConical, Award, Users, Stethoscope } from "lucide-react";

const signals = [
  {
    icon: FlaskConical,
    title: "Sports-Science Backed",
    body: "Every recommendation cites peer-reviewed research from journals like JSCR, Med Sci Sports Exerc, and Sports Medicine.",
  },
  {
    icon: Stethoscope,
    title: "Expert-Reviewed",
    body: "Articles vetted by certified strength coaches (NSCA-CSCS), registered dietitians (RD), and physiotherapists.",
  },
  {
    icon: BookOpenCheck,
    title: "Real-World Tested",
    body: "150+ products tested across 12,000+ logged training miles. No paid placements, ever.",
  },
  {
    icon: Users,
    title: "50,000+ Monthly Readers",
    body: "Trusted by runners, lifters, and coaches in 90+ countries since 2023.",
  },
  {
    icon: ShieldCheck,
    title: "Editorial Independence",
    body: "Affiliate links never influence verdicts. We disclose every relationship transparently.",
  },
  {
    icon: Award,
    title: "Updated Continuously",
    body: "Articles re-audited every 90 days against the latest research and product releases.",
  },
];

const TrustSignals = () => {
  return (
    <section className="py-16 md:py-24 border-t border-border" aria-label="Why trust GearUpToFit">
      <div className="container">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="mb-10 max-w-2xl"
        >
          <span className="inline-block px-3 py-1 mb-4 text-xs font-display uppercase tracking-widest text-primary border border-primary/30 rounded-sm">
            E-E-A-T
          </span>
          <h2 className="text-3xl md:text-5xl font-bold uppercase tracking-tight font-display leading-[0.95]" data-speakable>
            Why <span className="text-gradient-red">Athletes Trust</span> GearUpToFit
          </h2>
          <p className="text-muted-foreground text-base sm:text-lg font-body mt-3">
            Experience, expertise, authority, and trust — the four pillars Google and AI engines use to rank health content.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {signals.map((s, i) => {
            const Icon = s.icon;
            return (
              <motion.div
                key={s.title}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.2 }}
                transition={{ duration: 0.5, delay: i * 0.06, ease: [0.16, 1, 0.3, 1] }}
                className="bg-card border border-border rounded-sm p-6 hover:border-primary/40 transition-colors duration-300"
              >
                <Icon className="w-7 h-7 text-primary mb-4" />
                <h3 className="font-display text-base uppercase tracking-wide font-bold mb-2">{s.title}</h3>
                <p className="text-sm text-muted-foreground font-body leading-relaxed">{s.body}</p>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default TrustSignals;
