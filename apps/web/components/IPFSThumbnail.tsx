'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import {
  DEFAULT_IPFS_MEDIA_TIMEOUT_MS,
  getIpfsMediaCandidates,
  getIpfsMediaSourceKey,
  getNextIpfsMediaUrl,
  rememberFailedIpfsMediaUrl,
  rememberSuccessfulIpfsMediaUrl,
  resolveIpfsMediaUrl,
} from '@/lib/ipfs-media';

interface IPFSThumbnailProps {
  /** URL to display - supports IPFS CIDs, gateway URLs, and direct URLs */
  url?: string | null;
  /** Alt text for the image */
  alt?: string;
  /** CSS class name */
  className?: string;
  /** Fallback URL if image fails to load */
  fallbackUrl?: string;
  /** Called when image loads successfully */
  onLoad?: () => void;
  /** Called when image fails to load */
  onError?: (error: Error) => void;
  /** Browser loading hint */
  loading?: 'lazy' | 'eager';
  /** Probe timeout before trying the next gateway candidate */
  timeoutMs?: number;
}

/**
 * IPFS thumbnail with latency-aware gateway selection.
 */
export function IPFSThumbnail({
  url,
  alt = 'Thumbnail',
  className = '',
  fallbackUrl = '/placeholder-video.svg',
  onLoad,
  onError,
  loading = 'lazy',
  timeoutMs = DEFAULT_IPFS_MEDIA_TIMEOUT_MS,
}: IPFSThumbnailProps) {
  const sourceKey = getIpfsMediaSourceKey(url);
  const candidates = useMemo(
    () => getIpfsMediaCandidates(url, {
      sourceKey,
      purpose: 'image',
      fallbackUrl,
    }),
    [fallbackUrl, sourceKey, url],
  );
  const [orderedCandidates, setOrderedCandidates] = useState<string[]>(() => candidates.length > 0 ? candidates : [fallbackUrl]);
  const [imageUrl, setImageUrl] = useState<string>(() => candidates[0] ?? fallbackUrl);

  useEffect(() => {
    let cancelled = false;

    async function resolveBestCandidate() {
      const nextFallbackCandidates = getIpfsMediaCandidates(url, {
        sourceKey,
        purpose: 'image',
        fallbackUrl,
      });

      setOrderedCandidates(nextFallbackCandidates);
      setImageUrl(nextFallbackCandidates[0] ?? fallbackUrl);

      if (!url || nextFallbackCandidates.length <= 1) {
        return;
      }

      try {
        const resolvedUrl = await resolveIpfsMediaUrl(url, {
          sourceKey,
          purpose: 'image',
          timeoutMs,
          fallbackUrl,
        });
        if (cancelled) return;

        const nextCandidates = resolvedUrl
          ? [resolvedUrl, ...nextFallbackCandidates.filter((candidate) => candidate !== resolvedUrl)]
          : nextFallbackCandidates;
        setOrderedCandidates(nextCandidates);
        setImageUrl(nextCandidates[0] ?? fallbackUrl);
      } catch {
        if (cancelled) return;
        setOrderedCandidates([fallbackUrl]);
        setImageUrl(fallbackUrl);
        onError?.(new Error('All gateways failed'));
      }
    }

    void resolveBestCandidate();

    return () => {
      cancelled = true;
    };
  }, [fallbackUrl, onError, sourceKey, timeoutMs, url]);

  const handleImageError = () => {
    if (imageUrl && imageUrl !== fallbackUrl) {
      rememberFailedIpfsMediaUrl(imageUrl, {
        input: url,
        sourceKey,
        purpose: 'image',
      });
    }

    const nextCandidate = getNextIpfsMediaUrl(url, {
      currentUrl: imageUrl,
      sourceKey,
      purpose: 'image',
      fallbackUrl,
    }) ?? orderedCandidates.find((candidate) => candidate !== imageUrl && candidate !== fallbackUrl);
    if (nextCandidate) {
      setImageUrl(nextCandidate);
      return;
    }

    onError?.(new Error('Image load failed'));
    setImageUrl(fallbackUrl);
  };

  const handleImageLoad = () => {
    if (imageUrl !== fallbackUrl) {
      rememberSuccessfulIpfsMediaUrl(imageUrl, {
        sourceKey,
        purpose: 'image',
      });
    }
    onLoad?.();
  };

  return (
    <span className="contents">
      <Image
        src={imageUrl}
        alt={alt}
        className={className}
        width={1600}
        height={900}
        sizes="100vw"
        unoptimized
        loading={loading}
        onError={handleImageError}
        onLoad={handleImageLoad}
      />
    </span>
  );
}
