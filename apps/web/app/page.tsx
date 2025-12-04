'use client';

import Image from 'next/image';
import Link from 'next/link';
import { Button } from "@/components/ui/button";
import { ArrowRight, Shield, Ticket, Zap } from "lucide-react";

export default function Home() {
  return (
    <div className="flex flex-col min-h-screen bg-black text-white selection:bg-red-500 selection:text-white">

      {/* HERO SECTION */}
      <section className="relative h-screen flex items-center justify-center overflow-hidden">
        {/* Background Image with Overlay */}
        <div className="absolute inset-0 z-0">
          <Image
            src="/hero_shock_centralization_1764836087396.png"
            alt="Centralization Chaos"
            fill
            className="object-cover opacity-60 grayscale hover:grayscale-0 transition-all duration-[2s] scale-105 hover:scale-100"
            priority
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/50 to-transparent" />
        </div>

        <div className="relative z-10 container mx-auto px-4 text-center space-y-8">
          <h1 className="text-6xl md:text-8xl font-black tracking-tighter uppercase animate-in fade-in slide-in-from-bottom-8 duration-1000">
            Break the <span className="text-red-600 glitch-text">Algorithm</span>
          </h1>
          <p className="text-xl md:text-2xl text-gray-300 max-w-2xl mx-auto font-light">
            The era of centralized control is over. Own your content. Own your audience. Own your revenue.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center pt-8">
            <Link href="/discover">
              <Button size="lg" className="bg-white text-black hover:bg-gray-200 text-lg px-8 py-6 rounded-none font-bold uppercase tracking-widest">
                Start Watching
              </Button>
            </Link>
            <Link href="/upload">
              <Button size="lg" variant="outline" className="border-white text-white hover:bg-white/10 text-lg px-8 py-6 rounded-none font-bold uppercase tracking-widest">
                Upload Video
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* PROBLEM / SOLUTION SECTION */}
      <section className="py-24 bg-black">
        <div className="container mx-auto px-4">
          <div className="grid md:grid-cols-2 gap-16 items-center">
            <div className="space-y-6">
              <h2 className="text-4xl md:text-5xl font-bold tracking-tight">
                Your Data, <span className="text-red-600">Held Hostage.</span>
              </h2>
              <p className="text-lg text-gray-400 leading-relaxed">
                Traditional platforms sell your attention, censor your voice, and take the lion's share of your earnings. You are not the customer; you are the product.
              </p>
              <ul className="space-y-4 text-gray-300">
                <li className="flex items-center gap-3">
                  <div className="h-2 w-2 bg-red-600 rounded-full" />
                  Arbitrary Demonetization
                </li>
                <li className="flex items-center gap-3">
                  <div className="h-2 w-2 bg-red-600 rounded-full" />
                  Shadowbanning & Censorship
                </li>
                <li className="flex items-center gap-3">
                  <div className="h-2 w-2 bg-red-600 rounded-full" />
                  Data Privacy Violations
                </li>
              </ul>
            </div>
            <div className="relative aspect-square border border-white/10 rounded-3xl overflow-hidden group">
              <Image
                src="/feature_encryption_shield_1764836182111.png"
                alt="Encryption Shield"
                fill
                className="object-cover transition-transform duration-700 group-hover:scale-110"
              />
              <div className="absolute inset-0 bg-black/60 flex items-center justify-center group-hover:bg-black/40 transition-colors">
                <div className="text-center p-8 border border-white/20 bg-black/50 backdrop-blur-md rounded-xl">
                  <Shield className="w-16 h-16 mx-auto mb-4 text-blue-500" />
                  <h3 className="text-2xl font-bold mb-2">Military-Grade Encryption</h3>
                  <p className="text-sm text-gray-400">Your content is encrypted before it ever leaves your device.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FEATURES GRID */}
      <section className="py-24 bg-zinc-900">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold mb-4">The <span className="text-primary">YouTick</span> Advantage</h2>
            <p className="text-gray-400">Built on NEAR Protocol, IPFS, and Lit Protocol.</p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            <div className="bg-black p-8 border border-white/10 hover:border-red-600/50 transition-colors group">
              <Ticket className="w-12 h-12 text-red-600 mb-6 group-hover:scale-110 transition-transform" />
              <h3 className="text-xl font-bold mb-4">NFT Gated Access</h3>
              <p className="text-gray-400">
                Sell access to your content as NFTs. Create exclusive clubs, pay-per-view events, or lifetime passes.
              </p>
            </div>
            <div className="bg-black p-8 border border-white/10 hover:border-blue-500/50 transition-colors group">
              <Shield className="w-12 h-12 text-blue-500 mb-6 group-hover:scale-110 transition-transform" />
              <h3 className="text-xl font-bold mb-4">True Ownership</h3>
              <p className="text-gray-400">
                You own the keys. You own the content. No platform can take it down or lock you out.
              </p>
            </div>
            <div className="bg-black p-8 border border-white/10 hover:border-green-500/50 transition-colors group">
              <Zap className="w-12 h-12 text-green-500 mb-6 group-hover:scale-110 transition-transform" />
              <h3 className="text-xl font-bold mb-4">Instant Payouts</h3>
              <p className="text-gray-400">
                Smart contracts handle the revenue. Get paid instantly in crypto when someone buys your NFT.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA SECTION */}
      <section className="py-32 bg-black relative overflow-hidden">
        <div className="absolute inset-0 opacity-20">
          <Image
            src="/feature_nft_ticket_1764836213583.png"
            alt="Background"
            fill
            className="object-cover"
          />
        </div>
        <div className="relative z-10 container mx-auto px-4 text-center">
          <h2 className="text-5xl md:text-7xl font-black mb-8">READY TO JOIN?</h2>
          <p className="text-xl text-gray-300 mb-12 max-w-2xl mx-auto">
            Mint your Genesis Pass today and experience the future of streaming.
          </p>
          <Link href="/mint">
            <Button size="lg" className="bg-red-600 hover:bg-red-700 text-white text-xl px-12 py-8 rounded-full font-bold shadow-lg shadow-red-900/20 hover:shadow-red-600/40 transition-all">
              Get Your Pass <ArrowRight className="ml-2 w-6 h-6" />
            </Button>
          </Link>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="py-12 bg-zinc-950 border-t border-white/10 text-center text-gray-500">
        <p>&copy; 2024 YouTick Decentralized Platform. Built on NEAR.</p>
      </footer>
    </div>
  );
}
