import { memo } from 'react';
import { Github } from 'lucide-react';
import { Branding } from './Branding';
import { BuiltOnNEARBadge } from './BuiltOnNEARBadge';
import { useLanguage } from '@/components/providers/LanguageContext';
import { NEAR_CONFIG } from '@/lib/constants';

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
              {t.landing.footer.description || 'Empowering artists with true ownership and instant payments.'}
            </p>
          </div>

          {/* Center: Built on NEAR Badge */}
          <div className="flex flex-col items-center gap-4">
            <BuiltOnNEARBadge variant="dark" size="lg" />
            <div className="flex items-center gap-2 text-xs text-zinc-600">
              <span>+</span>
              <a href="https://nova-sdk.com/" target="_blank" rel="noopener noreferrer" className="text-zinc-500 hover:text-near-green transition-colors">Nova</a>
              <span>•</span>
              <a href="https://crust.network" target="_blank" rel="noopener noreferrer" className="text-zinc-500 hover:text-near-green transition-colors">Crust Network</a>
            </div>
          </div>

          {/* Right: Links & Social */}
          <div className="flex flex-col items-start md:items-end gap-4">
            <div className="flex items-center gap-4">
              <a
                href="https://github.com/4rmus/youtick"
                target="_blank"
                rel="noopener noreferrer"
                className="group p-2 rounded-lg bg-zinc-900/50 hover:bg-near-green/10 border border-white/5 hover:border-near-green/30 transition-all"
                title="GitHub"
              >
                <Github className="w-5 h-5 text-zinc-400 group-hover:text-near-green transition-colors" />
              </a>
              <a
                href={NEAR_CONFIG.networkId === 'mainnet' ? 'https://nearblocks.io' : 'https://testnet.nearblocks.io'}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-zinc-500 hover:text-near-green transition-colors"
              >
                NEAR Explorer →
              </a>
            </div>
            <p className="text-xs text-zinc-600">
              {t.landing.footer.copyright}
            </p>
          </div>

        </div>

        {/* Bottom Bar */}
        <div className="mt-12 pt-8 border-t border-white/5 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-xs text-zinc-600 text-left">
            {t.landing.footer.built_on_prefix}{' '}
            <a href="https://near.org" target="_blank" rel="noopener noreferrer" className="hover:text-zinc-400 transition-colors">NEAR Protocol</a>
            {' • '}
            <a href="https://nova-sdk.com/" target="_blank" rel="noopener noreferrer" className="hover:text-zinc-400 transition-colors">Nova</a>
            {' • '}
            <a href="https://crust.network" target="_blank" rel="noopener noreferrer" className="hover:text-zinc-400 transition-colors">Crust Network</a>
          </p>
          <div className="flex items-center gap-6 text-xs text-zinc-600">
            <a href="/privacy" className="hover:text-zinc-400 transition-colors">Privacy</a>
            <a href="/terms" className="hover:text-zinc-400 transition-colors">Terms</a>
            <a href="mailto:contact@youtick.net" className="hover:text-zinc-400 transition-colors">Contact</a>
          </div>
        </div>
      </div>
    </footer>
  );
});

LandingFooter.displayName = 'LandingFooter';
