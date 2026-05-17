"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Copy, Check, Download, Sparkles } from "lucide-react";
import { useWallet } from "@/components/providers/WalletProvider";
import { createTrialInviteLinks } from "@/lib/gift-service";
import { useLanguage } from "@/components/providers/LanguageContext";

export function TrialInviteGenerator() {
    const { getWallet, accountId } = useWallet();
    const { t } = useLanguage();
    const copy = t.trial_page;
    const [inviteCount, setInviteCount] = useState(5);
    const [ttlHours, setTtlHours] = useState(72);
    const [generating, setGenerating] = useState(false);
    const [links, setLinks] = useState<string[]>([]);
    const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
    const [error, setError] = useState<string | null>(null);

    const handleGenerate = async () => {
        setGenerating(true);
        setError(null);

        try {
            const wallet = await getWallet();
            if (!wallet || !accountId) {
                throw new Error(t.profile_page?.wallet_not_connected || "Wallet not connected");
            }

            const result = await createTrialInviteLinks(
                inviteCount,
                wallet,
                ttlHours > 0 ? ttlHours * 60 * 60 * 1000 : undefined,
            );

            setLinks(result.map((entry) => entry.link));
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : (copy?.trial_invite_failed || "Failed to create guest invites"));
        } finally {
            setGenerating(false);
        }
    };

    const handleCopy = async (link: string, index: number) => {
        await navigator.clipboard.writeText(link);
        setCopiedIndex(index);
        setTimeout(() => setCopiedIndex(null), 2000);
    };

    const handleDownloadCSV = () => {
        const csv = links.map((link, i) => `${i + 1},${link}`).join("\n");
        const blob = new Blob([`No,Link\n${csv}`], { type: "text/csv" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `trial-invites.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    return (
        <div className="p-4 bg-zinc-800/50 border border-zinc-700 rounded-xl space-y-4">
            {links.length === 0 ? (
                <>
                    <div className="space-y-2">
                        <label className="text-sm text-zinc-400">{copy?.invite_count_label || "How many invites?"}</label>
                        <Input
                            type="number"
                            min={1}
                            max={50}
                            value={inviteCount}
                            onChange={(e) => setInviteCount(parseInt(e.target.value) || 1)}
                            className="bg-zinc-900 border-zinc-600 text-white h-11 rounded-xl"
                        />
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm text-zinc-400">{copy?.invite_expiry_label || "Expire after (hours)"}</label>
                        <Input
                            type="number"
                            min={1}
                            max={168}
                            value={ttlHours}
                            onChange={(e) => setTtlHours(parseInt(e.target.value) || 24)}
                            className="bg-zinc-900 border-zinc-600 text-white h-11 rounded-xl"
                        />
                    </div>

                    <div className="p-3 bg-zinc-900/50 border border-zinc-600/50 rounded-lg">
                        <p className="text-sm text-zinc-300">
                            {copy?.guest_invite_note || "Guest invite links open a guest account automatically."}
                        </p>
                    </div>

                    {error && (
                        <p className="text-red-400 text-sm">{error}</p>
                    )}

                    <Button
                        onClick={handleGenerate}
                        disabled={generating || inviteCount < 1}
                        className="w-full h-11 bg-near-green text-near-black hover:bg-near-green/80 font-semibold rounded-xl"
                    >
                        {generating ? (
                            <>
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                {copy?.generating || "Generating..."}
                            </>
                        ) : (
                            <>
                                <Sparkles className="w-4 h-4 mr-2" />
                                {copy?.generate_guest_invites || "Generate Guest Invites"}
                            </>
                        )}
                    </Button>
                </>
            ) : (
                <>
                    <div className="flex items-center gap-2 text-near-green text-sm">
                        <Check className="w-4 h-4" />
                        <span>{links.length} {copy?.guest_invites_created || "guest invites created"}</span>
                    </div>

                    <div className="space-y-2 max-h-48 overflow-y-auto">
                        {links.map((link, index) => (
                            <div
                                key={index}
                                className="flex items-center gap-2 p-2.5 bg-zinc-900/50 rounded-lg border border-zinc-600/50"
                            >
                                <span className="text-zinc-500 text-sm w-6">{index + 1}.</span>
                                <code className="flex-1 text-xs text-zinc-400 truncate">
                                    {link}
                                </code>
                                <button
                                    type="button"
                                    aria-label={copiedIndex === index ? "Guest invite copied" : `Copy guest invite ${index + 1}`}
                                    onClick={() => handleCopy(link, index)}
                                    className="p-1.5 hover:bg-zinc-700 rounded transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-near-green"
                                >
                                    {copiedIndex === index ? (
                                        <Check className="w-4 h-4 text-near-green" />
                                    ) : (
                                        <Copy className="w-4 h-4 text-zinc-400" />
                                    )}
                                </button>
                            </div>
                        ))}
                    </div>

                    <div className="flex gap-2">
                        <Button
                            onClick={handleDownloadCSV}
                            variant="outline"
                            className="flex-1 border-zinc-600 text-zinc-300 hover:bg-zinc-700 rounded-xl"
                        >
                            <Download className="w-4 h-4 mr-2" />
                            {copy?.download_csv || "Download CSV"}
                        </Button>
                        <Button
                            onClick={() => setLinks([])}
                            variant="ghost"
                            className="flex-1 text-zinc-400 hover:text-white"
                        >
                            {copy?.create_more || "Create More"}
                        </Button>
                    </div>
                </>
            )}
        </div>
    );
}
