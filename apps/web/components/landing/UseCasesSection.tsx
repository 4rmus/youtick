import { memo } from 'react';
import Image from 'next/image';
import { Music, Film, Trophy } from 'lucide-react';
import { useLanguage } from '@/components/providers/LanguageContext';
import { ANIMATION } from '@/lib/constants';

const useCases = [
  {
    key: 'concerts',
    image: '/concert_crowd.png',
    icon: Music,
  },
  {
    key: 'cinema',
    image: '/cinema_scene.png',
    icon: Film,
  },
  {
    key: 'sports',
    image: null, // Gradient background
    icon: Trophy,
  },
] as const;

export const UseCasesSection = memo(() => {
  const { t } = useLanguage();

  return (
    <section id="use-cases" className="py-32 bg-black">
      <div className="container mx-auto px-4">
        {/* Header */}
        <div className="max-w-3xl mx-auto text-center mb-20">
          <h2 className="text-4xl md:text-5xl font-black mb-6">
            {t.landing.use_cases.title}
          </h2>
          <p className="text-zinc-400 text-lg">
            {t.landing.use_cases.subtitle}
          </p>
        </div>

        {/* Use Cases Grid */}
        <div className="grid md:grid-cols-3 gap-8">
          {useCases.map(({ key, image, icon: Icon }) => (
            <div
              key={key}
              className={`group relative overflow-hidden rounded-2xl aspect-[4/5] cursor-pointer ${!image ? 'bg-zinc-900' : ''}`}
            >
              {image ? (
                <>
                  <Image
                    src={image}
                    alt={t.landing.use_cases[`${key}_title` as keyof typeof t.landing.use_cases] as string}
                    fill
                    className={`object-cover ${ANIMATION.transition.transform} ${ANIMATION.duration.slow} ${ANIMATION.hover.scaleImage}`}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black via-black/30 to-transparent" />
                </>
              ) : (
                <>
                  <div className="absolute inset-0 bg-gradient-to-br from-zinc-800 to-black" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Icon className="w-24 h-24 text-white/10" />
                  </div>
                </>
              )}

              <div className="absolute bottom-0 left-0 right-0 p-8">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 bg-white/10 backdrop-blur rounded-full flex items-center justify-center">
                    <Icon className="w-6 h-6 text-white" />
                  </div>
                  <h3 className="text-2xl font-bold text-white">
                    {t.landing.use_cases[`${key}_title` as keyof typeof t.landing.use_cases]}
                  </h3>
                </div>
                <p className="text-zinc-400 leading-relaxed">
                  {t.landing.use_cases[`${key}_desc` as keyof typeof t.landing.use_cases]}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
});

UseCasesSection.displayName = 'UseCasesSection';
