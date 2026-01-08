'use client';

import { memo } from 'react';

interface BuiltOnNEARBadgeProps {
    variant?: 'light' | 'dark';
    size?: 'sm' | 'md' | 'lg';
    showLink?: boolean;
}

/**
 * Official "Built on NEAR" badge component following NEAR Protocol brand guidelines.
 * @see https://pages.near.org/about/brand/#h-built-on-near
 */
export const BuiltOnNEARBadge = memo(({
    variant = 'dark',
    size = 'md',
    showLink = true,
}: BuiltOnNEARBadgeProps) => {
    const sizeClasses = {
        sm: 'h-6',
        md: 'h-8',
        lg: 'h-10',
    };

    const badge = (
        <div className={`inline-flex items-center gap-2 ${sizeClasses[size]}`}>
            {/* NEAR Logo Icon */}
            <svg
                viewBox="0 0 90 90"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                className={`${sizeClasses[size]} aspect-square`}
            >
                <path
                    d="M72.2 4.6L53.4 32.5C52.2 34.3 54.6 36.4 56.3 34.9L74.8 18.7C75.4 18.2 76.3 18.6 76.3 19.4V70.1C76.3 70.9 75.3 71.3 74.7 70.7L18.3 5.3C16.3 2.9 13.4 1.5 10.2 1.5H8.2C3.7 1.5 0 5.2 0 9.8V80.2C0 84.8 3.7 88.5 8.2 88.5C11.1 88.5 13.8 87 15.5 84.6L34.3 56.7C35.5 54.9 33.1 52.8 31.4 54.3L12.9 70.5C12.3 71 11.4 70.6 11.4 69.8V19.1C11.4 18.3 12.4 17.9 13 18.5L69.4 83.9C71.4 86.3 74.3 87.7 77.5 87.7H79.5C84 87.7 87.7 84 87.7 79.4V9.8C87.7 5.2 84 1.5 79.5 1.5C76.6 1.5 73.9 3 72.2 5.4V4.6Z"
                    fill={variant === 'dark' ? '#FFFFFF' : '#000000'}
                />
            </svg>

            {/* Built on NEAR Text */}
            <div className="flex flex-col leading-none">
                <span
                    className={`text-[10px] font-medium tracking-wider uppercase ${variant === 'dark' ? 'text-zinc-400' : 'text-zinc-600'
                        }`}
                >
                    Built on
                </span>
                <span
                    className={`text-sm font-bold tracking-tight ${variant === 'dark' ? 'text-white' : 'text-black'
                        }`}
                >
                    NEAR
                </span>
            </div>
        </div>
    );

    if (showLink) {
        return (
            <a
                href="https://near.org"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block hover:opacity-80 transition-opacity"
                title="Built on NEAR Protocol"
            >
                {badge}
            </a>
        );
    }

    return badge;
});

BuiltOnNEARBadge.displayName = 'BuiltOnNEARBadge';
