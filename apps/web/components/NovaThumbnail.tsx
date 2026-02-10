'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { parseNovaUrl, isPublicGroup } from '@/lib/nova';
import { isNovaUrl, isIpfsUrl } from '@/lib/nova/types';
import { getGatewayUrl, getGatewayUrls, fetchFromGateways } from '@/lib/crust';

// Module-level cache: store resolved URLs to avoid repeated resolution
const resolvedUrlCache = new Map<string, string>();

interface NovaThumbnailProps {
  /** URL to display - supports nova:// and legacy IPFS URLs */
  url?: string | null;
  /** Alt text for the image */
  alt?: string;
  /** CSS class name */
  className?: string;
  /** Fallback URL if image fails to load */
  fallbackUrl?: string;
  /** Placeholder to show while loading */
  placeholder?: string;
  /** Called when image loads successfully */
  onLoad?: () => void;
  /** Called when image fails to load */
  onError?: (error: Error) => void;
}

/**
 * NovaThumbnail Component
 *
 * Displays thumbnails from both nova:// URLs and legacy IPFS URLs.
 * For nova:// URLs, it auto-joins public groups and fetches/decrypts content.
 * For legacy IPFS URLs, it displays directly via gateway.
 *
 * Features:
 * - Automatic nova:// URL parsing
 * - Public group auto-join
 * - Fallback to IPFS gateway
 * - Loading states
 * - Error handling with graceful degradation
 */
export function NovaThumbnail({
  url,
  alt = 'Thumbnail',
  className = '',
  fallbackUrl = '/placeholder-video.svg',
  placeholder,
  onLoad,
  onError
}: NovaThumbnailProps) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  /**
   * Get display URL from various URL formats
   */
  const resolveUrl = useCallback(async (inputUrl: string): Promise<string> => {
    // Check URL cache first
    const cached = resolvedUrlCache.get(inputUrl);
    if (cached) {
      return cached;
    }

    let resolved: string;

    // Nova URL: nova://{groupId}/{cid}
    if (isNovaUrl(inputUrl)) {
      const parsed = parseNovaUrl(inputUrl);
      if (!parsed) {
        throw new Error('Invalid nova:// URL format');
      }

      // Try Crust POST API first — content is guaranteed available (no propagation delay).
      // Public IPFS gateways may not have newly pinned content yet.
      try {
        const response = await fetchFromGateways(parsed.cid, { timeout: 10_000 });
        const blob = await response.blob();
        if (blob.size > 0) {
          const blobUrl = URL.createObjectURL(blob);
          resolvedUrlCache.set(inputUrl, blobUrl);
          return blobUrl;
        }
      } catch {
        // Crust API and all gateways failed via fetch — fall back to <img> gateway chain
      }

      // Fallback: use public gateway URL for <img src> (browser handles GET natively)
      resolved = getGatewayUrl(parsed.cid);
      resolvedUrlCache.set(inputUrl, resolved);
      return resolved;
    }

    // Legacy IPFS URL or direct URL
    if (isIpfsUrl(inputUrl)) {
      resolvedUrlCache.set(inputUrl, inputUrl);
      return inputUrl;
    }

    // Direct URL (http/https or relative path starting with /)
    const urlStr = inputUrl as string;
    if (urlStr.startsWith('http://') || urlStr.startsWith('https://') || urlStr.startsWith('/')) {
      resolvedUrlCache.set(inputUrl, urlStr);
      return urlStr;
    }

    // Assume it's a CID
    resolved = getGatewayUrl(urlStr);
    resolvedUrlCache.set(inputUrl, resolved);
    return resolved;
  }, []);

  /**
   * Load image from URL
   */
  useEffect(() => {
    if (!url) {
      setImageUrl(fallbackUrl);
      setLoading(false);
      return;
    }

    let cancelled = false;

    const loadImage = async () => {
      setLoading(true);
      setError(null);
      gatewayIndexRef.current = 0;

      try {
        const resolvedUrl = await resolveUrl(url);

        if (cancelled) return;

        setImageUrl(resolvedUrl);
        setLoading(false);
      } catch (err) {
        if (cancelled) return;

        console.error('[NovaThumbnail] Failed to load image:', err);
        const error = err instanceof Error ? err : new Error(String(err));
        setError(error);
        setImageUrl(fallbackUrl);
        setLoading(false);
        onError?.(error);
      }
    };

    loadImage();

    return () => {
      cancelled = true;
    };
  }, [url, fallbackUrl, resolveUrl, onError]);

  // Track gateway fallback attempts per URL
  const gatewayIndexRef = useRef(0);

  /**
   * Handle image load error - try next gateway before giving up
   */
  const handleImageError = useCallback(() => {
    // If this was a gateway URL, try the next one
    if (url && isNovaUrl(url)) {
      const parsed = parseNovaUrl(url);
      if (parsed) {
        const allGateways = getGatewayUrls(parsed.cid);
        gatewayIndexRef.current++;
        if (gatewayIndexRef.current < allGateways.length) {
          const nextUrl = allGateways[gatewayIndexRef.current];
          console.warn(`[NovaThumbnail] Gateway failed, trying next: ${nextUrl}`);
          setImageUrl(nextUrl);
          return;
        }
      }
    }

    console.warn('[NovaThumbnail] All gateways failed, using fallback');
    setImageUrl(fallbackUrl);
    const err = new Error('Image failed to load');
    setError(err);
    onError?.(err);
  }, [url, fallbackUrl, onError]);

  /**
   * Handle successful image load
   */
  const handleImageLoad = useCallback(() => {
    onLoad?.();
  }, [onLoad]);

  // Show placeholder while loading
  if (loading) {
    return (
      <div className={`bg-zinc-800 animate-pulse ${className}`}>
        {placeholder ? (
          <img
            src={placeholder}
            alt="Loading..."
            className="w-full h-full object-cover opacity-50"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <div className="w-8 h-8 border-2 border-zinc-600 border-t-zinc-400 rounded-full animate-spin" />
          </div>
        )}
      </div>
    );
  }

  return (
    <img
      src={imageUrl || fallbackUrl}
      alt={alt}
      className={className}
      loading="lazy"
      onError={handleImageError}
      onLoad={handleImageLoad}
    />
  );
}

/**
 * Helper hook for resolving Nova thumbnail URLs
 */
export function useNovaThumbnailUrl(url: string | null | undefined): {
  resolvedUrl: string | null;
  loading: boolean;
  error: Error | null;
} {
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!url) {
      setResolvedUrl(null);
      setLoading(false);
      return;
    }

    // Nova URL → resolve to gateway URL
    if (isNovaUrl(url)) {
      const parsed = parseNovaUrl(url);
      if (!parsed) {
        setError(new Error('Invalid nova:// URL'));
        setLoading(false);
        return;
      }

      setResolvedUrl(getGatewayUrl(parsed.cid));
      setLoading(false);
      return;
    }

    // IPFS or direct URL
    setResolvedUrl(url);
    setLoading(false);
  }, [url]);

  return { resolvedUrl, loading, error };
}

export default NovaThumbnail;
