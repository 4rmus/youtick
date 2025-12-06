import { memo, useRef, useEffect, useState } from 'react';
import { useCounter } from '@/hooks/useCounter';
import { useLanguage } from '@/components/providers/LanguageContext';
import { STATS } from '@/lib/constants';

export const StatsSection = memo(() => {
  const { t } = useLanguage();
  const [statsVisible, setStatsVisible] = useState(false);
  const statsRef = useRef<HTMLDivElement>(null);

  const ticketCount = useCounter(STATS.ticketCapacity, 2500, statsVisible);
  const eventCount = useCounter(STATS.potentialEvents, 2500, statsVisible);
  const fraudRate = useCounter(STATS.fraudRate, 2500, statsVisible);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setStatsVisible(true);
        }
      },
      { threshold: 0.3 }
    );

    if (statsRef.current) {
      observer.observe(statsRef.current);
    }

    return () => observer.disconnect();
  }, []);

  return (
    <section ref={statsRef} className="py-20 bg-zinc-950 border-y border-white/5">
      <div className="container mx-auto px-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 text-center">
          <div className="space-y-2">
            <p className="text-5xl md:text-6xl font-black text-white">
              {ticketCount.toLocaleString()}+
            </p>
            <p className="text-zinc-500 text-sm uppercase tracking-widest">
              {t.landing.stats.ticket_capacity}
            </p>
          </div>
          <div className="space-y-2">
            <p className="text-5xl md:text-6xl font-black text-white">
              {eventCount.toLocaleString()}+
            </p>
            <p className="text-zinc-500 text-sm uppercase tracking-widest">
              {t.landing.stats.potential_events}
            </p>
          </div>
          <div className="space-y-2">
            <p className="text-5xl md:text-6xl font-black text-white">
              %{fraudRate}
            </p>
            <p className="text-zinc-500 text-sm uppercase tracking-widest">
              {t.landing.stats.fraud_rate}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
});

StatsSection.displayName = 'StatsSection';
