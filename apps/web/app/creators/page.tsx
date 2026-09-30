import type { Metadata } from 'next';
import { LandingPage } from '@/components/landing/LandingPage';
import { FEATURE_FLAGS } from '@/lib/constants';

// "For creators": the introduction page, also shown at `/` while the runtime is closed.
export const metadata: Metadata = {
    title: 'Ticketed screenings for independent film and music',
    description: 'Sell a film or concert recording directly to your audience with a digital ticket and Livepeer video playback.',
    alternates: {
        canonical: '/creators',
        languages: { en: '/creators', tr: '/tr', 'x-default': '/creators' },
    },
    openGraph: {
        type: 'website',
        url: '/creators',
        locale: 'en_US',
        alternateLocale: ['tr_TR'],
        title: 'YouTick — Ticketed digital screenings',
        description: 'Upload the work, set the ticket price, and sell directly to your audience.',
        images: [{ url: '/hero-concert.webp', width: 1024, height: 1024, alt: 'A concert stage facing a live audience' }],
    },
};

export default function CreatorsPage() {
    return <LandingPage locale="en" enabled={FEATURE_FLAGS.enablePaidMediaLivepeerV1} />;
}
