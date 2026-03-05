import { MetadataRoute } from 'next';

export const dynamic = 'force-static';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
    const baseUrl = 'https://youtick.net';

    // Static pages
    const staticPages: MetadataRoute.Sitemap = [
        {
            url: baseUrl,
            lastModified: new Date(),
            changeFrequency: 'daily',
            priority: 1,
        },
        {
            url: `${baseUrl}/discover`,
            lastModified: new Date(),
            changeFrequency: 'hourly',
            priority: 0.9,
        },
        {
            url: `${baseUrl}/upload`,
            lastModified: new Date(),
            changeFrequency: 'monthly',
            priority: 0.7,
        },
        {
            url: `${baseUrl}/profile`,
            lastModified: new Date(),
            changeFrequency: 'daily',
            priority: 0.8,
        },
    ];

    // Dynamic event pages - fetch from contract if in production
    const eventPages: MetadataRoute.Sitemap = [];

    try {
        // In production, you would fetch events from the NEAR contract
        // For now, we'll return static pages only
        // Uncomment and adapt this when ready:
        /*
        const rpcUrl = NEAR_CONFIG.networkId === 'mainnet' ? 'https://rpc.mainnet.near.org' : 'https://rpc.testnet.near.org';
        const response = await fetch(rpcUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: 'dontcare',
                method: 'query',
                params: {
                    request_type: 'call_function',
                    finality: 'final',
                    account_id: CONTRACT_ID,
                    method_name: 'get_all_events',
                    args_base64: btoa(JSON.stringify({})),
                },
            }),
        });
        
        const data = await response.json();
        const events = JSON.parse(Buffer.from(data.result.result).toString());
        
        eventPages = events.map((event: { encrypted_cid: string }) => ({
            url: `${baseUrl}/watch/${event.encrypted_cid}`,
            lastModified: new Date(),
            changeFrequency: 'weekly' as const,
            priority: 0.6,
        }));
        */
    } catch (error) {
        console.error('Error fetching events for sitemap:', error);
    }

    return [...staticPages, ...eventPages];
}
