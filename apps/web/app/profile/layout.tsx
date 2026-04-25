import { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'My Profile',
    description: 'Manage your digital tickets, watch library and creator studio on YouTick.',
    openGraph: {
        title: 'My Profile | YouTick',
        description: 'Manage your digital tickets, watch library and creator studio.',
    },
    twitter: {
        title: 'My Profile | YouTick',
        description: 'Manage your digital tickets, watch library and creator studio.',
    },
};

export default function ProfileLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return children;
}
