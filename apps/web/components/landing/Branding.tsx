import { memo } from 'react';
import { BRANDING } from '@/lib/constants';

interface BrandingProps {
  size?: 'sm' | 'md' | 'lg';
}

export const Branding = memo(({ size = 'md' }: BrandingProps) => {
  const fontSize = {
    sm: 'text-xl',
    md: 'text-2xl',
    lg: 'text-4xl',
  }[size];

  return (
    <div className={`font-black tracking-tight ${fontSize}`}>
      <span className="text-white">youtick</span>
    </div>
  );
});

Branding.displayName = 'Branding';
