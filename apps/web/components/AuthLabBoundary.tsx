'use client';

import type { PropsWithChildren, ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { NEAR_AUTH_LAB_PATH } from '@/lib/near-auth-lab';

// UI isolation only; the lab's server page still enforces the closed gate.
export function AuthLabBoundary({ children, lab }: PropsWithChildren<{ lab: ReactNode }>) {
    return usePathname() === NEAR_AUTH_LAB_PATH ? <main>{lab}</main> : children;
}
