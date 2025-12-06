import { memo, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Branding } from './Branding';
import { useLanguage } from '@/components/providers/LanguageContext';
import { useWallet } from '@/components/providers/WalletProvider';

interface NavigationProps {
  onDiscoverClick: () => void;
  variant?: 'landing' | 'discover';
}

export const Navigation = memo(({ onDiscoverClick, variant = 'landing' }: NavigationProps) => {
  const { t } = useLanguage();
  const { modal, accountId } = useWallet();
  const router = useRouter();

  const handleGetStarted = useCallback(() => {
    if (accountId) {
      router.push('/upload');
    } else {
      modal?.show();
    }
  }, [accountId, modal, router]);

  if (variant === 'discover') {
    return (
      <nav className="border-b border-white/10 bg-black/95 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <Link href="/" onClick={onDiscoverClick}>
            <Branding size="sm" />
          </Link>
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              className="text-zinc-400 hover:text-white"
              onClick={onDiscoverClick}
            >
              {t.landing.nav.home}
            </Button>
            <Link href="/upload">
              <Button className="bg-white hover:bg-zinc-200 text-black">
                {t.landing.nav.upload}
              </Button>
            </Link>
          </div>
        </div>
      </nav>
    );
  }

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 border-b border-white/5 bg-black/80 backdrop-blur-xl">
      <div className="container mx-auto px-4 h-20 flex items-center justify-between">
        <Branding size="md" />
        <div className="hidden md:flex items-center gap-8 text-sm text-zinc-400">
          <a href="#features" className="hover:text-white transition-colors">
            {t.landing.nav.features}
          </a>
          <a href="#comparison" className="hover:text-white transition-colors">
            {t.landing.nav.comparison}
          </a>
          <a href="#use-cases" className="hover:text-white transition-colors">
            {t.landing.nav.use_cases}
          </a>
        </div>
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            className="text-zinc-400 hover:text-white hidden md:inline-flex"
            onClick={onDiscoverClick}
          >
            {t.landing.nav.discover}
          </Button>
          <Button
            onClick={handleGetStarted}
            className="bg-white hover:bg-zinc-200 text-black font-semibold px-6"
          >
            {t.landing.nav.start}
          </Button>
        </div>
      </div>
    </nav>
  );
});

Navigation.displayName = 'Navigation';
