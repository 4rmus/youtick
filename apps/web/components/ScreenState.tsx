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
                        'mx-auto mb-5 flex h-14 w-14 items-center justify-center border-2',
                        tone === 'danger' && 'border-alert text-alert',
                        tone === 'success' && 'border-ice text-ice',
                        tone === 'default' && 'border-line-strong text-light-3',
                    )}
                >
                    {icon}
                </div>
            )}
            <h1 className="font-display text-4xl text-light sm:text-5xl">{title}</h1>
            {description && (
                <p className="mx-auto mt-3 max-w-md text-base leading-relaxed text-light-2">
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
