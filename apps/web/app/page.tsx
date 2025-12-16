'use client';

import { useState, useCallback } from 'react';
import { Navigation } from '@/components/landing/Navigation';
import { HeroSection } from '@/components/landing/HeroSection';
import { StatsSection } from '@/components/landing/StatsSection';
import { ValuePropositionSection } from '@/components/landing/ValuePropositionSection';
import { DigitalSalonSection } from '@/components/landing/DigitalSalonSection';
import { FeaturesSection } from '@/components/landing/FeaturesSection';
import { CompetitiveAdvantagesSection } from '@/components/landing/CompetitiveAdvantagesSection';
import { ComparisonSection } from '@/components/landing/ComparisonSection';
import { UseCasesSection } from '@/components/landing/UseCasesSection';
import { Roadmap } from '@/components/landing/Roadmap';
import { HowItWorksSection } from '@/components/landing/HowItWorksSection';
import { CTASection } from '@/components/landing/CTASection';
import { LandingFooter } from '@/components/landing/LandingFooter';
import { DiscoverView } from '@/components/discover/DiscoverView';

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


      <ValuePropositionSection />
      <DigitalSalonSection />

      <CompetitiveAdvantagesSection />
      <ComparisonSection />
      <UseCasesSection />

      <HowItWorksSection />
      <Roadmap />
      <CTASection onDiscoverClick={handleDiscoverClick} />
      <LandingFooter />
    </div>
  );
}
