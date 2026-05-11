import { memo } from 'react';
import { Github } from 'lucide-react';
import { Branding } from './Branding';
import { useLanguage } from '@/components/providers/LanguageContext';

export const LandingFooter = memo(() => {
  const { t } = useLanguage();

  return (
    <footer className="py-16 bg-black border-t border-white/10">
      <div className="container mx-auto px-4">
        {/* Main Footer Content */}
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-12">

          {/* Left: Brand & Description */}
          <div className="flex flex-col items-start gap-4">
            <Branding size="md" />
            <p className="text-sm text-zinc-500 max-w-xs text-left leading-relaxed">
              {t.landing.footer.description || 'Digital ticketed screenings for independent cinema and music.'}
            </p>
          </div>

          {/* Center: Infrastructure links */}
          <div className="flex flex-col items-start md:items-center gap-3 text-xs text-zinc-600">
            <p className="font-semibold uppercase tracking-wide text-zinc-500">
              {t.landing.footer.built_on_prefix}
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <a href="https://near.org" target="_blank" rel="noopener noreferrer" className="hover:text-zinc-300 transition-colors">NEAR</a>
              <a href="https://ipfs.tech" target="_blank" rel="noopener noreferrer" className="hover:text-zinc-300 transition-colors">IPFS</a>
              <a href="https://www.lighthouse.storage/" target="_blank" rel="noopener noreferrer" className="hover:text-zinc-300 transition-colors">Lighthouse</a>
            </div>
          </div>

          {/* Right: Links & Social */}
          <div className="flex flex-col items-start md:items-end gap-4">
            <div className="flex items-center gap-4">
              <a
                href="https://github.com/4rmus/youtick"
                target="_blank"
                rel="noopener noreferrer"
                className="group p-2 rounded-lg bg-zinc-900/50 hover:bg-white/10 border border-white/5 hover:border-white/20 transition-all"
                title="GitHub"
              >
                <Github className="w-5 h-5 text-zinc-400 group-hover:text-white transition-colors" />
              </a>
            </div>
            <p className="text-xs text-zinc-600">
              {t.landing.footer.copyright}
            </p>
          </div>

        </div>

        {/* Bottom Bar */}
        <div className="mt-12 pt-8 border-t border-white/5 flex justify-center md:justify-end">
          <div className="flex items-center gap-6 text-xs text-zinc-600">
            <a href="/privacy" className="hover:text-zinc-400 transition-colors">{t.landing.footer.privacy}</a>
            <a href="/terms" className="hover:text-zinc-400 transition-colors">{t.landing.footer.terms}</a>
            <a href="mailto:contact@youtick.net" className="hover:text-zinc-400 transition-colors">{t.landing.footer.support}</a>
          </div>
        </div>
      </div>
    </footer>
  );
});

LandingFooter.displayName = 'LandingFooter';
