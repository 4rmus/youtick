import { memo, useCallback, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Branding } from './Branding';
import { useLanguage } from '@/components/providers/LanguageContext';
import { useWallet } from '@/components/providers/WalletProvider';
import { Sparkles, Menu, X } from 'lucide-react';

interface NavigationProps {
  onDiscoverClick: () => void;
  variant?: 'landing' | 'discover';
}

export const Navigation = memo(({ onDiscoverClick, variant = 'landing' }: NavigationProps) => {
  const { language, setLanguage, t } = useLanguage();
  const { modal, accountId, selector } = useWallet();
  const router = useRouter();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

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

  const closeMenu = () => setIsMenuOpen(false);

  // If logged in, the Global Navbar (layout.tsx) takes over.
  // We return null to avoid duplication.
  if (accountId) return null;

  // Landing page navigation links
  const navLinks = [
    { href: '#pain-points', label: t.landing.nav_extra?.problems || 'Problems' },
    { href: '#commission-comparison', label: t.landing.nav.comparison },
    { href: '#features', label: t.landing.nav.features },
    { href: '#roi-calculator', label: t.landing.nav_extra?.calculator || 'Calculator' },
    { href: '#how-it-works', label: t.landing.nav.how_it_works },
  ];

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
                  {t.landing.nav_extra?.try_free || 'Try Free'}
                </Button>
              </Link>
              <Button
                variant="ghost" onClick={() => modal?.show()}
                className="text-zinc-400 hover:text-white"
              >
                {t.landing.nav_extra?.login || 'Login'}
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

        {/* Desktop Nav - Centered (lg breakpoint: 1024px) */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 hidden lg:flex items-center gap-6 text-sm text-zinc-400">
          {navLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="hover:text-white transition-colors whitespace-nowrap"
            >
              {link.label}
            </a>
          ))}
        </div>

        {/* Desktop CTAs */}
        <div className="hidden lg:flex items-center gap-3">
          <Link href="/trial">
            <Button
              variant="outline"
              className="border-near-green/50 text-near-green hover:bg-near-green/10 hover:border-near-green font-semibold px-4"
            >
              <Sparkles className="w-4 h-4 mr-1" />
              {t.landing.nav_extra?.try_free || 'Try Free'}
            </Button>
          </Link>

          <Button
            onClick={handleGetStarted}
            className="bg-near-green hover:bg-near-green/80 text-black font-semibold px-6"
          >
            {t.landing.nav.start}
          </Button>
        </div>

        {/* Mobile Menu Button */}
        <button
          className="lg:hidden p-2 text-white hover:text-near-green transition-colors"
          onClick={() => setIsMenuOpen(!isMenuOpen)}
          aria-label="Toggle menu"
        >
          {isMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {/* Mobile Menu Overlay */}
      {isMenuOpen && (
        <div className="lg:hidden absolute top-full left-0 w-full bg-black/95 backdrop-blur-md border-b border-white/10 shadow-xl">
          <div className="container mx-auto px-4 py-6 flex flex-col gap-4">
            {/* Navigation Links */}
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={closeMenu}
                className="text-lg font-medium text-zinc-400 hover:text-white transition-colors py-2"
              >
                {link.label}
              </a>
            ))}

            <div className="h-px bg-white/10 my-2" />

            {/* CTAs */}
            <Link href="/trial" onClick={closeMenu}>
              <Button
                variant="outline"
                className="w-full border-near-green/50 text-near-green hover:bg-near-green/10 hover:border-near-green font-semibold"
              >
                <Sparkles className="w-4 h-4 mr-2" />
                {t.landing.nav_extra?.try_free || 'Try Free'}
              </Button>
            </Link>

            <Button
              onClick={() => {
                closeMenu();
                handleGetStarted();
              }}
              className="w-full bg-near-green hover:bg-near-green/80 text-black font-semibold"
            >
              {t.landing.nav.start}
            </Button>
          </div>
        </div>
      )}
    </nav>
  );
});

Navigation.displayName = 'Navigation';
