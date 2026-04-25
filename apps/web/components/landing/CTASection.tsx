import { memo } from 'react';
import Link from '@/components/Web4Link';
import { Button } from '@/components/ui/button';
import { ArrowRight } from 'lucide-react';
import { useLanguage } from '@/components/providers/LanguageContext';

interface CTASectionProps {
  onDiscoverClick: () => void;
}

export const CTASection = memo(({ onDiscoverClick }: CTASectionProps) => {
  const { t } = useLanguage();
  const s = t.landing.cta_section;

  return (
    <section className="bg-black py-28">
      <div className="container mx-auto px-4 text-center">
        <div className="mx-auto max-w-3xl">
          <p className="mb-3 text-sm font-semibold uppercase tracking-wide text-near-green">
            {s.eyebrow}
          </p>
          <h2 className="mb-6 text-4xl font-black leading-tight text-white md:text-6xl">
            {s.title}
          </h2>
          <p className="mx-auto mb-10 max-w-2xl text-lg leading-relaxed text-zinc-400">
            {s.description}
          </p>
          <div className="flex flex-col justify-center gap-3 sm:flex-row">
            <Link href="/upload">
              <Button
                size="lg"
                className="w-full rounded-full bg-near-green px-9 py-7 text-base font-bold text-near-black hover:bg-near-green/85 sm:w-auto"
              >
                {s.cta_primary} <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </Link>
            <Button
              size="lg"
              variant="outline"
              className="rounded-full border-white/20 bg-white/5 px-9 py-7 text-base font-bold text-white hover:border-white/40 hover:bg-white/10"
              onClick={onDiscoverClick}
            >
              {s.cta_secondary}
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
});

CTASection.displayName = 'CTASection';
