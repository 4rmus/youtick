import { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Discover Works',
    description: 'Explore films, concert recordings and special screenings from independent creators. Get access with a digital ticket.',
    openGraph: {
        title: 'Discover Works | youtick',
        description: 'Explore independent films, concert recordings and special screenings on youtick.',
    },
    twitter: {
        title: 'Discover Works | youtick',
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
