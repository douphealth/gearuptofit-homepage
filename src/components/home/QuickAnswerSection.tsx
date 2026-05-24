import { QUICK_ANSWER } from "@/lib/homepage-data";

const QuickAnswerSection = () => {
  return (
    <section
      aria-labelledby="what-is-gearuptofit"
      className="py-12 sm:py-16 border-b border-border/40"
    >
      <div className="container max-w-4xl">
        <div className="bg-card/60 border border-border rounded-lg p-6 sm:p-8">
          <h2
            id="what-is-gearuptofit"
            className="text-2xl sm:text-3xl font-bold uppercase tracking-tight font-display mb-3"
            data-speakable
          >
            {QUICK_ANSWER.heading}
          </h2>
          <p className="text-base sm:text-lg text-muted-foreground font-body leading-relaxed" data-speakable>
            {QUICK_ANSWER.body}
          </p>
        </div>
      </div>
    </section>
  );
};

export default QuickAnswerSection;
