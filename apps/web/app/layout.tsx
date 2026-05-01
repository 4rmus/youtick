import type { Metadata, Viewport } from "next";
import "./globals.css";
import "@near-wallet-selector/modal-ui/styles.css";
import { WalletProvider } from "@/components/providers/WalletProvider";
import { QueryProvider } from "@/components/providers/QueryProvider";
import { OptionalEvmProvider } from "@/components/providers/OptionalEvmProvider";
import { Navbar } from "@/components/Navbar";
import { LanguageProvider } from "@/components/providers/LanguageContext";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { ThemeProvider } from "@/components/providers/ThemeProvider";
import { GoogleAnalytics } from "@next/third-parties/google";
import { OnboardingKeyInit } from "@/components/OnboardingKeyInit";

export const metadata: Metadata = {
    title: {
        default: 'YouTick - Digital Ticketed Releases for Film and Music',
        template: '%s | YouTick',
    },
    description: 'YouTick is a public-alpha platform for filmmakers and musicians to release films, concert recordings and special screenings with digital tickets, protected access and a clear 2% platform fee on paid ticket sales.',
    keywords: [
        'digital ticketed release',
        'film screening platform',
        'concert recording platform',
        'NEAR Protocol',
        'digital tickets',
        'serverless edge media',
        'independent cinema',
        'music release',
        'video on demand',
        'dApp',
        'ticketed streaming',
        'Edge KMS',
        'client-side encryption',
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
        title: 'YouTick - Digital Ticketed Releases for Film and Music',
        description: 'A public-alpha release platform for films, concert recordings and special screenings with digital tickets and a clear 2% platform fee on paid ticket sales.',
        images: [
            {
                url: 'https://youtick.net/hero_concert.png',
                width: 1024,
                height: 1024,
                alt: 'YouTick digital ticketed release preview',
            },
        ],
    },
    twitter: {
        card: 'summary_large_image',
        title: 'YouTick - Digital Ticketed Releases for Film and Music',
        description: 'Creators release films and concert recordings directly with digital tickets.',
        images: ['https://youtick.net/hero_concert.png'],
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
                <link rel="dns-prefetch" href="https://ipfs.io" />
                <link rel="dns-prefetch" href="https://dweb.link" />
                <link rel="dns-prefetch" href="https://4everland.io" />
                <link rel="dns-prefetch" href="https://gateway.lighthouse.storage" />
                <link rel="preconnect" href="https://ipfs.io" crossOrigin="" />
                <link rel="preconnect" href="https://dweb.link" crossOrigin="" />
                <link rel="preconnect" href="https://4everland.io" crossOrigin="" />
                <link rel="preconnect" href="https://gateway.lighthouse.storage" crossOrigin="" />
                {/* ChunkLoadError recovery: reload page on failed dynamic imports (IPFS gateway blips) */}
                <script dangerouslySetInnerHTML={{
                    __html: `
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
            <body className="antialiased">
                <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
                    <QueryProvider>
                        <OptionalEvmProvider>
                            <LanguageProvider>
                                <WalletProvider>
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
                        </OptionalEvmProvider>
                    </QueryProvider>
                </ThemeProvider>
            </body>
            <GoogleAnalytics gaId="G-4J9W05MW6W" />
        </html>
    );
}
