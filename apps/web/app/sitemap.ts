import type { MetadataRoute } from 'next';
import { headers } from 'next/headers';
import { PUBLIC_ROOT_SITEMAP_PATHS, configuredPublicRootHosts, isPublicRootHost } from '@/lib/public-routes';

const baseUrl = 'https://youtick.net';
const ALL_PATHS = ['', '/tr', '/apply', '/tr/apply', '/discover', '/upload', '/profile', '/privacy', '/terms'];

/** Root hosts (PUBLIC_ROOT_HOSTS) list only the public pages; other hosts keep the full list. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
    const host = (await headers()).get('host');
    const paths = isPublicRootHost(host, configuredPublicRootHosts())
        ? PUBLIC_ROOT_SITEMAP_PATHS.map((path) => (path === '/' ? '' : path))
        : ALL_PATHS;
    return paths.map((path) => ({
        url: `${baseUrl}${path}`,
        changeFrequency: path === '/discover' ? 'hourly' : 'weekly',
        priority: path === '' || path === '/tr' ? 1 : 0.7,
    }));
}
