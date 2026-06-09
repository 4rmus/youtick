import type { ReactNode } from 'react';

import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface ScreenStateProps {
    icon?: ReactNode;
    title: string;
    description?: string;
    actions?: ReactNode;
    children?: ReactNode;
    className?: string;
    tone?: 'default' | 'danger' | 'success';
}

export function ScreenState({
    icon,
    title,
    description,
    actions,
    children,
    className,
    tone = 'default',
}: ScreenStateProps) {
    return (
        <Card className={cn('mx-auto w-full max-w-xl p-7 text-center sm:p-8', className)}>
            {icon && (
                <div
                    className={cn(
                        'mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-lg border bg-white/[0.04]',
                        tone === 'danger' && 'border-near-red/30 bg-near-red/10 text-near-red',
                        tone === 'success' && 'border-near-green/30 bg-near-green/10 text-near-green',
                        tone === 'default' && 'border-white/10 text-zinc-500',
                    )}
                >
                    {icon}
                </div>
            )}
            <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">{title}</h1>
            {description && (
                <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-zinc-400">
                    {description}
                </p>
            )}
            {children && <div className="mt-5">{children}</div>}
            {actions && (
                <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
                    {actions}
                </div>
            )}
        </Card>
    );
}
