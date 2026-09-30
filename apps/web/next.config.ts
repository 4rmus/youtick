import type { NextConfig } from 'next';

/** Same shape as lib/livepeer-publication JOB_ID_PATTERN; anything else stays on /watch. */
const JOB_ID = '[A-Za-z0-9._:-]{1,128}';

const nextConfig: NextConfig = {
    images: { unoptimized: true },
    poweredByHeader: false,
    // Sahne routes. Query strings are passed through, so /upload?job=X keeps its job on /studio/new.
    async redirects() {
        return [
            { source: '/watch', has: [{ type: 'query', key: 'job', value: `(?<job>${JOB_ID})` }], destination: '/s/:job', permanent: true },
            { source: '/discover', destination: '/', permanent: true },
            { source: '/upload', destination: '/studio/new', permanent: true },
            { source: '/profile', destination: '/studio', permanent: true },
        ];
    },
};

export default nextConfig;
