import { memo, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Branding } from './Branding';
import { useLanguage } from '@/components/providers/LanguageContext';
import { useWallet } from '@/components/providers/WalletProvider';
import { Sparkles } from 'lucide-react';

interface NavigationProps {
  onDiscoverClick: () => void;
  variant?: 'landing' | 'discover';
}

export const Navigation = memo(({ onDiscoverClick, variant = 'landing' }: NavigationProps) => {
  const { language, setLanguage, t } = useLanguage();
  const { modal, accountId, selector } = useWallet();
  const router = useRouter();

  const handleGetStarted = useCallback(() => {
    if (accountId) {
      router.push('/upload');
    } else {
      modal?.show();
    }
  }, [accountId, modal, router]);

  const handleSignOut = useCallback(async () => {
    const wallet = await selector?.wallet();
    await wallet?.signOut();
    window.location.reload();
  }, [selector]);

  // If logged in, the Global Navbar (layout.tsx) takes over.
  // We return null to avoid duplication.
  if (accountId) return null;

  // Guest / Marketing View
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
            <div className="flex items-center gap-2">
              <Link href="/trial">
                <Button
                  variant="ghost"
                  className="text-near-green hover:text-near-green/80"
                >
                  <Sparkles className="w-4 h-4 mr-1" />
                  {language === 'tr' ? 'Ücretsiz Dene' : 'Try Free'}
                </Button>
              </Link>
              <Button
                variant="ghost" onClick={() => modal?.show()}
                className="text-zinc-400 hover:text-white"
              >
                {language === 'tr' ? 'Giriş' : 'Login'}
              </Button>
              <Link href="/upload">
                <Button className="bg-near-green hover:bg-near-green/80 text-black font-semibold">
                  {t.landing.nav.upload}
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </nav>
    );
  }

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 border-b border-white/10 bg-black/95 backdrop-blur-md transition-colors duration-300">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between relative">
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          className="hover:opacity-80 transition-opacity"
        >
          <Branding size="sm" />
        </button>

        {/* Desktop Nav - Centered */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 hidden md:flex items-center gap-6 text-sm text-zinc-400">
          <a href="#pain-points" className="hover:text-white transition-colors">
            {language === 'tr' ? 'Sorunlar' : 'Problems'}
          </a>
          <a href="#commission-comparison" className="hover:text-white transition-colors">
            {t.landing.nav.comparison}
          </a>
          <a href="#features" className="hover:text-white transition-colors">
            {t.landing.nav.features}
          </a>
          <a href="#roi-calculator" className="hover:text-white transition-colors">
            {language === 'tr' ? 'Hesaplayıcı' : 'Calculator'}
          </a>
          <a href="#how-it-works" className="hover:text-white transition-colors">
            {t.landing.nav.how_it_works}
          </a>
        </div>
        <div className="flex items-center gap-3">

          {/* Try Free CTA */}
          <Link href="/trial">
            <Button
              variant="outline"
              className="border-near-green/50 text-near-green hover:bg-near-green/10 hover:border-near-green font-semibold px-4"
            >
              <Sparkles className="w-4 h-4 mr-1" />
              {language === 'tr' ? 'Ücretsiz Dene' : 'Try Free'}
            </Button>
          </Link>

          <Button
            onClick={handleGetStarted}
            className="bg-near-green hover:bg-near-green/80 text-black font-semibold px-6"
          >
            {t.landing.nav.start}
          </Button>
        </div>
      </div>
    </nav>
  );
});

Navigation.displayName = 'Navigation';

