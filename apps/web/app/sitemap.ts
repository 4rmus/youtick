import type { MetadataRoute } from 'next';

export const dynamic = 'force-static';

export default function sitemap(): MetadataRoute.Sitemap {
    const baseUrl = 'https://youtick.net';
    return ['', '/tr', '/creators', '/privacy', '/terms'].map((path) => ({
        url: `${baseUrl}${path}`,
        changeFrequency: path === '' ? 'hourly' : 'weekly',
        priority: path === '' || path === '/tr' ? 1 : 0.7,
    }));
}
