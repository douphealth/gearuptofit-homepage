import { ArrowRight } from "lucide-react";
import { QUICK_ANSWER_CARDS } from "@/lib/homepage-data";

const QuickAnswers = () => {
  return (
    <section aria-labelledby="quick-answers-heading" className="py-16 sm:py-20 bg-card/30 border-y border-border/40">
      <div className="container max-w-6xl">
        <h2 id="quick-answers-heading" className="text-3xl sm:text-4xl md:text-5xl font-bold uppercase tracking-tight font-display mb-3">
          Quick answers for smarter fitness decisions
        </h2>
        <p className="text-muted-foreground font-body mb-10 max-w-2xl">
          Short, direct answers to the questions runners and active people ask most.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {QUICK_ANSWER_CARDS.map((qa) => (
            <article key={qa.question} className="bg-background border border-border rounded-lg p-6 sm:p-7">
              <h3 className="text-base sm:text-lg font-bold font-display uppercase tracking-wide mb-2" data-speakable>
                {qa.question}
              </h3>
              <p className="text-sm sm:text-base text-muted-foreground font-body leading-relaxed mb-4" data-speakable>
                {qa.answer}
              </p>
              <a
                href={qa.href}
                className="inline-flex items-center gap-1.5 text-primary font-display text-xs uppercase tracking-wider font-semibold"
              >
                {qa.linkLabel}
                <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
              </a>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
};

export default QuickAnswers;
