'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Button } from "@/components/ui/button";
import { ArrowRight, Shield, Ticket, Zap, Play, Loader2 } from "lucide-react";
import { useAllVideos } from '@/hooks/useAllVideos';

function DiscoverView() {
  const { tokens, loading, error, debugInfo } = useAllVideos();

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] text-white">
        <Loader2 className="h-12 w-12 animate-spin mb-4 text-red-600" />
        <p className="text-xl">Scanning Blockchain...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-24 text-white">
        <p className="text-red-500 text-xl font-bold">Failed to load videos</p>
        <p className="text-gray-400">{error}</p>
      </div>
    );
  }

  if (tokens.length === 0) {
    return (
      <div className="text-center py-24 text-white">
        <p className="text-2xl font-bold mb-4">No Videos Found</p>
        <p className="text-gray-400">Be the first to upload content!</p>

        {/* Debug Info */}
        <div className="mt-8 p-4 bg-zinc-900 mx-auto max-w-md rounded text-left text-xs font-mono text-zinc-500 overflow-auto">
          <p className="font-bold text-zinc-300 mb-2">Debug Info:</p>
          <pre>{JSON.stringify(debugInfo, null, 2)}</pre>
        </div>

        <Link href="/upload" className="mt-8 inline-block">
          <Button variant="outline" className="border-red-600 text-red-100 hover:bg-red-900/50">
            Upload Now
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <h2 className="text-3xl font-bold text-white mb-8 border-l-4 border-red-600 pl-4">Recently Uploaded</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {tokens.map((token) => {
          const isVideo = !!token.video_metadata?.encrypted_cid;
          return (
            <Link
              href={`/ticket?cid=${token.video_metadata?.encrypted_cid || ''}`}
              key={token.token_id}
              className="group"
            >
              <div className={`bg-zinc-900 border ${isVideo ? 'border-zinc-800' : 'border-blue-900/50'} rounded-lg overflow-hidden transition-transform group-hover:scale-105 group-hover:border-red-600/50`}>
                {/* Thumbnail Placeholder */}
                <div className="aspect-video bg-zinc-950 relative flex items-center justify-center">
                  {/* If we had a real thumbnail, we'd use Image */}
                  {token.metadata?.media && token.metadata.media.startsWith("http") ? (
                    <img
                      src={token.metadata.media}
                      alt={token.metadata.title}
                      className="w-full h-full object-cover opacity-60 group-hover:opacity-100 transition-opacity"
                    />
                  ) : (
                    <div className={`bg-gradient-to-br ${isVideo ? 'from-zinc-800 to-black' : 'from-blue-900/20 to-black'} w-full h-full opacity-50`} />
                  )}

                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className={`${isVideo ? 'bg-red-600/90' : 'bg-blue-600/90'} p-4 rounded-full backdrop-blur-sm`}>
                      {isVideo ? <Play className="w-8 h-8 text-white fill-current" /> : <Ticket className="w-8 h-8 text-white" />}
                    </div>
                  </div>
                </div>
                <div className="p-4">
                  <h3 className="font-bold text-lg text-white mb-1 line-clamp-1 group-hover:text-red-500 transition-colors">
                    {token.metadata?.title || `Token #${token.token_id}`}
                  </h3>
                  <p className="text-sm text-zinc-400 line-clamp-2 min-h-[2.5rem]">
                    {token.metadata?.description || "No description provided."}
                  </p>
                  <div className="mt-4 flex items-center justify-between text-xs text-zinc-500 border-t border-zinc-800 pt-3">
                    <span>OWN: {token.owner_id}</span>
                    <span className={`px-2 py-1 rounded text-zinc-300 ${isVideo ? 'bg-zinc-800' : 'bg-blue-900/30 text-blue-200'}`}>
                      {token.video_metadata?.content_type || "Access Pass"}
                    </span>
                  </div>
                </div>
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  );
}

export default function Home() {
  const [view, setView] = useState<'landing' | 'discover'>('landing');

  if (view === 'discover') {
    return (
      <div className="min-h-screen bg-black text-white">
        <nav className="border-b border-white/10 bg-zinc-950 sticky top-0 z-50">
          <div className="container mx-auto px-4 h-16 flex items-center justify-between">
            <Link href="/" onClick={() => setView('landing')} className="text-xl font-black italic tracking-tighter">
              <span className="text-white">YOU</span><span className="text-red-600">TICK</span>
            </Link>
            <div className="flex items-center gap-4">
              <Button variant="ghost" onClick={() => setView('landing')}>Home</Button>
              <Link href="/upload">
                <Button className="bg-red-600 hover:bg-red-700 text-white">
                  Upload
                </Button>
              </Link>
            </div>
          </div>
        </nav>
        <DiscoverView />
      </div>
    );
  }

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
          <div className="inline-block px-4 py-1 border border-red-500/50 rounded-full bg-red-500/10 backdrop-blur-sm mb-4 animate-in fade-in slide-in-from-top-4 duration-700">
            <span className="text-red-400 font-mono text-sm uppercase tracking-widest">Protocol V3 Live on Testnet</span>
          </div>
          <h1 className="text-6xl md:text-8xl font-black tracking-tighter uppercase animate-in fade-in slide-in-from-bottom-8 duration-1000 drop-shadow-2xl">
            Break the <span className="text-red-600 glitch-text">Algorithm</span>
          </h1>
          <p className="text-xl md:text-2xl text-gray-300 max-w-2xl mx-auto font-light drop-shadow-md">
            The era of centralized control is over. Own your content. Own your audience. Own your revenue.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center pt-8">
            <Button
              size="lg"
              className="bg-red-600 text-white hover:bg-red-700 border-none text-lg px-8 py-6 rounded font-bold uppercase tracking-widest transition-all hover:scale-105 shadow-[0_0_20px_rgba(220,38,38,0.5)]"
              onClick={() => setView('discover')}
            >
              Start Watching
            </Button>
            <Link href="/upload">
              <Button size="lg" variant="outline" className="border-white/20 bg-black/50 backdrop-blur text-white hover:bg-white/10 text-lg px-8 py-6 rounded font-bold uppercase tracking-widest hover:border-white transition-all">
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
          <div onClick={() => setView('discover')} className="cursor-pointer">
            <Button size="lg" className="bg-red-600 hover:bg-red-700 text-white text-xl px-12 py-8 rounded-full font-bold shadow-lg shadow-red-900/20 hover:shadow-red-600/40 transition-all">
              Enter App <ArrowRight className="ml-2 w-6 h-6" />
            </Button>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="py-12 bg-zinc-950 border-t border-white/10 text-center text-gray-500">
        <p>&copy; 2024 YouTick Decentralized Platform. Built on NEAR.</p>
      </footer>
    </div>
  );
}
