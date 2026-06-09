import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

interface PageShellProps {
    children: ReactNode;
    className?: string;
}

export function PageShell({ children, className }: PageShellProps) {
    return (
        <div className={cn('container mx-auto min-h-[calc(100vh-4rem)] px-4 py-8 sm:py-10 md:py-12', className)}>
            {children}
        </div>
    );
}
