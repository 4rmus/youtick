import type { Metadata } from 'next';
import { FaqPage } from '@/components/faq/FaqPage';

export const metadata: Metadata = {
    title: 'FAQ',
    description: 'Short answers on youtick tickets, playback, refunds and artist applications.',
    alternates: { canonical: '/faq', languages: { en: '/faq', tr: '/tr/faq', 'x-default': '/faq' } },
};

export default function FaqRoute() {
    return <FaqPage locale="en" />;
}
