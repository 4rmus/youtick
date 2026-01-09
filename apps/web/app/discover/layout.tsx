import { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Discover Videos',
    description: 'Explore exclusive NFT-gated video content from independent artists. Buy tickets with NEAR and get lifetime access to premium content.',
    openGraph: {
        title: 'Discover Videos | YouTick',
        description: 'Explore exclusive NFT-gated video content from independent artists on the decentralized video platform.',
    },
    twitter: {
        title: 'Discover Videos | YouTick',
        description: 'Explore exclusive NFT-gated video content from independent artists.',
    },
};

export default function DiscoverLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return children;
}
