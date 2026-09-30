import type { Metadata } from 'next';
import { DiscoverView } from '@/components/discover/DiscoverView';
import { LandingPage } from '@/components/landing/LandingPage';
import { FEATURE_FLAGS } from '@/lib/constants';

/** Discover is the home page once the runtime is open; until then `/` keeps the introduction. */
const runtimeOpen = FEATURE_FLAGS.enablePaidMediaLivepeerV1 || FEATURE_FLAGS.enableDerivedReadModel;

const landingMetadata: Metadata = {
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

const discoverMetadata: Metadata = {
    title: 'Discover Works',
    description: 'Explore films, concert recordings and special screenings from independent creators. Get access with a digital ticket.',
    alternates: { canonical: '/' },
    openGraph: {
        title: 'Discover Works | YouTick',
        description: 'Explore independent films, concert recordings and special screenings on YouTick.',
    },
    twitter: {
        title: 'Discover Works | YouTick',
        description: 'Explore digital-ticketed works from independent creators.',
    },
};

export const metadata: Metadata = runtimeOpen ? discoverMetadata : landingMetadata;

export default function Home() {
    if (!FEATURE_FLAGS.enablePaidMediaLivepeerV1 && !FEATURE_FLAGS.enableDerivedReadModel) {
        return <LandingPage locale="en" enabled={FEATURE_FLAGS.enablePaidMediaLivepeerV1} />;
    }
    return <DiscoverView />;
}
