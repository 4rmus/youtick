'use client';

import { Navigation } from '@/components/landing/Navigation';
import { HeroSection } from '@/components/landing/HeroSection';
import { ValuePropositionSection } from '@/components/landing/ValuePropositionSection';
import { CompetitiveAdvantagesSection } from '@/components/landing/CompetitiveAdvantagesSection';
import { HowItWorksSection } from '@/components/landing/HowItWorksSection';
import { UseCasesSection } from '@/components/landing/UseCasesSection';
import { CTASection } from '@/components/landing/CTASection';
import { LandingFooter } from '@/components/landing/LandingFooter';
import { PainPointsSection } from '@/components/landing/PainPointsSection';
import { ROICalculator } from '@/components/landing/ROICalculator';
import { Roadmap } from '@/components/landing/Roadmap';

export default function Home() {
  return (
    <div className="flex flex-col min-h-screen bg-black text-white selection:bg-white selection:text-black">
      <Navigation variant="landing" />
      <HeroSection />
      <PainPointsSection />
      <ValuePropositionSection />
      <ROICalculator />
      <UseCasesSection />
      <HowItWorksSection />
      <CompetitiveAdvantagesSection />
      <Roadmap />
      <CTASection />
      <LandingFooter />
    </div>
  );
}
