import type { Metadata } from 'next';
import { Geist, Inter } from 'next/font/google';
import { headers } from 'next/headers';
import { connection } from 'next/server';
import './globals.css';
import { Navbar } from '@/components/Navbar';
import { QueryProvider } from '@/components/providers/QueryProvider';
import { WalletProvider } from '@/components/providers/WalletProvider';
import { PublicTestnetBetaBanner } from '@/components/PublicTestnetBetaBanner';
import { FEATURE_FLAGS } from '@/lib/constants';

const geist = Geist({ subsets: ['latin'], variable: '--font-geist-sans' });
const brand = Inter({ subsets: ['latin'], weight: '700', variable: '--font-brand-inter' });

export const metadata: Metadata = {
    title: { default: 'youtick', template: '%s | youtick' },
    description: 'Ticketed digital screenings for independent film and music.',
    metadataBase: new URL('https://youtick.net'),
    robots: FEATURE_FLAGS.publicTestnetBeta ? { index: false, follow: false } : undefined,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
    await connection();
    const cspNonce = (await headers()).get('x-nonce') ?? undefined;
    return (
        <html lang="en" data-scroll-behavior="smooth">
            <body className={`${geist.variable} ${brand.variable} min-h-screen bg-black text-white antialiased`}>
                <QueryProvider>
                    {(FEATURE_FLAGS.publicTestnetBeta || FEATURE_FLAGS.publicTestnetVideoV1) && <PublicTestnetBetaBanner />}
                    <WalletProvider cspNonce={cspNonce}>
                        <Navbar />
                        <main>{children}</main>
                    </WalletProvider>
                </QueryProvider>
            </body>
        </html>
    );
}
