import { memo } from 'react';
import Link from '@/components/Web4Link';
import { Button } from '@/components/ui/button';
import { ArrowRight } from 'lucide-react';
import { useLanguage } from '@/components/providers/LanguageContext';
import { useWallet } from '@/components/providers/WalletProvider';

export const CTASection = memo(() => {
  const { t } = useLanguage();
  const { connect, accountId } = useWallet();
  const s = t.landing.cta_section;

  const handlePublish = () => {
    if (accountId) {
      window.location.href = '/upload';
      return;
    }
    connect();
  };

  return (
    <section className="bg-black py-28">
      <div className="container mx-auto px-4 text-center">
        <div className="mx-auto max-w-3xl">
          <p className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-400">
            {s.eyebrow}
          </p>
          <h2 className="mb-6 text-4xl font-black leading-tight text-white md:text-6xl">
            {s.title}
          </h2>
          <p className="mx-auto mb-10 max-w-2xl text-lg leading-relaxed text-zinc-400">
            {s.description}
          </p>
          <div className="flex flex-col justify-center gap-3 sm:flex-row">
            <Button
              size="lg"
              onClick={handlePublish}
              className="w-full rounded-full bg-white px-9 py-7 text-base font-bold text-black hover:bg-zinc-200 sm:w-auto"
            >
              {s.cta_primary} <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
            <Link href="/discover" className="w-full sm:w-auto">
              <Button
                size="lg"
                variant="outline"
                className="w-full rounded-full border-white/20 bg-white/5 px-9 py-7 text-base font-bold text-white hover:border-white/40 hover:bg-white/10"
              >
                {s.cta_secondary}
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
});

CTASection.displayName = 'CTASection';
