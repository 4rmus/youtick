import { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'My Profile',
    description: 'View and withdraw your YouTick creator USDC balance.',
    openGraph: {
        title: 'My Profile | YouTick',
        description: 'View and withdraw your creator USDC balance.',
    },
    twitter: {
        title: 'My Profile | YouTick',
        description: 'View and withdraw your creator USDC balance.',
    },
};

export default function ProfileLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return children;
}
