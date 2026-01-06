"use client";

import { Button } from "@/components/ui/button";
import { Clock, ArrowUpRight, X } from "lucide-react";
import { useState } from "react";

interface TrialAccountBannerProps {
    accountId: string;
    daysRemaining?: number;
    onUpgrade?: () => void;
    onDismiss?: () => void;
}

export function TrialAccountBanner({
    accountId,
    daysRemaining = 7,
    onUpgrade,
    onDismiss,
}: TrialAccountBannerProps) {
    const [dismissed, setDismissed] = useState(false);

    if (dismissed) return null;

    const handleDismiss = () => {
        setDismissed(true);
        onDismiss?.();
    };

    const urgencyColor = daysRemaining <= 2
        ? "from-red-500/20 to-red-600/10 border-red-500/30"
        : daysRemaining <= 4
            ? "from-yellow-500/20 to-yellow-600/10 border-yellow-500/30"
            : "from-purple-500/20 to-purple-600/10 border-purple-500/30";

    const textColor = daysRemaining <= 2
        ? "text-red-400"
        : daysRemaining <= 4
            ? "text-yellow-400"
            : "text-purple-400";

    return (
        <div className={`
            relative w-full py-3 px-4 
            bg-gradient-to-r ${urgencyColor}
            border-b backdrop-blur-sm
            flex items-center justify-between
        `}>
            <div className="flex items-center gap-3">
                <div className={`p-1.5 rounded-full bg-gray-800/50 ${textColor}`}>
                    <Clock className="w-4 h-4" />
                </div>
                <div className="text-sm">
                    <span className="text-gray-300">Trial hesap kullanıyorsun</span>
                    <span className={`ml-2 font-medium ${textColor}`}>
                        {daysRemaining} gün kaldı
                    </span>
                </div>
            </div>

            <div className="flex items-center gap-2">
                <Button
                    onClick={onUpgrade}
                    size="sm"
                    className="h-8 bg-white/10 hover:bg-white/20 text-white border-0"
                >
                    Tam Cüzdana Geç
                    <ArrowUpRight className="w-3 h-3 ml-1" />
                </Button>
                <button
                    onClick={handleDismiss}
                    className="p-1.5 text-gray-400 hover:text-white transition-colors"
                >
                    <X className="w-4 h-4" />
                </button>
            </div>
        </div>
    );
}
