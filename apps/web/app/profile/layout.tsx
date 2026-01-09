import { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'My Profile',
    description: 'Manage your NFT video tickets, view your collection, and access your purchased content on YouTick.',
    openGraph: {
        title: 'My Profile | YouTick',
        description: 'Manage your NFT video tickets and access your purchased content.',
    },
    twitter: {
        title: 'My Profile | YouTick',
        description: 'Manage your NFT video tickets and access your purchased content.',
    },
};

export default function ProfileLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return children;
}
