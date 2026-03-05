import { defineConfig } from 'vitepress'
import { withMermaid } from 'vitepress-plugin-mermaid'

export default withMermaid(
  defineConfig({
    title: 'YouTick Docs',
    description: 'Decentralized Video-on-Demand Platform on NEAR Protocol',
    base: '/',

    head: [
      ['link', { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' }],
    ],

    ignoreDeadLinks: [
      /localhost/,
    ],

    themeConfig: {
      nav: [
        { text: 'Getting Started', link: '/getting-started/prerequisites' },
        { text: 'Architecture', link: '/architecture/' },
        { text: 'API', link: '/api/contract-methods' },
        { text: 'Guides', link: '/guides/user-flows' },
      ],

      sidebar: [
        {
          text: 'Getting Started',
          items: [
            { text: 'Prerequisites', link: '/getting-started/prerequisites' },
            { text: 'Installation', link: '/getting-started/installation' },
            { text: 'Configuration', link: '/getting-started/configuration' },
            { text: 'Quick Start', link: '/quick-start' },
          ],
        },
        {
          text: 'Architecture',
          items: [
            { text: 'System Architecture', link: '/architecture/' },
            { text: 'Smart Contract', link: '/architecture/smart-contract' },
            { text: 'Session Keys', link: '/architecture/session-keys' },
            { text: 'Storage', link: '/architecture/storage' },
            { text: 'Innovations', link: '/architecture/innovations' },
          ],
        },
        {
          text: 'API Reference',
          items: [
            { text: 'Contract Methods', link: '/api/contract-methods' },
          ],
        },
        {
          text: 'Guides',
          items: [
            { text: 'User Flows', link: '/guides/user-flows' },
            { text: 'Developer Guide', link: '/guides/developer-guide' },
            { text: 'Environment', link: '/guides/environment' },
          ],
        },
        {
          text: 'Project',
          items: [
            { text: 'Overview', link: '/overview' },
            { text: 'Roadmap', link: '/roadmap' },
            { text: 'Security', link: '/security' },
            { text: 'Testing', link: '/testing' },
            { text: 'Contributing', link: '/contributing' },
            { text: 'Frontend', link: '/frontend' },
          ],
        },
      ],

      socialLinks: [
        { icon: 'github', link: 'https://github.com/4rmus/youtick' },
      ],

      search: {
        provider: 'local',
      },

      footer: {
        message: 'Built on NEAR Protocol with KMS-backed client-side encryption.',
        copyright: 'YouTick - Decentralized Video-on-Demand',
      },
    },
  })
)
