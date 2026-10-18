import { MetadataRoute } from 'next';
import { headers } from 'next/headers';
import { FEATURE_FLAGS } from '@/lib/constants';
import { PUBLIC_ROOT_PAGES, configuredPublicRootHosts, isPublicRootHost } from '@/lib/public-routes';

const baseUrl = 'https://youtick.net';

/**
 * Root hosts (PUBLIC_ROOT_HOSTS) allow only the public pages; "$" anchors each page so that, for example,
 * "/tr" does not open "/tr/anything". Other hosts keep the earlier rules. Reading the Host header makes
 * this a request-time route, so one host's answer is never cached for another.
 */
export default async function robots(): Promise<MetadataRoute.Robots> {
    const host = (await headers()).get('host');

    if (isPublicRootHost(host, configuredPublicRootHosts())) {
        return {
            rules: {
                userAgent: '*',
                allow: [...PUBLIC_ROOT_PAGES.map((path) => `${path}$`), '/_next/static/', '/brand/', '/favicon.ico$', '/*.webp$'],
                disallow: '/',
            },
            sitemap: `${baseUrl}/sitemap.xml`,
            host: baseUrl,
        };
    }

    if (FEATURE_FLAGS.publicTestnetBeta) {
        return { rules: { userAgent: '*', disallow: '/' }, host: baseUrl };
    }

    return {
        rules: [
            {
                userAgent: '*',
                allow: '/',
                disallow: [
                    '/api/',
                    '/private/',
                    '/*.json$',
                ],
            },
            {
                userAgent: 'Googlebot',
                allow: '/',
            },
            {
                userAgent: 'Bingbot',
                allow: '/',
            },
        ],
        sitemap: `${baseUrl}/sitemap.xml`,
        host: baseUrl,
    };
}
