'use client';

import { Hero } from "@/components/landing/Hero";
import { Features } from "@/components/landing/Features";
import { UseCases } from "@/components/landing/UseCases";
import { TechStack } from "@/components/landing/TechStack";
import { Roadmap } from "@/components/landing/Roadmap";
import { Footer } from "@/components/landing/Footer";
import { UploadForm } from "@/components/UploadForm";
import { IpfsPlayer } from "@/components/IpfsPlayer";
import { useLanguage } from "@/components/providers/LanguageContext";
import { MintButton } from "@/components/MintButton";

import { useState } from 'react';

export default function Home() {
  const { t } = useLanguage();

  return (
    <div className="flex flex-col min-h-screen bg-white dark:bg-black transition-colors duration-300">
      <Hero />

      <div id="discover">
        <Features />
      </div>

      <UseCases />

      <TechStack />

      <Roadmap />

      <section id="upload" className="py-24 px-4 bg-gray-50 dark:bg-gray-900 text-black dark:text-white transition-colors duration-300">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-4">{t.upload.title}</h2>
            <p className="text-gray-600 dark:text-gray-400">{t.upload.subtitle}</p>
          </div>
          <div className="bg-white dark:bg-black p-8 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800">
            <UploadForm />
          </div>

          <div className="mt-12 text-center">
            <h3 className="text-2xl font-bold mb-4">Watch Decrypted Video (Demo)</h3>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              Enter the CID of an uploaded video to test decryption.
            </p>
            {/* Hardcoded CID for testing or add an input? For now, let's just show the component with a placeholder or input logic if we had time. 
                 Let's add a simple input wrapper here or just render the player if we have a CID. 
                 For this demo, I'll add a temporary state to Home? No, 'page.tsx' is a server/client component mix? 
                 It's 'use client'. So I can add state.
             */}
            <DemoPlayer />
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}

function DemoPlayer() {
  const [cid, setCid] = useState('');
  const [playCid, setPlayCid] = useState('');

  return (
    <div className="max-w-2xl mx-auto">
      <div className="space-y-4">
        <div className="flex gap-2 items-center">
          <input
            type="text"
            placeholder="Enter IPFS CID"
            className="flex-1 p-2 border rounded dark:bg-slate-800 dark:border-slate-700"
            value={cid}
            onChange={(e) => setCid(e.target.value)}
          />
          <button
            onClick={() => setPlayCid(cid)}
            className="px-4 py-2 bg-primary text-white rounded hover:bg-primary/90"
          >
            Load
          </button>
          <MintButton />
        </div>
        <p className="text-xs text-gray-500 text-left">
          * If you get "Access Denied", click "Mint Test NFT" to get access.
        </p>
        {playCid && <IpfsPlayer cid={playCid} />}
      </div>
    </div>
  );
}
