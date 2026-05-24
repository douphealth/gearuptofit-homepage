import SiteHeader from "@/components/SiteHeader";
import HeroSection from "@/components/HeroSection";
import StartWithRightTool from "@/components/StartWithRightTool";
import BestPlacesToStart from "@/components/BestPlacesToStart";
import FeaturedShoeGuides from "@/components/FeaturedShoeGuides";
import LiveTicker from "@/components/LiveTicker";
import FitnessQuiz from "@/components/FitnessQuiz";
import CategoryPillars from "@/components/CategoryPillars";
import FeaturedArticle from "@/components/FeaturedArticle";
import LatestFromBlog from "@/components/LatestFromBlog";
import TrendingSection from "@/components/TrendingSection";
import DeepDiveSection from "@/components/DeepDiveSection";
import CalculatorsHub from "@/components/CalculatorsHub";
import QuickAnswers from "@/components/QuickAnswers";
import WhyTrustGearUpToFit from "@/components/WhyTrustGearUpToFit";
import FAQSection from "@/components/FAQSection";
import TrustSignals from "@/components/TrustSignals";
import CTASection from "@/components/CTASection";
import SiteFooter from "@/components/SiteFooter";

const Index = () => {
  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
      <SiteHeader />
      <main role="main">
        <article itemScope itemType="https://schema.org/WebPage">
          <HeroSection />
          <StartWithRightTool />
          <BestPlacesToStart />
          <FeaturedShoeGuides />
          <FitnessQuiz />
          <LiveTicker />
          <nav aria-label="Content categories">
            <CategoryPillars />
          </nav>
          <FeaturedArticle />
          <LatestFromBlog />
          <TrendingSection />
          <DeepDiveSection />
          <CalculatorsHub />
          <WhyTrustGearUpToFit />
          <QuickAnswers />
          <TrustSignals />
          <FAQSection />
          <CTASection />
        </article>
      </main>
      <SiteFooter />
    </div>
  );
};

export default Index;
