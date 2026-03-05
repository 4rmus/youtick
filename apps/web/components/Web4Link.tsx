'use client';

import NextLink from 'next/link';
import type { ComponentProps } from 'react';

type LinkProps = ComponentProps<typeof NextLink>;

const isWeb4 = process.env.NEXT_PUBLIC_DEPLOY_TARGET === 'web4';

/**
 * Web4-compatible Link component.
 *
 * Problem: NEAR Web4 gateway returns 400 for Next.js RSC data files (.txt),
 * which breaks client-side (soft) navigation between pages.
 *
 * Solution: In Web4 builds, use standard <a> tags for full page loads.
 * Each page has its own pre-rendered index.html, so MPA navigation works perfectly.
 * In dev/other builds, uses Next.js <Link> with prefetch disabled.
 */
export default function Link({ href, children, prefetch, replace, scroll, ...rest }: LinkProps) {
  if (isWeb4) {
    const hrefStr = typeof href === 'string'
      ? href
      : `${href.pathname || '/'}${href.search || ''}${href.hash || ''}`;
    return <a href={hrefStr} {...rest}>{children}</a>;
  }

  return (
    <NextLink href={href} prefetch={prefetch ?? false} replace={replace} scroll={scroll} {...rest}>
      {children}
    </NextLink>
  );
}
