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

  // App Links for Logged In Users
  const navLinks = [
    { href: '/discover', label: t.nav.discover },
    { href: '/upload', label: t.nav.upload },
    { href: '/watch', label: t.nav.watch },
  ];

  // If logged in, render the Unified App Header (matches Navbar.tsx)
  if (accountId) {
    return (
      <nav className="sticky top-0 z-50 w-full backdrop-blur-md bg-black/95 border-b border-white/10 px-4 py-3 transition-colors duration-300">
        <div className="container mx-auto flex justify-between items-center relative">
          <Link href="/" className="flex items-center gap-2">
            <Branding size="sm" />
          </Link>

          {/* Desktop Nav - App Links */}
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 hidden md:flex items-center gap-8">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-sm font-medium transition-colors hover:text-white text-zinc-400"
              >
                {link.label}
              </Link>
            ))}
          </div>

          <div className="hidden md:flex items-center gap-4">
            {/* Language Switcher */}
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

            {/* User Pill */}
            <div className="rounded-full bg-zinc-900 border border-zinc-800 flex items-center pl-3 pr-1 py-1 gap-2">
              <Link href="/profile" className="flex items-center gap-2 hover:opacity-80 transition-opacity cursor-pointer">
                <User className="w-3 h-3 text-zinc-500" />
                <span className="text-xs font-mono text-zinc-400 truncate max-w-[100px]">{accountId}</span>
              </Link>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleSignOut}
                className="h-6 w-6 ml-1 rounded-full text-zinc-500 hover:text-red-500 hover:bg-red-500/10"
              >
                <LogOut className="w-3 h-3" />
              </Button>
            </div>
          </div>

          {/* Mobile Menu Placeholder - keeping simple for landing page swap, or could implement full menu */}
          <div className="md:hidden">
            <Link href="/upload">
              <Button size="sm" variant="secondary">Open App</Button>
            </Link>
          </div>
        </div>
      </nav>
    );
  }

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
    <nav className="fixed top-0 left-0 right-0 z-50 border-b border-white/5 bg-black/80 backdrop-blur-xl">
      <div className="container mx-auto px-4 h-20 flex items-center justify-between">
        <Branding size="md" />
        <div className="hidden md:flex items-center gap-8 text-sm text-zinc-400">
          <button
            onClick={onDiscoverClick}
            className="hover:text-white transition-colors"
          >
            {t.landing.nav.discover}
          </button>
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
