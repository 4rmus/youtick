'use client';

import { useState, useCallback } from 'react';
import { Navigation } from '@/components/landing/Navigation';
import { HeroSection } from '@/components/landing/HeroSection';
import { AudienceSection } from '@/components/landing/AudienceSection';
import { ValuePropositionSection } from '@/components/landing/ValuePropositionSection';
import { CompetitiveAdvantagesSection } from '@/components/landing/CompetitiveAdvantagesSection';
import { HowItWorksSection } from '@/components/landing/HowItWorksSection';
import { UseCasesSection } from '@/components/landing/UseCasesSection';
import { CTASection } from '@/components/landing/CTASection';
import { LandingFooter } from '@/components/landing/LandingFooter';
import { DiscoverView } from '@/components/discover/DiscoverView';
import { PainPointsSection } from '@/components/landing/PainPointsSection';
import { ROICalculator } from '@/components/landing/ROICalculator';
import { FinancialComparisonChart } from '@/components/landing/FinancialComparisonChart';

export default function Home() {
  const [view, setView] = useState<'landing' | 'discover'>('landing');

  const handleDiscoverClick = useCallback(() => {
    setView('discover');
  }, []);

  const handleBackClick = useCallback(() => {
    setView('landing');
  }, []);

  if (view === 'discover') {
    return <DiscoverView onBackClick={handleBackClick} />;
  }

  return (
    <div className="flex flex-col min-h-screen bg-black text-white selection:bg-white selection:text-black">
      <Navigation onDiscoverClick={handleDiscoverClick} variant="landing" />
      <HeroSection onDiscoverClick={handleDiscoverClick} />
      <AudienceSection />
      <PainPointsSection />
      <ValuePropositionSection />
      <ROICalculator />
      <FinancialComparisonChart />
      <UseCasesSection />
      <HowItWorksSection />
      <CompetitiveAdvantagesSection />
      <CTASection onDiscoverClick={handleDiscoverClick} />
      <LandingFooter />
    </div>
  );
}
