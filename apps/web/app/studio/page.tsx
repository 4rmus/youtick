import type { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Studio',
    description: 'View and withdraw your YouTick creator USDC balance.',
    openGraph: {
        title: 'Studio | YouTick',
        description: 'View and withdraw your creator USDC balance.',
    },
    twitter: {
        title: 'Studio | YouTick',
        description: 'View and withdraw your creator USDC balance.',
    },
};

// The creator dashboard moves here from /profile; G14 replaces it with the Studio screen.
export { default } from '@/app/profile/page';
