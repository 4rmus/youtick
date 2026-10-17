import type { Metadata } from 'next';
import { ApplyPage } from '@/components/apply/ApplyPage';

export const metadata: Metadata = {
    title: 'Apply for a creator invite',
    description: 'Film and music creators can apply to release their work with youtick.',
    alternates: { canonical: '/apply', languages: { en: '/apply', tr: '/tr/apply', 'x-default': '/apply' } },
};

export default function CreatorApplyPage() {
    return <ApplyPage locale="en" />;
}
