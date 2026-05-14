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
        { text: 'Public Alpha', link: '/public/alpha-user-guide' },
        { text: 'Quick Start', link: '/quick-start' },
      ],

      sidebar: [
        {
          text: 'Public Alpha',
          items: [
            { text: 'User Guide', link: '/public/alpha-user-guide' },
            { text: 'Architecture Overview', link: '/public/architecture-overview' },
            { text: 'Acceptable Use Policy', link: '/legal/acceptable-use-policy' },
            { text: 'Launch Plan 2026-05', link: '/launch-plan-2026-05' },
          ],
        },
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
            { text: 'Session Keys & Signless', link: '/architecture/session-keys' },
            { text: 'Storage', link: '/architecture/storage' },
            { text: 'Wallet Integration', link: '/architecture/wallet-integration' },
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
          text: 'Operations',
          items: [
            { text: 'Known Issues', link: '/operations/known-issues' },
            { text: 'Mainnet Deploy Runbook', link: '/operations/mainnet-deploy-runbook' },
            { text: 'Release Runbook', link: '/release-runbook' },
            { text: 'Incident: KMS Operator Down', link: '/operations/incident-kms-operator-down' },
            { text: 'Incident: Takedown', link: '/operations/incident-takedown' },
            { text: 'KMS Key Rotation', link: '/kms-key-rotation' },
          ],
        },
        {
          text: 'Decisions (ADR)',
          items: [
            { text: 'ADR-001 Governance Multisig', link: '/adr/adr-001-governance-multisig' },
            { text: 'ADR-002 Timelock Enforcement', link: '/adr/adr-002-timelock-enforcement' },
            { text: 'ADR-003 Session Grant Auth Fix', link: '/adr/adr-003-session-grant-auth-fix' },
            { text: 'ADR-004 KMS URL Trust', link: '/adr/adr-004-kms-url-trust' },
            { text: 'ADR-005 VSS Share Integrity', link: '/adr/adr-005-vss-share-integrity' },
            { text: 'ADR-006 Storage Provider Diversity', link: '/adr/adr-006-storage-provider-diversity' },
            { text: 'ADR-007 Browser Key Hardening', link: '/adr/adr-007-browser-key-hardening' },
            { text: 'ADR-008 Operator Onboarding', link: '/adr/adr-008-operator-onboarding' },
            { text: 'ADR-009 Emergency Takedown & DAO Handover', link: '/adr/adr-009-emergency-takedown-and-dao-handover' },
          ],
        },
        {
          text: 'Project',
          items: [
            { text: 'Overview', link: '/overview' },
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
