import { cn } from '@/lib/utils';

interface BrandWordmarkProps {
    className?: string;
}

export function BrandWordmark({ className }: BrandWordmarkProps) {
    return <span className={cn('font-brand font-bold tracking-[-0.03em]', className)}>youtick</span>;
}
