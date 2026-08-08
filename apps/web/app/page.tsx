import type { Metadata } from 'next';
import { LandingPage } from '@/components/landing/LandingPage';
import { FEATURE_FLAGS } from '@/lib/constants';

export const metadata: Metadata = {
    title: 'Ticketed screenings for independent film and music',
    description: 'Sell a film or concert recording directly to your audience with a digital ticket and Livepeer video playback.',
    alternates: {
        canonical: '/',
        languages: { en: '/', tr: '/tr', 'x-default': '/' },
    },
    openGraph: {
        type: 'website',
        url: '/',
        locale: 'en_US',
        alternateLocale: ['tr_TR'],
        title: 'YouTick — Ticketed digital screenings',
        description: 'Upload the work, set the ticket price, and sell directly to your audience.',
        images: [{ url: '/hero-concert.webp', width: 1024, height: 1024, alt: 'A concert stage facing a live audience' }],
    },
};

export default function Home() {
    return <LandingPage locale="en" enabled={FEATURE_FLAGS.enablePaidMediaLivepeerV1} />;
}
