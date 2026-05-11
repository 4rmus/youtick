'use client';

import React, { useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import {
  getIpfsMediaCandidates,
  getIpfsMediaSourceKey,
  getNextIpfsMediaUrl,
  rememberFailedIpfsMediaUrl,
  rememberSuccessfulIpfsMediaUrl,
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

  return (
    <ResolvedIPFSThumbnail
      key={`${sourceKey}:${fallbackUrl}`}
      url={url}
      alt={alt}
      className={className}
      fallbackUrl={fallbackUrl}
      onLoad={onLoad}
      onError={onError}
      loading={loading}
      sourceKey={sourceKey}
      candidates={candidates.length > 0 ? candidates : [fallbackUrl]}
    />
  );
}

function ResolvedIPFSThumbnail({
  url,
  alt,
  className,
  fallbackUrl,
  onLoad,
  onError,
  loading,
  sourceKey,
  candidates,
}: IPFSThumbnailProps & {
  sourceKey: string;
  candidates: string[];
  alt: string;
  className: string;
  fallbackUrl: string;
  loading: 'lazy' | 'eager';
}) {
  const [imageUrl, setImageUrl] = useState<string>(() => candidates[0] ?? fallbackUrl);
  const failedUrlsRef = useRef(new Set<string>());

  const handleImageError = () => {
    if (imageUrl && imageUrl !== fallbackUrl) {
      failedUrlsRef.current.add(imageUrl);
      rememberFailedIpfsMediaUrl(imageUrl, {
        input: url,
        sourceKey,
        purpose: 'image',
      });
    }

    const localFailed = failedUrlsRef.current;
    const mediaFallback = getNextIpfsMediaUrl(url, {
      currentUrl: imageUrl,
      sourceKey,
      purpose: 'image',
      fallbackUrl,
    });
    const nextCandidate = mediaFallback && !localFailed.has(mediaFallback)
      ? mediaFallback
      : candidates.find((candidate) => (
        candidate !== imageUrl
        && candidate !== fallbackUrl
        && !localFailed.has(candidate)
      ));
    if (nextCandidate) {
      setImageUrl(nextCandidate);
      return;
    }

    onError?.(new Error('Image load failed'));
    setImageUrl(fallbackUrl);
  };

  const handleImageLoad = () => {
    if (imageUrl !== fallbackUrl && !imageUrl.startsWith('blob:')) {
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
