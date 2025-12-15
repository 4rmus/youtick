import { Github, Layers } from 'lucide-react';
import Link from 'next/link';

export const Footer = () => {
    return (
        <footer className="py-8 px-4 border-t border-white/10 bg-black text-zinc-400">
            <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-6">

                {/* Copyright & Tech Stack */}
                <div className="flex flex-col items-center md:items-start gap-2 text-center md:text-left">
                    <div className="text-sm font-medium text-white">
                        © 2025 youtick. All rights reserved.
                    </div>
                    <div className="text-xs text-zinc-500">
                        Built on <span className="text-zinc-300">NEAR Protocol</span>, <span className="text-zinc-300">Lighthouse Storage</span> & <span className="text-zinc-300">Lit Protocol</span>.
                    </div>
                </div>

                {/* Social/Project Links */}
                <div className="flex items-center gap-6">
                    <a
                        href="https://github.com/4rmus/youtick-mvp"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 text-sm hover:text-white transition-colors"
                    >
                        <Github className="w-4 h-4" />
                        <span>GitHub</span>
                    </a>
                    <a
                        href="https://near.org"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 text-sm hover:text-white transition-colors"
                    >
                        <Layers className="w-4 h-4" />
                        <span>NEAR Protocol</span>
                    </a>
                </div>
            </div>
        </footer>
    );
};
