import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { quickAnswers } from "@/lib/homepage-strategic";

const QuickAnswers = () => {
  // FAQPage JSON-LD for AEO / AI visibility — uses real Q&A only.
  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: quickAnswers.map((q) => ({
      "@type": "Question",
      name: q.question,
      acceptedAnswer: { "@type": "Answer", text: q.answer },
    })),
  };

  return (
    <section
      id="quick-answers"
      aria-labelledby="quick-answers-heading"
      className="py-20 md:py-28"
    >
      <div className="container">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="mb-10 max-w-3xl"
        >
          <h2
            id="quick-answers-heading"
            className="text-3xl md:text-5xl lg:text-6xl font-bold uppercase tracking-tight font-display mb-3 leading-[0.95]"
          >
            Quick answers for <span className="text-gradient-red">smarter fitness decisions</span>
          </h2>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-5">
          {quickAnswers.map((q, i) => (
            <motion.article
              key={q.question}
              initial={{ opacity: 0, y: 16, filter: "blur(4px)" }}
              whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              viewport={{ once: true, amount: 0.15 }}
              transition={{ duration: 0.5, delay: i * 0.06, ease: [0.16, 1, 0.3, 1] }}
              className="bg-card border border-border p-6 md:p-7 rounded-sm"
            >
              <h3 className="text-lg md:text-xl font-bold font-display mb-3 leading-snug" data-speakable>
                {q.question}
              </h3>
              <p className="text-sm md:text-base text-muted-foreground font-body leading-relaxed mb-5" data-speakable>
                {q.answer}
              </p>
              <a
                href={q.linkUrl}
                className="inline-flex items-center gap-2 text-primary font-display text-xs md:text-sm uppercase tracking-wider font-semibold hover:brightness-110"
              >
                {q.linkLabel}
                <ArrowRight className="w-4 h-4" />
              </a>
            </motion.article>
          ))}
        </div>

        <script
          type="application/ld+json"
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
        />
      </div>
    </section>
  );
};

export default QuickAnswers;
