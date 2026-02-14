import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import "@near-wallet-selector/modal-ui/styles.css";
import { WalletProvider } from "@/components/providers/WalletProvider";
import { QueryProvider } from "@/components/providers/QueryProvider";
import { EvmProvider } from "@/components/providers/EvmProvider";
import { Navbar } from "@/components/Navbar";
import { LanguageProvider } from "@/components/providers/LanguageContext";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { ThemeProvider } from "@/components/providers/ThemeProvider";
import { GoogleAnalytics } from "@next/third-parties/google";
import { OnboardingKeyInit } from "@/components/OnboardingKeyInit";
import { NovaAccessSync } from "@/components/NovaAccessSync";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
    title: {
        default: 'YouTick - Decentralized Video Streaming',
        template: '%s | YouTick',
    },
    description: 'YouTick is a decentralized video-on-demand platform on NEAR Protocol. Artists earn 98% revenue with instant payments. NFT-based tickets, encrypted streaming, and censorship-resistant content.',
    keywords: [
        'decentralized video',
        'video streaming',
        'NEAR Protocol',
        'NFT tickets',
        'Web3 video',
        'creator economy',
        'video on demand',
        'dApp',
        'blockchain streaming',
        'Nova SDK',
        'TEE encryption',
        'IPFS video',
        'encrypted video',
    ],
    authors: [{ name: 'YouTick' }],
    creator: 'YouTick',
    publisher: 'YouTick',
    robots: {
        index: true,
        follow: true,
        googleBot: {
            index: true,
            follow: true,
            'max-video-preview': -1,
            'max-image-preview': 'large',
            'max-snippet': -1,
        },
    },
    openGraph: {
        type: 'website',
        locale: 'en_US',
        alternateLocale: 'tr_TR',
        url: 'https://youtick.net',
        siteName: 'YouTick',
        title: 'YouTick - Decentralized Video Streaming',
        description: 'Artists earn 98% revenue with instant payments. NFT-based tickets, encrypted streaming on NEAR Protocol.',
        images: [
            {
                url: 'https://youtick.net/og-image.png',
                width: 1200,
                height: 630,
                alt: 'YouTick - Decentralized Video Streaming Platform',
            },
        ],
    },
    twitter: {
        card: 'summary_large_image',
        title: 'YouTick - Decentralized Video Streaming',
        description: 'Artists earn 98% revenue with instant payments. NFT-based tickets on NEAR Protocol.',
        images: ['https://youtick.net/og-image.png'],
        creator: '@youtick_net',
    },
    category: 'technology',
    metadataBase: new URL('https://youtick.net'),
};

export const viewport: Viewport = {
    width: 'device-width',
    initialScale: 1,
    maximumScale: 5,
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="en" suppressHydrationWarning>
            <head>
                {/* ChunkLoadError recovery: reload page on failed dynamic imports (IPFS gateway blips) */}
                <script dangerouslySetInnerHTML={{ __html: `
                    (function(){
                        var retries = 0;
                        var MAX_RETRIES = 3;
                        var KEY = '__ytk_chunk_retry';
                        try { retries = parseInt(sessionStorage.getItem(KEY) || '0', 10); } catch(e) {}
                        window.addEventListener('error', function(e) {
                            if (e.message && e.message.indexOf('ChunkLoadError') !== -1 && retries < MAX_RETRIES) {
                                try { sessionStorage.setItem(KEY, String(retries + 1)); } catch(e) {}
                                window.location.reload();
                            }
                        });
                        window.addEventListener('unhandledrejection', function(e) {
                            var msg = e.reason && (e.reason.message || String(e.reason));
                            if (msg && msg.indexOf('ChunkLoadError') !== -1 && retries < MAX_RETRIES) {
                                try { sessionStorage.setItem(KEY, String(retries + 1)); } catch(e) {}
                                window.location.reload();
                            }
                        });
                        if (retries > 0) { setTimeout(function(){ try { sessionStorage.removeItem(KEY); } catch(e) {} }, 30000); }
                    })();
                `}} />
            </head>
            <body className={inter.className}>
                <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
                    <QueryProvider>
                        <EvmProvider>
                        <LanguageProvider>
                            <WalletProvider>
                            <NovaAccessSync />
                            <OnboardingKeyInit />
                            <div className="min-h-screen bg-background text-foreground">
                                <Navbar />
                                <main className="flex-grow">
                                    {children}
                                </main>
                            </div>
                            <LanguageSwitcher />
                        </WalletProvider>
                        </LanguageProvider>
                        </EvmProvider>
                    </QueryProvider>
                </ThemeProvider>
            </body>
            <GoogleAnalytics gaId="G-4J9W05MW6W" />
        </html>
    );
}
