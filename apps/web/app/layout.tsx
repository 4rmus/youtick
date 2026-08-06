import type { Metadata } from 'next';
import { Geist } from 'next/font/google';
import './globals.css';
import { Navbar } from '@/components/Navbar';
import { QueryProvider } from '@/components/providers/QueryProvider';
import { WalletProvider } from '@/components/providers/WalletProvider';

const geist = Geist({ subsets: ['latin'], variable: '--font-geist-sans' });

export const metadata: Metadata = {
    title: { default: 'YouTick', template: '%s | YouTick' },
    description: 'Paid Livepeer video publications with NEAR access control and USDC settlement.',
    metadataBase: new URL('https://youtick.net'),
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="en">
            <body className={`${geist.variable} min-h-screen bg-black text-white antialiased`}>
                <QueryProvider>
                    <WalletProvider>
                        <Navbar />
                        <main>{children}</main>
                    </WalletProvider>
                </QueryProvider>
            </body>
        </html>
    );
}
