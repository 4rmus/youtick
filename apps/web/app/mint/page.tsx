'use client';

import { MintButton } from '@/components/MintButton';
import Image from 'next/image';

export default function MintPage() {
    return (
        <div className="container mx-auto px-4 py-24 min-h-screen">
            <div className="grid md:grid-cols-2 gap-12 items-center max-w-6xl mx-auto">
                <div className="space-y-8">
                    <h1 className="text-5xl font-bold tracking-tighter">
                        Get Your <span className="text-primary">YouTick Pass</span>
                    </h1>
                    <p className="text-xl text-muted-foreground leading-relaxed">
                        Unlock the world of decentralized cinema. The YouTick Pass NFT grants you exclusive access to encrypted content on the platform.
                    </p>

                    <div className="space-y-4">
                        <div className="flex items-center gap-4">
                            <div className="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold">1</div>
                            <p>One-time purchase for lifetime access (Testnet)</p>
                        </div>
                        <div className="flex items-center gap-4">
                            <div className="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold">2</div>
                            <p>Decrypt any video on the platform</p>
                        </div>
                        <div className="flex items-center gap-4">
                            <div className="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold">3</div>
                            <p>Tradeable on secondary markets</p>
                        </div>
                    </div>

                    <div className="pt-8">
                        <MintButton />
                    </div>
                </div>

                <div className="relative aspect-square rounded-2xl overflow-hidden border border-slate-800 shadow-2xl shadow-primary/20">
                    {/* Placeholder for the NFT Ticket Image we generated */}
                    <Image
                        src="/feature_nft_ticket_1764836213583.png"
                        alt="NFT Ticket"
                        fill
                        className="object-cover hover:scale-105 transition-transform duration-500"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent pointer-events-none" />
                    <div className="absolute bottom-6 left-6 right-6">
                        <p className="text-white font-mono text-sm">EDITION: GENESIS</p>
                        <p className="text-white font-bold text-2xl">ACCESS PASS #001</p>
                    </div>
                </div>
            </div>
        </div>
    );
}
