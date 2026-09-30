import { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Discover Works',
    description: 'Explore films, concert recordings and special screenings from independent creators. Get access with a digital ticket.',
    openGraph: {
        title: 'Discover Works | YouTick',
        description: 'Explore independent films, concert recordings and special screenings on YouTick.',
    },
    twitter: {
        title: 'Discover Works | YouTick',
        description: 'Explore digital-ticketed works from independent creators.',
    },
};

export default function DiscoverLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return children;
}
