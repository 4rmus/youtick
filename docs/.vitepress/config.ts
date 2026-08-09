import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'YouTick Docs',
  description: 'NEAR and Livepeer paid-video architecture',
  base: '/',

  srcExclude: ['README.md'],

  themeConfig: {
    nav: [
      { text: 'Architecture', link: '/architecture/' },
      { text: 'Configuration', link: '/getting-started/configuration' },
      { text: 'Testing', link: '/testing' },
      { text: 'Pilot', link: '/testnet-pilot-runbook' },
      { text: 'Release', link: '/release-runbook' },
    ],

    sidebar: [
      {
        text: 'YouTick',
        items: [
          { text: 'Architecture', link: '/architecture/' },
          { text: 'Configuration', link: '/getting-started/configuration' },
          { text: 'Contract Methods', link: '/api/contract-methods' },
          { text: 'Security', link: '/security' },
          { text: 'Testing', link: '/testing' },
          { text: 'Testnet Pilot', link: '/testnet-pilot-runbook' },
          { text: 'Release', link: '/release-runbook' },
          { text: 'Contributing', link: '/contributing' },
          { text: 'Acceptable Use', link: '/legal/acceptable-use-policy' },
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
      message: 'NEAR source of truth with Livepeer media delivery.',
      copyright: 'YouTick',
    },
  },
})
