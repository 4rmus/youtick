import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service | YouTick",
  description: "YouTick Terms of Service - Digital ticketed releases on NEAR Protocol",
};

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-gray-950 text-gray-200">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <h1 className="text-4xl font-bold text-white mb-2">Terms of Service</h1>
        <p className="text-gray-400 mb-12">Last Updated: February 15, 2026</p>

        <div className="space-y-10 text-gray-300 leading-relaxed">
          {/* 1. ACCEPTANCE */}
          <section>
            <h2 className="text-2xl font-semibold text-white mb-4">1. Acceptance of Terms</h2>
            <p>
              By accessing or using YouTick (&quot;Platform&quot;, &quot;Service&quot;), a digital ticketed
              release platform built on the NEAR Protocol blockchain, you agree to be bound by
              these Terms of Service (&quot;Terms&quot;). If you do not agree to these Terms, do not use
              the Platform.
            </p>
            <p className="mt-3">
              These Terms constitute a legally binding agreement between you (&quot;User&quot;,
              &quot;you&quot;, &quot;your&quot;) and YouTick (&quot;we&quot;, &quot;us&quot;, &quot;our&quot;).
              By connecting a blockchain wallet, creating a trial account, uploading content, purchasing
              tickets, or otherwise interacting with the Platform, you acknowledge that you have read,
              understood, and agree to these Terms.
            </p>
          </section>

          {/* 2. PLATFORM DESCRIPTION */}
          <section>
            <h2 className="text-2xl font-semibold text-white mb-4">2. Platform Description</h2>
            <p>
              YouTick enables film teams, musicians, venues, and cultural creators to publish and
              monetize digital releases with ticket-based access. The Platform uses a hybrid
              public-alpha architecture:
            </p>
            <ul className="list-disc list-inside mt-3 space-y-2 ml-4">
              <li>
                <strong className="text-white">NEAR Protocol</strong>: Smart contract-based NFT ticketing,
                payment processing, and account management
              </li>
              <li>
                <strong className="text-white">KMS Operators</strong>: Serverless edge workers that
                store encrypted playback key shares and check ticket-based access
              </li>
              <li>
                <strong className="text-white">IPFS / Crust</strong>: Storage and gateway delivery
                for encrypted release files
              </li>
              <li>
                <strong className="text-white">NFT Tickets (NEP-171)</strong>: Non-fungible token standard
                for video access rights and ownership verification
              </li>
            </ul>
            <p className="mt-3">
              The Platform follows a client-side and serverless edge architecture. Media encryption,
              wallet interactions, and transaction signing occur in your browser; serverless edge
              components support KMS and Web4/proxy duties. YouTick does not operate a traditional
              media server for playback.
            </p>
          </section>

          {/* 3. ELIGIBILITY */}
          <section>
            <h2 className="text-2xl font-semibold text-white mb-4">3. Eligibility</h2>
            <p>You must meet the following requirements to use the Platform:</p>
            <ul className="list-disc list-inside mt-3 space-y-2 ml-4">
              <li>You must be at least 18 years of age or the age of majority in your jurisdiction</li>
              <li>You must have legal capacity to enter into a binding agreement</li>
              <li>You must not be located in any jurisdiction where the use of blockchain-based services or cryptocurrency is prohibited</li>
              <li>You must comply with all applicable laws and regulations in your jurisdiction, including but not limited to securities laws, tax obligations, and intellectual property laws</li>
            </ul>
          </section>

          {/* 4. ACCOUNTS AND WALLETS */}
          <section>
            <h2 className="text-2xl font-semibold text-white mb-4">4. Accounts and Wallets</h2>

            <h3 className="text-lg font-medium text-white mt-6 mb-3">4.1 Wallet Connection</h3>
            <p>
              Access to the Platform requires connecting a compatible NEAR Protocol wallet (e.g.,
              MyNearWallet, Meteor Wallet). You are solely responsible for maintaining the security of
              your wallet credentials, private keys, and seed phrases. YouTick never has access to your
              private keys.
            </p>

            <h3 className="text-lg font-medium text-white mt-6 mb-3">4.2 Trial Accounts</h3>
            <p>
              YouTick offers sponsored trial accounts that allow new users to experience the Platform
              without an existing NEAR wallet. Trial accounts are subject to the following conditions:
            </p>
            <ul className="list-disc list-inside mt-2 space-y-1 ml-4">
              <li>Limited to 3 trial accounts per IP address per day</li>
              <li>Subject to a global daily creation limit</li>
              <li>Trial accounts are full NEAR accounts with restricted access keys</li>
              <li>You are responsible for securing the generated credentials</li>
              <li>YouTick reserves the right to limit or suspend trial account creation</li>
            </ul>

            <h3 className="text-lg font-medium text-white mt-6 mb-3">4.3 Session Keys</h3>
            <p>
              The Platform uses NEAR Protocol session keys to provide a signless user experience. Session
              keys are function call access keys with limited permissions and allowance (capped at 0.25
              NEAR). Session keys are cached locally in your browser for up to 24 hours and are automatically
              removed when expired or invalidated.
            </p>

            <h3 className="text-lg font-medium text-white mt-6 mb-3">4.4 Account Security</h3>
            <p>
              You are solely responsible for all activities conducted through your account or wallet.
              YouTick is not responsible for any loss or damage arising from unauthorized access to your
              wallet, private keys, or session keys. You agree to immediately take necessary precautions
              if you suspect unauthorized use of your account.
            </p>
          </section>

          {/* 5. CONTENT AND CREATOR OBLIGATIONS */}
          <section>
            <h2 className="text-2xl font-semibold text-white mb-4">5. Content and Creator Obligations</h2>

            <h3 className="text-lg font-medium text-white mt-6 mb-3">5.1 Content Upload</h3>
            <p>
              By uploading content to the Platform, you (&quot;Creator&quot;) represent and warrant that:
            </p>
            <ul className="list-disc list-inside mt-2 space-y-1 ml-4">
              <li>You own or have all necessary rights, licenses, and permissions to the content</li>
              <li>Your content does not infringe upon any third party&apos;s intellectual property, privacy, publicity, or other rights</li>
              <li>Your content does not violate any applicable laws or regulations</li>
              <li>Your content does not contain illegal, defamatory, obscene, or harmful material</li>
              <li>You have obtained all necessary consents from any individuals appearing in the content</li>
            </ul>

            <h3 className="text-lg font-medium text-white mt-6 mb-3">5.2 Content Storage</h3>
            <p>
              Paid uploaded content is encrypted in the browser and stored through IPFS/Crust in
              encrypted form. Blockchain records are public and may be permanent; IPFS content is
              content-addressed and may remain available while pinned or replicated. Creators should
              carefully consider this publication model before uploading.
            </p>

            <h3 className="text-lg font-medium text-white mt-6 mb-3">5.3 Content Licensing</h3>
            <p>
              By uploading content, you grant YouTick a non-exclusive, worldwide license to facilitate
              the distribution and display of your content through the Platform&apos;s decentralized
              infrastructure. You retain full ownership of your content. This license is limited to
              enabling the technical functionality of the Platform (encryption, storage, distribution,
              and playback).
            </p>

            <h3 className="text-lg font-medium text-white mt-6 mb-3">5.4 Prohibited Content</h3>
            <p>The following types of content are strictly prohibited:</p>
            <ul className="list-disc list-inside mt-2 space-y-1 ml-4">
              <li>Content that infringes intellectual property rights</li>
              <li>Sexually exploitative content involving minors</li>
              <li>Content promoting terrorism, violence, or hate speech</li>
              <li>Malware, phishing, or other harmful software</li>
              <li>Content that violates applicable laws or regulations</li>
              <li>Fraudulent or deceptive content</li>
              <li>Content that violates the privacy or publicity rights of others</li>
            </ul>
            <p className="mt-3">
              Due to the decentralized nature of the Platform, content moderation is limited. However,
              YouTick reserves the right to restrict access to content through the Platform&apos;s
              frontend interface. Content stored on IPFS and the blockchain may remain accessible
              through other means.
            </p>
          </section>

          {/* 6. PAYMENTS AND TRANSACTIONS */}
          <section>
            <h2 className="text-2xl font-semibold text-white mb-4">6. Payments and Transactions</h2>

            <h3 className="text-lg font-medium text-white mt-6 mb-3">6.1 Ticket Purchases</h3>
            <p>
              Video access is granted through NFT ticket purchases executed on the NEAR Protocol
              blockchain. By purchasing a ticket, you agree to the following:
            </p>
            <ul className="list-disc list-inside mt-2 space-y-1 ml-4">
              <li>Prices are set by content creators and denominated in NEAR tokens</li>
              <li>All transactions are final and non-refundable once confirmed on the blockchain</li>
              <li>A 2% platform commission is automatically deducted; 98% goes directly to the creator</li>
              <li>Additional storage deposits (approximately 0.01 NEAR) may apply for NFT minting</li>
              <li>Transaction fees (gas) are borne by the purchaser</li>
            </ul>

            <h3 className="text-lg font-medium text-white mt-6 mb-3">6.2 Payment Methods</h3>
            <p>The Platform supports the following payment methods:</p>
            <ul className="list-disc list-inside mt-2 space-y-1 ml-4">
              <li><strong className="text-white">NEAR Tokens</strong>: Direct payment using NEAR wallet</li>
              <li><strong className="text-white">Prepaid Balance</strong>: Pre-deposited NEAR balance for signless purchases</li>
              <li><strong className="text-white">EVM Stablecoins</strong>: USDC and USDT payments via Defuse Protocol (cross-chain swap)</li>
              <li><strong className="text-white">Gift Links</strong>: Pre-purchased access distributed via shareable links</li>
            </ul>

            <h3 className="text-lg font-medium text-white mt-6 mb-3">6.3 Stablecoin Payments</h3>
            <p>
              When using EVM stablecoin payments (USDC, USDT), your tokens are swapped to NEAR through
              the Defuse Protocol&apos;s 1Click service. By using this feature, you acknowledge:
            </p>
            <ul className="list-disc list-inside mt-2 space-y-1 ml-4">
              <li>Swap rates are determined by market conditions and may include slippage</li>
              <li>Cross-chain transactions involve additional processing time</li>
              <li>YouTick is not responsible for swap execution delays or rate fluctuations</li>
              <li>Your EVM wallet address may be visible to the Defuse Protocol</li>
            </ul>

            <h3 className="text-lg font-medium text-white mt-6 mb-3">6.4 Prepaid Balance</h3>
            <p>
              Users may deposit NEAR tokens into a prepaid balance for simplified purchasing. Prepaid
              withdrawals are limited to 0.1 NEAR per transaction for security purposes. Prepaid
              balances are non-transferable and may be subject to minimum balance requirements.
            </p>

            <h3 className="text-lg font-medium text-white mt-6 mb-3">6.5 Gift Drops</h3>
            <p>
              Creators may generate gift links that allow recipients to claim video access. Gift links
              contain cryptographic access keys and should be treated as bearer instruments. Anyone with
              access to a gift link URL can claim the associated ticket. YouTick is not responsible for
              unauthorized sharing or use of gift links.
            </p>

            <h3 className="text-lg font-medium text-white mt-6 mb-3">6.6 No Refunds</h3>
            <p>
              All blockchain transactions are final and irreversible. YouTick cannot reverse, cancel,
              or refund any completed transaction. This is an inherent characteristic of blockchain
              technology and not a policy choice. You are responsible for verifying all transaction
              details before confirmation.
            </p>
          </section>

          {/* 7. NFT OWNERSHIP AND ACCESS */}
          <section>
            <h2 className="text-2xl font-semibold text-white mb-4">7. NFT Ownership and Access Rights</h2>
            <p>
              Each purchased ticket is represented as a Non-Fungible Token (NFT) compliant with the
              NEP-171 standard on the NEAR Protocol. NFT ownership grants you:
            </p>
            <ul className="list-disc list-inside mt-3 space-y-2 ml-4">
              <li>The right to access and view the associated encrypted video content</li>
              <li>Membership in the corresponding KMS access group</li>
              <li>Proof of purchase recorded immutably on the blockchain</li>
            </ul>
            <p className="mt-3">
              NFT ownership does <strong className="text-white">not</strong> grant:
            </p>
            <ul className="list-disc list-inside mt-2 space-y-1 ml-4">
              <li>Copyright or intellectual property rights to the content</li>
              <li>The right to redistribute, sublicense, or commercially exploit the content</li>
              <li>Any ownership stake in the Platform or its operations</li>
              <li>Guaranteed future value or appreciation of the NFT</li>
            </ul>
          </section>

          {/* 8. DECENTRALIZATION DISCLAIMERS */}
          <section>
            <h2 className="text-2xl font-semibold text-white mb-4">8. Decentralization and Blockchain Disclaimers</h2>

            <h3 className="text-lg font-medium text-white mt-6 mb-3">8.1 Blockchain Immutability</h3>
            <p>
              All transactions, NFT records, and event metadata recorded on the NEAR Protocol blockchain
              are permanent and immutable. Once confirmed, data cannot be modified, deleted, or reversed.
              This includes, but is not limited to:
            </p>
            <ul className="list-disc list-inside mt-2 space-y-1 ml-4">
              <li>Purchase history and transaction records</li>
              <li>NFT ownership transfers</li>
              <li>Event creation metadata (title, price, CID references)</li>
              <li>Smart contract interactions and logs</li>
            </ul>

            <h3 className="text-lg font-medium text-white mt-6 mb-3">8.2 Smart Contract Risks</h3>
            <p>
              The Platform relies on smart contracts deployed on the NEAR Protocol. While these contracts
              have been designed with care, smart contracts may contain bugs, vulnerabilities, or
              unexpected behaviors. You acknowledge and accept that:
            </p>
            <ul className="list-disc list-inside mt-2 space-y-1 ml-4">
              <li>Smart contracts operate autonomously and may not be modifiable once deployed</li>
              <li>Interactions with smart contracts are at your own risk</li>
              <li>YouTick is not liable for losses resulting from smart contract errors or exploits</li>
              <li>Blockchain network congestion may affect transaction processing times</li>
            </ul>

            <h3 className="text-lg font-medium text-white mt-6 mb-3">8.3 Hybrid Serverless Infrastructure</h3>
            <p>
              The Platform depends on third-party infrastructure including NEAR Protocol, IPFS/Crust,
              wallet providers, RPC providers, and serverless edge KMS operators. YouTick does not
              guarantee the availability, performance, or security of these underlying services.
            </p>

            <h3 className="text-lg font-medium text-white mt-6 mb-3">8.4 Token Volatility</h3>
            <p>
              NEAR tokens and other cryptocurrencies are subject to significant price volatility. The
              value of tickets, prepaid balances, and creator earnings may fluctuate based on market
              conditions. YouTick is not responsible for any financial losses resulting from
              cryptocurrency price changes.
            </p>
          </section>

          {/* 9. INTELLECTUAL PROPERTY */}
          <section>
            <h2 className="text-2xl font-semibold text-white mb-4">9. Intellectual Property</h2>
            <p>
              The Platform&apos;s frontend interface, branding, design, and proprietary code are owned
              by YouTick and protected by applicable intellectual property laws. The smart contract
              source code deployed on the NEAR Protocol may be open source and subject to its own
              licensing terms.
            </p>
            <p className="mt-3">
              Content uploaded by creators remains the intellectual property of the respective creators.
              YouTick does not claim ownership over user-generated content.
            </p>
          </section>

          {/* 10. PROHIBITED ACTIVITIES */}
          <section>
            <h2 className="text-2xl font-semibold text-white mb-4">10. Prohibited Activities</h2>
            <p>You agree not to:</p>
            <ul className="list-disc list-inside mt-3 space-y-2 ml-4">
              <li>Attempt to circumvent encryption, access control, or payment mechanisms</li>
              <li>Exploit smart contract vulnerabilities for unauthorized gain</li>
              <li>Use the Platform for money laundering, fraud, or illegal activities</li>
              <li>Abuse trial account creation mechanisms (e.g., creating multiple accounts to bypass rate limits)</li>
              <li>Interfere with or disrupt the Platform&apos;s infrastructure or other users&apos; experience</li>
              <li>Scrape, crawl, or harvest data from the Platform without permission</li>
              <li>Impersonate other users, creators, or YouTick personnel</li>
              <li>Use automated systems (bots) to interact with the Platform without authorization</li>
              <li>Redistribute, share, or make available encrypted content outside the Platform</li>
              <li>Attempt to extract or decrypt content without valid access rights</li>
            </ul>
          </section>

          {/* 11. LIMITATION OF LIABILITY */}
          <section>
            <h2 className="text-2xl font-semibold text-white mb-4">11. Limitation of Liability</h2>
            <p>
              TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, YOUTICK AND ITS AFFILIATES, OFFICERS,
              DIRECTORS, EMPLOYEES, AND AGENTS SHALL NOT BE LIABLE FOR:
            </p>
            <ul className="list-disc list-inside mt-3 space-y-2 ml-4">
              <li>Any indirect, incidental, special, consequential, or punitive damages</li>
              <li>Loss of profits, revenue, data, or digital assets</li>
              <li>Loss of or unauthorized access to wallet credentials or private keys</li>
              <li>Smart contract bugs, exploits, or unexpected behavior</li>
              <li>Blockchain network failures, congestion, or downtime</li>
              <li>IPFS storage unavailability or data loss</li>
              <li>KMS encryption failures or key management issues</li>
              <li>Third-party service outages (wallets, RPC providers, IPFS gateways)</li>
              <li>Cryptocurrency price fluctuations or financial losses</li>
              <li>Actions of other users on the Platform</li>
              <li>Regulatory changes affecting blockchain technology or cryptocurrency</li>
            </ul>
            <p className="mt-3">
              THE PLATFORM IS PROVIDED &quot;AS IS&quot; AND &quot;AS AVAILABLE&quot; WITHOUT WARRANTIES
              OF ANY KIND, WHETHER EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO IMPLIED WARRANTIES
              OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT.
            </p>
          </section>

          {/* 12. INDEMNIFICATION */}
          <section>
            <h2 className="text-2xl font-semibold text-white mb-4">12. Indemnification</h2>
            <p>
              You agree to indemnify, defend, and hold harmless YouTick and its affiliates from and
              against any claims, liabilities, damages, losses, and expenses (including reasonable
              legal fees) arising out of or in any way connected with:
            </p>
            <ul className="list-disc list-inside mt-3 space-y-2 ml-4">
              <li>Your access to or use of the Platform</li>
              <li>Your violation of these Terms</li>
              <li>Your violation of any third-party rights, including intellectual property rights</li>
              <li>Content you upload or distribute through the Platform</li>
              <li>Your blockchain transactions and smart contract interactions</li>
            </ul>
          </section>

          {/* 13. DISPUTE RESOLUTION */}
          <section>
            <h2 className="text-2xl font-semibold text-white mb-4">13. Dispute Resolution</h2>
            <p>
              Any dispute arising out of or relating to these Terms or the Platform shall be resolved
              through the following process:
            </p>
            <ol className="list-decimal list-inside mt-3 space-y-2 ml-4">
              <li><strong className="text-white">Informal Resolution</strong>: The parties shall first attempt to resolve the dispute informally through good-faith negotiation for a period of 30 days</li>
              <li><strong className="text-white">Mediation</strong>: If informal resolution fails, the parties may agree to mediation</li>
              <li><strong className="text-white">Arbitration</strong>: Unresolved disputes shall be settled by binding arbitration in accordance with applicable rules</li>
            </ol>
            <p className="mt-3">
              You agree to waive any right to a jury trial and to participate in class action
              lawsuits related to the Platform, to the extent permitted by law.
            </p>
          </section>

          {/* 14. MODIFICATIONS */}
          <section>
            <h2 className="text-2xl font-semibold text-white mb-4">14. Modifications to Terms</h2>
            <p>
              YouTick reserves the right to modify these Terms at any time. Changes will be effective
              upon posting to the Platform. Your continued use of the Platform after any changes
              constitutes acceptance of the modified Terms. We encourage you to review these Terms
              periodically.
            </p>
          </section>

          {/* 15. TERMINATION */}
          <section>
            <h2 className="text-2xl font-semibold text-white mb-4">15. Termination</h2>
            <p>
              YouTick may restrict or suspend access to the Platform&apos;s frontend interface at any
              time for violation of these Terms. Due to the decentralized nature of the blockchain,
              your on-chain assets (NFTs, account balances) remain accessible through other interfaces
              or direct smart contract interaction regardless of any frontend restrictions.
            </p>
            <p className="mt-3">
              You may discontinue use of the Platform at any time by disconnecting your wallet. Your
              on-chain data and NFTs will persist on the blockchain.
            </p>
          </section>

          {/* 16. GOVERNING LAW */}
          <section>
            <h2 className="text-2xl font-semibold text-white mb-4">16. Governing Law</h2>
            <p>
              These Terms shall be governed by and construed in accordance with applicable laws, without
              regard to conflict of law principles. The decentralized nature of the Platform may affect
              jurisdictional determinations.
            </p>
          </section>

          {/* 17. SEVERABILITY */}
          <section>
            <h2 className="text-2xl font-semibold text-white mb-4">17. Severability</h2>
            <p>
              If any provision of these Terms is found to be unenforceable or invalid, that provision
              shall be limited or eliminated to the minimum extent necessary, and the remaining
              provisions shall remain in full force and effect.
            </p>
          </section>

          {/* 18. CONTACT */}
          <section>
            <h2 className="text-2xl font-semibold text-white mb-4">18. Contact Information</h2>
            <p>
              For questions or concerns regarding these Terms, please contact us through our official
              channels or via the NEAR Protocol ecosystem.
            </p>
          </section>

          <div className="border-t border-gray-800 pt-8 mt-12">
            <p className="text-gray-500 text-sm">
              These Terms of Service were last updated on February 15, 2026. By using YouTick, you
              acknowledge that you have read, understood, and agree to be bound by these Terms.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
