import type { Metadata } from 'next';
import { LandingPage } from '@/components/landing/LandingPage';

export const metadata: Metadata = {
    title: 'Independent films, documentaries and concert recordings, by ticket',
    description: 'youtick is a ticketed screening room for recorded concerts, films and performances. Opening February 2027. Artists can apply now.',
    alternates: {
        canonical: '/',
        languages: { en: '/', tr: '/tr', 'x-default': '/' },
    },
    openGraph: {
        type: 'website',
        url: '/',
        locale: 'en_US',
        alternateLocale: ['tr_TR'],
        title: 'youtick — Ticketed digital screenings',
        description: 'Opening February 2027. Independent films, documentaries and concert recordings, by ticket.',
        images: [{ url: '/hero-concert.webp', width: 1024, height: 1024, alt: 'A concert stage facing a live audience' }],
    },
};

export default function Home() {
    return <LandingPage locale="en" />;
}
