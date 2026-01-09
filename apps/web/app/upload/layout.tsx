import { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Upload Content',
    description: 'Upload your video content and sell NFT tickets directly to your audience. Earn 98% revenue with instant payments on NEAR Protocol.',
    openGraph: {
        title: 'Upload Content | YouTick',
        description: 'Upload your video content and sell NFT tickets directly to your audience. Earn 98% revenue.',
    },
    twitter: {
        title: 'Upload Content | YouTick',
        description: 'Upload your video content and sell NFT tickets directly to your audience.',
    },
};

export default function UploadLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return children;
}
