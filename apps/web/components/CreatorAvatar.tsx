import { cn } from "@/lib/utils";

type CreatorAvatarSize = "sm" | "md" | "lg";

const sizeClassNames: Record<CreatorAvatarSize, string> = {
    sm: "h-7 w-7 rounded-lg text-[9px]",
    md: "h-9 w-9 rounded-lg text-xs",
    lg: "h-10 w-10 rounded-xl text-xs",
};

const indicatorClassNames: Record<CreatorAvatarSize, string> = {
    sm: "h-2.5 w-2.5",
    md: "h-3 w-3",
    lg: "h-3 w-3",
};

interface CreatorAvatarProps {
    name?: string | null;
    letters?: 1 | 2;
    online?: boolean;
    size?: CreatorAvatarSize;
}

function getInitials(name: string | null | undefined, letters: 1 | 2) {
    const value = name?.trim();

    if (!value) {
        return "??";
    }

    return value.slice(0, letters).toUpperCase();
}

export function CreatorAvatar({
    name,
    letters = 2,
    online = false,
    size = "sm",
}: CreatorAvatarProps) {
    return (
        <div className="relative inline-flex" aria-hidden="true">
            <div
                className={cn(
                    "flex items-center justify-center border border-white/10 bg-zinc-900 font-bold text-near-green",
                    sizeClassNames[size],
                )}
            >
                {getInitials(name, letters)}
            </div>
            {online ? (
                <span
                    className={cn(
                        "absolute -bottom-0.5 -right-0.5 rounded-full border-2 border-zinc-900 bg-near-green",
                        indicatorClassNames[size],
                    )}
                />
            ) : null}
        </div>
    );
}
