'use client';

import { useState, useCallback } from 'react';
import { Navigation } from '@/components/landing/Navigation';
import { HeroSection } from '@/components/landing/HeroSection';
import { CompetitiveAdvantagesSection } from '@/components/landing/CompetitiveAdvantagesSection';
import { StartSlider } from '@/components/landing/StartSlider';
import { HowItWorksSection } from '@/components/landing/HowItWorksSection';
import { CTASection } from '@/components/landing/CTASection';
import { LandingFooter } from '@/components/landing/LandingFooter';
import { DiscoverView } from '@/components/discover/DiscoverView';
import { PainPointsSection } from '@/components/landing/PainPointsSection';
import { FinancialComparisonChart } from '@/components/landing/FinancialComparisonChart';
import { ROICalculator } from '@/components/landing/ROICalculator';

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

      <StartSlider />

      {/* Problem-Solution Flow */}
      <PainPointsSection />
      <FinancialComparisonChart />
      {/* Features & Advantages */}
      <CompetitiveAdvantagesSection />

      {/* Interactive Section */}
      <ROICalculator />

      {/* How To */}
      <HowItWorksSection />

      {/* CTA & Footer */}
      <CTASection onDiscoverClick={handleDiscoverClick} />
      <LandingFooter />
    </div>
  );
}

