import { memo, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Branding } from './Branding';
import { useLanguage } from '@/components/providers/LanguageContext';
import { useWallet } from '@/components/providers/WalletProvider';
import { User, LogOut } from 'lucide-react';

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
              <Button
                variant="ghost" onClick={() => modal?.show()}
                className="text-zinc-400 hover:text-white"
              >
                Login
              </Button>
              <Link href="/upload">
                <Button className="bg-white hover:bg-zinc-200 text-black">
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
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 hidden md:flex items-center gap-8 text-sm text-zinc-400">

          <a href="#features" className="hover:text-white transition-colors">
            {t.landing.nav.features}
          </a>
          <a href="#comparison" className="hover:text-white transition-colors">
            {t.landing.nav.comparison}
          </a>
          <a href="#use-cases" className="hover:text-white transition-colors">
            {t.landing.nav.use_cases}
          </a>
          <a href="#how-it-works" className="hover:text-white transition-colors">
            {t.landing.nav.how_it_works}
          </a>
          <a href="#roadmap" className="hover:text-white transition-colors">
            {t.landing.nav.roadmap}
          </a>
        </div>
        <div className="flex items-center gap-4">
          {/* Language Switcher for Guest */}
          <div className="flex items-center gap-2 mr-2 border-r border-white/10 pr-4">
            <button
              onClick={() => setLanguage('en')}
              className={`text-xs font-bold ${language === 'en' ? 'text-white' : 'text-zinc-600 hover:text-zinc-400'}`}
            >
              EN
            </button>
            <button
              onClick={() => setLanguage('tr')}
              className={`text-xs font-bold ${language === 'tr' ? 'text-white' : 'text-zinc-600 hover:text-zinc-400'}`}
            >
              TR
            </button>
          </div>

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
