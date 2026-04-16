import SiteHeader from "@/components/SiteHeader";
import HeroSection from "@/components/HeroSection";
import LiveTicker from "@/components/LiveTicker";
import FitnessQuiz from "@/components/FitnessQuiz";
import CategoryPillars from "@/components/CategoryPillars";
import FeaturedArticle from "@/components/FeaturedArticle";
import TrendingSection from "@/components/TrendingSection";
import DeepDiveSection from "@/components/DeepDiveSection";
import CalculatorsHub from "@/components/CalculatorsHub";
import FAQSection from "@/components/FAQSection";
import CTASection from "@/components/CTASection";
import SiteFooter from "@/components/SiteFooter";

const Index = () => {
  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
      <SiteHeader />
      <main role="main">
        <article itemScope itemType="https://schema.org/WebPage">
          <HeroSection />
          <FitnessQuiz />
          <LiveTicker />
          <nav aria-label="Content categories">
            <CategoryPillars />
          </nav>
          <FeaturedArticle />
          <TrendingSection />
          <DeepDiveSection />
          <CalculatorsHub />
          <FAQSection />
          <CTASection />
        </article>
      </main>
      <SiteFooter />
    </div>
  );
};

export default Index;
