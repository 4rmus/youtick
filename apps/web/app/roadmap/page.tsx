'use client';

import { useCallback, useState } from 'react';
import { Navigation } from '@/components/landing/Navigation';
import { Roadmap } from '@/components/landing/Roadmap';
import { LandingFooter } from '@/components/landing/LandingFooter';
import { DiscoverView } from '@/components/discover/DiscoverView';

export default function RoadmapPage() {
  const [view, setView] = useState<'roadmap' | 'discover'>('roadmap');

  const handleDiscoverClick = useCallback(() => {
    setView('discover');
  }, []);

  const handleBackClick = useCallback(() => {
    setView('roadmap');
  }, []);

  if (view === 'discover') {
    return <DiscoverView onBackClick={handleBackClick} />;
  }

  return (
    <div className="flex flex-col min-h-screen bg-black text-white selection:bg-white selection:text-black">
      <Navigation onDiscoverClick={handleDiscoverClick} variant="landing" />
      <div className="pt-16">
        <Roadmap />
      </div>
      <LandingFooter />
    </div>
  );
}
