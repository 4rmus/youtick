import { MetadataRoute } from 'next';
import { FEATURE_FLAGS } from '@/lib/constants';

export const dynamic = 'force-static';

export default function robots(): MetadataRoute.Robots {
    const baseUrl = 'https://youtick.net';

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
