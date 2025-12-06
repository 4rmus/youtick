import { memo } from 'react';
import { Branding } from './Branding';
import { useLanguage } from '@/components/providers/LanguageContext';
import { ANIMATION } from '@/lib/constants';

export const LandingFooter = memo(() => {
  const { t } = useLanguage();

  return (
    <footer className="py-16 bg-zinc-950 border-t border-white/5">
      <div className="container mx-auto px-4">
        <div className="flex flex-col md:flex-row items-center justify-between gap-8">
          <Branding size="md" />

          <p className="text-zinc-600 text-sm">
            &copy; 2024 YouTick. {t.landing.footer.built_on}
          </p>

          <div className="flex items-center gap-6 text-zinc-500 text-sm">
            <a href="#" className={`hover:text-white ${ANIMATION.transition.colors}`}>
              {t.landing.footer.privacy}
            </a>
            <a href="#" className={`hover:text-white ${ANIMATION.transition.colors}`}>
              {t.landing.footer.terms}
            </a>
            <a href="#" className={`hover:text-white ${ANIMATION.transition.colors}`}>
              {t.landing.footer.support}
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
});

LandingFooter.displayName = 'LandingFooter';
