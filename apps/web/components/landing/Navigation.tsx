import { memo, useCallback, useState } from 'react';
import Link from '@/components/Web4Link';
import { Button } from '@/components/ui/button';
import { Branding } from './Branding';
import { useLanguage } from '@/components/providers/LanguageContext';
import { useWallet } from '@/components/providers/WalletProvider';
import { Menu, X } from 'lucide-react';

interface NavigationProps {
  onDiscoverClick?: () => void;
  variant?: 'landing' | 'discover';
}

export const Navigation = memo(({ onDiscoverClick, variant = 'landing' }: NavigationProps) => {
  const { t } = useLanguage();
  const { connect, accountId } = useWallet();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const handleGetStarted = useCallback(() => {
    if (accountId) {
      window.location.href = '/upload';
    } else {
      connect();
    }
  }, [accountId, connect]);

  const closeMenu = () => setIsMenuOpen(false);

  // If logged in, the Global Navbar (layout.tsx) takes over.
  // We return null to avoid duplication.
  if (accountId) return null;

  // Landing page navigation links
  const navLinks = [
    { href: '#audience', label: t.landing.nav?.audience || 'Benefits' },
    { href: '#how-it-works', label: t.landing.nav?.how_it_works || 'How it works' },
    { href: '#roi-calculator', label: t.landing.nav_extra?.calculator || 'Fee model' },
    { href: '/trial', label: t.landing.nav_extra?.try_free || 'Guest access' },
  ];

  // Guest / Marketing View
  if (variant === 'discover') {
    return (
      <nav className="relative border-b border-white/10 bg-black/95 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <Link href="/" onClick={onDiscoverClick}>
            <Branding size="sm" />
          </Link>
          <div className="hidden md:flex items-center gap-4">
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
                  className="text-zinc-400 hover:text-white"
                >
                  {t.landing.nav_extra?.try_free || 'Guest access'}
                </Button>
              </Link>
              <Button
                variant="ghost" onClick={() => connect()}
                className="text-zinc-400 hover:text-white"
              >
                {t.landing.nav_extra?.login || 'Login'}
              </Button>
              <Button
                onClick={handleGetStarted}
                className="bg-white hover:bg-zinc-200 text-black font-semibold"
              >
                {t.landing.nav.upload}
              </Button>
            </div>
          </div>
          <button
            type="button"
            aria-label={isMenuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={isMenuOpen}
            className="md:hidden flex h-11 w-11 items-center justify-center rounded-md text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-near-green"
            onClick={() => setIsMenuOpen(!isMenuOpen)}
          >
            {isMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
        {isMenuOpen && (
          <div className="md:hidden absolute top-full left-0 w-full bg-black/95 backdrop-blur-md border-b border-white/10 shadow-xl">
            <div className="container mx-auto px-4 py-6 flex flex-col gap-4">
              <Button
                variant="ghost"
                className="w-full justify-start text-zinc-400 hover:text-white"
                onClick={() => {
                  closeMenu();
                  onDiscoverClick?.();
                }}
              >
                {t.landing.nav.home}
              </Button>
              <Button
                variant="ghost"
                asChild
                className="w-full justify-start text-zinc-400 hover:text-white"
              >
                <Link href="/trial" onClick={closeMenu}>
                  {t.landing.nav_extra?.try_free || 'Guest access'}
                </Link>
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  closeMenu();
                  connect();
                }}
                className="w-full justify-start text-zinc-400 hover:text-white"
              >
                {t.landing.nav_extra?.login || 'Login'}
              </Button>
              <Button
                onClick={() => {
                  closeMenu();
                  handleGetStarted();
                }}
                className="w-full bg-white hover:bg-zinc-200 text-black font-semibold"
              >
                {t.landing.nav.upload}
              </Button>
            </div>
          </div>
        )}
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
              className="border-white/20 bg-white/5 px-5 font-semibold text-white hover:border-white/40 hover:bg-white/10"
            >
              {t.landing.nav_extra?.try_free || 'Guest access'}
            </Button>
          </Link>
          <Button
            onClick={handleGetStarted}
            className="bg-white hover:bg-zinc-200 text-black font-semibold px-6"
          >
            {t.landing.hero_section?.cta_primary || 'Open a screening'}
          </Button>
        </div>

        {/* Mobile Menu Button */}
        <button
          className="lg:hidden p-2 text-white hover:text-zinc-300 transition-colors"
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
            <Button
              variant="outline"
              asChild
              className="w-full border-white/20 bg-white/5 text-white hover:bg-white/10"
            >
              <Link href="/trial" onClick={closeMenu}>
                {t.landing.nav_extra?.try_free || 'Guest access'}
              </Link>
            </Button>

            <Button
              onClick={() => {
                closeMenu();
                handleGetStarted();
              }}
              className="w-full bg-white hover:bg-zinc-200 text-black font-semibold"
            >
              {t.landing.hero_section?.cta_primary || 'Open a screening'}
            </Button>
          </div>
        </div>
      )}
    </nav>
  );
});

Navigation.displayName = 'Navigation';
