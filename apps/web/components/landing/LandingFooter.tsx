import { memo } from 'react';
import { Github, Layers } from 'lucide-react';
import { Branding } from './Branding';
import { useLanguage } from '@/components/providers/LanguageContext';
import { ANIMATION } from '@/lib/constants';

export const LandingFooter = memo(() => {
  const { t } = useLanguage();

  return (
    <footer className="py-12 bg-black border-t border-white/10">
      <div className="container mx-auto px-4">
        <div className="flex flex-col md:flex-row items-center justify-between gap-8">

          {/* Left: Brand */}
          <div className="flex-shrink-0">
            <Branding size="md" />
          </div>

          {/* Center: Copyright & Tech */}
          <div className="flex flex-col items-center text-center">
            <p className="text-sm text-zinc-500 font-medium">
              {t.landing.footer.copyright}
            </p>
            <p className="text-xs text-zinc-600 mt-1">
              {t.landing.footer.built_on_prefix} <span className="text-zinc-400">NEAR Protocol</span>, <span className="text-zinc-400">Lighthouse</span> & <span className="text-zinc-400">Lit Protocol</span>.
            </p>
          </div>

          {/* Right: Social Links */}
          <div className="flex items-center gap-4">
            <a
              href="https://github.com/4rmus/youtick-mvp"
              target="_blank"
              rel="noopener noreferrer"
              className="group p-2 rounded-full bg-zinc-900/50 hover:bg-zinc-800 border border-white/5 hover:border-white/20 transition-all"
              title="GitHub"
            >
              <Github className="w-5 h-5 text-zinc-400 group-hover:text-white transition-colors" />
            </a>

            <a
              href="https://near.org"
              target="_blank"
              rel="noopener noreferrer"
              className="group p-2 rounded-full bg-zinc-900/50 hover:bg-zinc-800 border border-white/5 hover:border-white/20 transition-all"
              title="NEAR Protocol"
            >
              <Layers className="w-5 h-5 text-zinc-400 group-hover:text-white transition-colors" />
            </a>
          </div>

        </div>
      </div>
    </footer>
  );
});

LandingFooter.displayName = 'LandingFooter';
