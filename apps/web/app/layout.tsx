import type { Metadata } from 'next';
import { Geist } from 'next/font/google';
import { headers } from 'next/headers';
import { connection } from 'next/server';
import './globals.css';
import { Navbar } from '@/components/Navbar';
import { QueryProvider } from '@/components/providers/QueryProvider';
import { WalletProvider } from '@/components/providers/WalletProvider';

const geist = Geist({ subsets: ['latin'], variable: '--font-geist-sans' });

export const metadata: Metadata = {
    title: { default: 'YouTick', template: '%s | YouTick' },
    description: 'Ticketed digital screenings for independent film and music.',
    metadataBase: new URL('https://youtick.net'),
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
    await connection();
    const cspNonce = (await headers()).get('x-nonce') ?? undefined;
    return (
        <html lang="en" data-scroll-behavior="smooth">
            <body className={`${geist.variable} min-h-screen bg-black text-white antialiased`}>
                <QueryProvider>
                    <WalletProvider cspNonce={cspNonce}>
                        <Navbar />
                        <main>{children}</main>
                    </WalletProvider>
                </QueryProvider>
            </body>
        </html>
    );
}
