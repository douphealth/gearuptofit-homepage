import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import HeroSection from "@/components/home/HeroSection";
import QuickAnswerSection from "@/components/home/QuickAnswerSection";
import IntentRouter from "@/components/home/IntentRouter";
import ToolsSection from "@/components/home/ToolsSection";
import TopicMap from "@/components/home/TopicMap";
import BestStartingPoints from "@/components/home/BestStartingPoints";
import FeaturedGuides from "@/components/home/FeaturedGuides";
import QuickAnswers from "@/components/home/QuickAnswers";
import TrustSection from "@/components/home/TrustSection";
import LatestGuides from "@/components/home/LatestGuides";
import FinalCTA from "@/components/home/FinalCTA";

const Index = () => {
  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
      <SiteHeader />
      <main role="main">
        <article itemScope itemType="https://schema.org/WebPage">
          <HeroSection />
          <QuickAnswerSection />
          <IntentRouter />
          <ToolsSection />
          <TopicMap />
          <BestStartingPoints />
          <FeaturedGuides />
          <QuickAnswers />
          <TrustSection />
          <LatestGuides />
          <FinalCTA />
        </article>
      </main>
      <SiteFooter />
    </div>
  );
};

export default Index;
