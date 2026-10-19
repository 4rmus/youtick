import type { Metadata } from 'next';
import { ApplyPage } from '@/components/apply/ApplyPage';

export const metadata: Metadata = {
    title: 'Apply as an artist',
    description: 'Musicians, filmmakers and performers can apply to show their work on youtick.',
    alternates: { canonical: '/apply', languages: { en: '/apply', tr: '/tr/apply', 'x-default': '/apply' } },
};

export default function CreatorApplyPage() {
    return <ApplyPage locale="en" />;
}
