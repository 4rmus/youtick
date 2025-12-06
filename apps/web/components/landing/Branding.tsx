import { memo } from 'react';
import { BRANDING } from '@/lib/constants';

interface BrandingProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

const sizeClasses = {
  sm: 'text-xl',
  md: 'text-2xl',
  lg: 'text-3xl',
  xl: 'text-4xl',
} as const;

export const Branding = memo(({ className = '', size = 'md' }: BrandingProps) => {
  return (
    <div className={`${sizeClasses[size]} font-black tracking-tighter ${className}`}>
      <span className={BRANDING.logo.primary}>{BRANDING.name.part1}</span>
      <span className={BRANDING.logo.secondary}>{BRANDING.name.part2}</span>
    </div>
  );
});

Branding.displayName = 'Branding';
