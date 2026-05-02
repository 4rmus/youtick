'use client';

import { Navigation } from '@/components/landing/Navigation';
import { HeroSection } from '@/components/landing/HeroSection';
import { AudienceSection } from '@/components/landing/AudienceSection';
import { HowItWorksSection } from '@/components/landing/HowItWorksSection';
import { UseCasesSection } from '@/components/landing/UseCasesSection';
import { CompetitiveAdvantagesSection } from '@/components/landing/CompetitiveAdvantagesSection';
import { CTASection } from '@/components/landing/CTASection';
import { LandingFooter } from '@/components/landing/LandingFooter';
import { ROICalculator } from '@/components/landing/ROICalculator';
import { Roadmap } from '@/components/landing/Roadmap';

export default function Home() {
  return (
    <div className="flex flex-col min-h-screen bg-black text-white selection:bg-white selection:text-black">
      <Navigation variant="landing" />
      <HeroSection />
      <AudienceSection />
      <UseCasesSection />
      <HowItWorksSection />
      <CompetitiveAdvantagesSection />
      <ROICalculator />
      <Roadmap />
      <CTASection />
      <LandingFooter />
    </div>
  );
}
