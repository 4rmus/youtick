import type { Metadata } from 'next';
import { FEATURE_FLAGS } from './constants';

/** Metadata shared by the root layouts in `app/(site)` and `app/(tr)`. */
export const siteMetadata: Metadata = {
    title: { default: 'youtick', template: '%s | youtick' },
    description: 'Ticketed digital screenings for independent film and music.',
    metadataBase: new URL('https://youtick.net'),
    robots: FEATURE_FLAGS.publicTestnetBeta ? { index: false, follow: false } : undefined,
};
