import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy | YouTick",
  description: "YouTick Privacy Policy - How we handle your data on our decentralized video platform",
};

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-gray-950 text-gray-200">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <h1 className="text-4xl font-bold text-white mb-2">Privacy Policy</h1>
        <p className="text-gray-400 mb-12">Last Updated: February 15, 2026</p>

        <div className="space-y-10 text-gray-300 leading-relaxed">
          {/* 1. INTRODUCTION */}
          <section>
            <h2 className="text-2xl font-semibold text-white mb-4">1. Introduction</h2>
            <p>
              YouTick (&quot;Platform&quot;, &quot;we&quot;, &quot;us&quot;, &quot;our&quot;) is a
              decentralized video-on-demand platform built on the NEAR Protocol blockchain. This
              Privacy Policy explains how we collect, use, store, and protect information when you
              use our Platform.
            </p>
            <p className="mt-3">
              YouTick is designed with a <strong className="text-white">privacy-first, client-side
              architecture</strong>. Unlike traditional platforms, the majority of data processing
              occurs directly in your browser. We do not maintain centralized user databases,
              authentication servers, or content delivery systems. This fundamentally limits the
              data we can collect and access.
            </p>
            <p className="mt-3">
              By using YouTick, you acknowledge and consent to the practices described in this Privacy
              Policy. If you do not agree with this policy, please discontinue use of the Platform.
            </p>
          </section>

          {/* 2. DATA WE COLLECT */}
          <section>
            <h2 className="text-2xl font-semibold text-white mb-4">2. Information We Collect</h2>
            <p>
              Due to our decentralized architecture, the data we collect is minimal compared to
              traditional platforms. We categorize collected information as follows:
            </p>

            <h3 className="text-lg font-medium text-white mt-6 mb-3">2.1 On-Chain Data (Blockchain - Public and Immutable)</h3>
            <p>
              When you interact with the NEAR Protocol blockchain through our Platform, the following
              data is recorded permanently on the public blockchain:
            </p>
            <ul className="list-disc list-inside mt-2 space-y-1 ml-4">
              <li><strong className="text-white">Account ID</strong>: Your NEAR account identifier (e.g., &quot;username.near&quot;)</li>
              <li><strong className="text-white">Transaction History</strong>: All purchases, transfers, and contract interactions</li>
              <li><strong className="text-white">NFT Ownership</strong>: Records of video tickets you own or have sold</li>
              <li><strong className="text-white">Event Metadata</strong>: Video titles, descriptions, prices, and content identifiers (encrypted CIDs)</li>
              <li><strong className="text-white">Purchase Logs</strong>: Buyer ID, creator ID, amounts, timestamps, and purchase types</li>
              <li><strong className="text-white">Prepaid Balance</strong>: Deposited funds for signless transactions</li>
            </ul>
            <p className="mt-3 p-4 bg-gray-900 rounded-lg border border-gray-800">
              <strong className="text-yellow-400">Important</strong>: Blockchain data is public and
              immutable. Once recorded, it cannot be modified, deleted, or made private. This is an
              inherent characteristic of blockchain technology. We cannot fulfill deletion requests
              for on-chain data. Your NEAR account ID and all associated transactions are permanently
              visible to anyone on the network.
            </p>

            <h3 className="text-lg font-medium text-white mt-6 mb-3">2.2 Client-Side Data (Your Browser)</h3>
            <p>
              The following data is stored locally in your browser&apos;s localStorage and sessionStorage.
              This data never leaves your device and is fully under your control:
            </p>
            <ul className="list-disc list-inside mt-2 space-y-1 ml-4">
              <li><strong className="text-white">Session Keys</strong>: Cached NEAR access keys for signless transactions (24-hour expiry)</li>
              <li><strong className="text-white">Wallet Credentials</strong>: Encrypted keypairs managed by your wallet provider</li>
              <li><strong className="text-white">Trial Account Data</strong>: Locally generated account IDs and onboarding keys</li>
              <li><strong className="text-white">User Preferences</strong>: Theme settings, language selection</li>
              <li><strong className="text-white">Nova Authentication Tokens</strong>: Tokens for TEE encryption/decryption sessions</li>
            </ul>
            <p className="mt-3">
              You can delete all client-side data at any time by clearing your browser&apos;s local
              storage. This will not affect your blockchain-based account or assets.
            </p>

            <h3 className="text-lg font-medium text-white mt-6 mb-3">2.3 Server-Side Data (Minimal)</h3>
            <p>
              Our server-side data collection is extremely limited and includes:
            </p>
            <ul className="list-disc list-inside mt-2 space-y-1 ml-4">
              <li>
                <strong className="text-white">IP Addresses</strong>: Collected temporarily for trial
                account rate limiting (3 accounts per IP per day). IP addresses are stored in-memory
                only and are automatically discarded on server restart. They are not logged to
                persistent storage.
              </li>
              <li>
                <strong className="text-white">Trial Account Audit Logs</strong>: Username, timestamp,
                and daily creation count. These logs contain no personal identifiers beyond the
                chosen username.
              </li>
            </ul>

            <h3 className="text-lg font-medium text-white mt-6 mb-3">2.4 Analytics Data</h3>
            <p>
              We use Google Analytics 4 (GA4) to understand how the Platform is used. Google Analytics
              may collect:
            </p>
            <ul className="list-disc list-inside mt-2 space-y-1 ml-4">
              <li>Page views and navigation patterns</li>
              <li>Device type, browser, and operating system</li>
              <li>Approximate geographic location (country/city level)</li>
              <li>Referral sources</li>
              <li>Session duration and engagement metrics</li>
            </ul>
            <p className="mt-3">
              Google Analytics data is processed by Google LLC under their own privacy terms. We do
              not link Google Analytics data to your NEAR account or blockchain identity.
            </p>

            <h3 className="text-lg font-medium text-white mt-6 mb-3">2.5 Information We Do NOT Collect</h3>
            <p>YouTick explicitly does <strong className="text-white">not</strong> collect:</p>
            <ul className="list-disc list-inside mt-2 space-y-1 ml-4">
              <li>Email addresses, phone numbers, or physical addresses</li>
              <li>Real names or government-issued identification</li>
              <li>Payment card or bank account information</li>
              <li>Social media profiles or contacts</li>
              <li>Biometric data</li>
              <li>Video viewing history or watch duration</li>
              <li>Search history or browsing behavior (beyond GA4)</li>
              <li>Private keys, seed phrases, or wallet passwords</li>
            </ul>
          </section>

          {/* 3. HOW WE USE INFORMATION */}
          <section>
            <h2 className="text-2xl font-semibold text-white mb-4">3. How We Use Information</h2>
            <p>The limited information we have access to is used for:</p>

            <div className="mt-4 space-y-4">
              <div className="p-4 bg-gray-900/50 rounded-lg">
                <h4 className="text-white font-medium mb-2">Platform Operations</h4>
                <ul className="list-disc list-inside space-y-1 ml-2">
                  <li>Facilitating smart contract interactions (ticket purchases, content uploads)</li>
                  <li>Verifying NFT ownership for content access</li>
                  <li>Managing Nova Protocol group memberships for encryption/decryption</li>
                  <li>Processing payments and distributing creator revenue (98% / 2% split)</li>
                </ul>
              </div>

              <div className="p-4 bg-gray-900/50 rounded-lg">
                <h4 className="text-white font-medium mb-2">Security and Abuse Prevention</h4>
                <ul className="list-disc list-inside space-y-1 ml-2">
                  <li>Rate limiting trial account creation to prevent abuse</li>
                  <li>Validating session key permissions and expiry</li>
                  <li>Monitoring for smart contract exploitation attempts</li>
                </ul>
              </div>

              <div className="p-4 bg-gray-900/50 rounded-lg">
                <h4 className="text-white font-medium mb-2">Platform Improvement</h4>
                <ul className="list-disc list-inside space-y-1 ml-2">
                  <li>Analyzing aggregate usage patterns via Google Analytics</li>
                  <li>Identifying and resolving technical issues</li>
                  <li>Improving user experience and interface design</li>
                </ul>
              </div>
            </div>
          </section>

          {/* 4. THIRD-PARTY SERVICES */}
          <section>
            <h2 className="text-2xl font-semibold text-white mb-4">4. Third-Party Services and Data Sharing</h2>
            <p>
              YouTick integrates with the following third-party decentralized and traditional services.
              Each has its own privacy practices:
            </p>

            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-700">
                    <th className="text-left py-3 px-4 text-white">Service</th>
                    <th className="text-left py-3 px-4 text-white">Purpose</th>
                    <th className="text-left py-3 px-4 text-white">Data Shared</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  <tr>
                    <td className="py-3 px-4 font-medium text-white">NEAR Protocol</td>
                    <td className="py-3 px-4">Blockchain, payments, NFTs</td>
                    <td className="py-3 px-4">Account ID, transactions, balances (public ledger)</td>
                  </tr>
                  <tr>
                    <td className="py-3 px-4 font-medium text-white">Nova Protocol</td>
                    <td className="py-3 px-4">TEE encryption, group access</td>
                    <td className="py-3 px-4">Encrypted content, group membership, attestation data</td>
                  </tr>
                  <tr>
                    <td className="py-3 px-4 font-medium text-white">IPFS / Pinata / Crust</td>
                    <td className="py-3 px-4">Decentralized file storage</td>
                    <td className="py-3 px-4">Encrypted video blobs, content identifiers (CIDs)</td>
                  </tr>
                  <tr>
                    <td className="py-3 px-4 font-medium text-white">Defuse Protocol</td>
                    <td className="py-3 px-4">Cross-chain stablecoin swaps</td>
                    <td className="py-3 px-4">EVM wallet address, swap amounts, token types</td>
                  </tr>
                  <tr>
                    <td className="py-3 px-4 font-medium text-white">Google Analytics</td>
                    <td className="py-3 px-4">Usage analytics</td>
                    <td className="py-3 px-4">Page views, device info, approximate location</td>
                  </tr>
                  <tr>
                    <td className="py-3 px-4 font-medium text-white">Wallet Providers</td>
                    <td className="py-3 px-4">Authentication, signing</td>
                    <td className="py-3 px-4">Transaction signing requests (wallet-managed)</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <p className="mt-4">
              We do not sell, rent, or trade your personal information to any third parties. Data
              sharing is limited to what is technically necessary for the Platform&apos;s functionality.
            </p>
          </section>

          {/* 5. BLOCKCHAIN TRANSPARENCY */}
          <section>
            <h2 className="text-2xl font-semibold text-white mb-4">5. Blockchain Transparency and Public Data</h2>
            <p>
              As a blockchain-based platform, certain data is inherently public and transparent. You
              should be aware of the following:
            </p>

            <h3 className="text-lg font-medium text-white mt-6 mb-3">5.1 Public Information</h3>
            <p>The following information is publicly visible on the NEAR Protocol blockchain:</p>
            <ul className="list-disc list-inside mt-2 space-y-1 ml-4">
              <li>Your NEAR account ID and its transaction history</li>
              <li>NFT tickets you own (which videos you have access to)</li>
              <li>Events/videos you have created (as a creator)</li>
              <li>Payment amounts and timestamps</li>
              <li>Smart contract method calls you have made</li>
            </ul>

            <h3 className="text-lg font-medium text-white mt-6 mb-3">5.2 Pseudonymity</h3>
            <p>
              NEAR account IDs do not inherently contain personally identifiable information. You may
              use the Platform pseudonymously, and we encourage privacy-conscious users to choose
              account names that do not reveal their real identity. However, if your NEAR account is
              publicly linked to your real identity (e.g., through social media or other platforms),
              your on-chain activity may be attributable to you.
            </p>

            <h3 className="text-lg font-medium text-white mt-6 mb-3">5.3 Content Privacy</h3>
            <p>
              Video content uploaded through YouTick is encrypted using Nova Protocol&apos;s Trusted
              Execution Environment before being stored on IPFS. Only authorized group members
              (ticket holders) can decrypt and view the content. The encrypted content itself is
              stored on the public IPFS network, but it is computationally infeasible to decrypt
              without proper authorization.
            </p>
          </section>

          {/* 6. DATA STORAGE AND SECURITY */}
          <section>
            <h2 className="text-2xl font-semibold text-white mb-4">6. Data Storage and Security</h2>

            <h3 className="text-lg font-medium text-white mt-6 mb-3">6.1 Encryption</h3>
            <ul className="list-disc list-inside mt-2 space-y-1 ml-4">
              <li><strong className="text-white">Video Content</strong>: AES-256-GCM encryption via Nova Protocol TEE</li>
              <li><strong className="text-white">Transport</strong>: TLS encryption for all API communications</li>
              <li><strong className="text-white">Local Storage</strong>: Wallet keys encrypted by wallet providers</li>
              <li><strong className="text-white">Gift Links</strong>: Secret keys stored in URL fragments (not sent to servers)</li>
            </ul>

            <h3 className="text-lg font-medium text-white mt-6 mb-3">6.2 Security Measures</h3>
            <ul className="list-disc list-inside mt-2 space-y-1 ml-4">
              <li>CORS protection on all API endpoints</li>
              <li>Rate limiting on sensitive operations</li>
              <li>Session key allowance caps (0.25 NEAR maximum)</li>
              <li>Prepaid withdrawal limits (0.1 NEAR per transaction)</li>
              <li>Whitelisted RPC methods for proxy endpoints</li>
              <li>Credential stripping from API logs</li>
            </ul>

            <h3 className="text-lg font-medium text-white mt-6 mb-3">6.3 Your Responsibilities</h3>
            <p>You are responsible for:</p>
            <ul className="list-disc list-inside mt-2 space-y-1 ml-4">
              <li>Securing your wallet credentials, private keys, and seed phrases</li>
              <li>Keeping your device and browser secure</li>
              <li>Not sharing session keys or gift link URLs with unauthorized parties</li>
              <li>Reviewing transaction details before confirming on-chain operations</li>
            </ul>
          </section>

          {/* 7. DATA RETENTION */}
          <section>
            <h2 className="text-2xl font-semibold text-white mb-4">7. Data Retention</h2>

            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-700">
                    <th className="text-left py-3 px-4 text-white">Data Type</th>
                    <th className="text-left py-3 px-4 text-white">Retention Period</th>
                    <th className="text-left py-3 px-4 text-white">Deletion Method</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  <tr>
                    <td className="py-3 px-4">Blockchain data</td>
                    <td className="py-3 px-4">Permanent (immutable)</td>
                    <td className="py-3 px-4">Cannot be deleted</td>
                  </tr>
                  <tr>
                    <td className="py-3 px-4">IPFS content</td>
                    <td className="py-3 px-4">Permanent (content-addressed)</td>
                    <td className="py-3 px-4">Unpinning may remove from gateways, but no guarantee</td>
                  </tr>
                  <tr>
                    <td className="py-3 px-4">Browser localStorage</td>
                    <td className="py-3 px-4">Until cleared by user</td>
                    <td className="py-3 px-4">Clear browser storage</td>
                  </tr>
                  <tr>
                    <td className="py-3 px-4">Session keys</td>
                    <td className="py-3 px-4">24 hours (auto-expiry)</td>
                    <td className="py-3 px-4">Automatic or clear storage</td>
                  </tr>
                  <tr>
                    <td className="py-3 px-4">IP addresses (rate limiting)</td>
                    <td className="py-3 px-4">In-memory only (until server restart)</td>
                    <td className="py-3 px-4">Automatic on restart</td>
                  </tr>
                  <tr>
                    <td className="py-3 px-4">Google Analytics data</td>
                    <td className="py-3 px-4">Per Google&apos;s retention settings</td>
                    <td className="py-3 px-4">Contact Google / use opt-out tools</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          {/* 8. YOUR RIGHTS */}
          <section>
            <h2 className="text-2xl font-semibold text-white mb-4">8. Your Rights</h2>
            <p>
              Depending on your jurisdiction, you may have certain rights regarding your personal data:
            </p>

            <h3 className="text-lg font-medium text-white mt-6 mb-3">8.1 Rights You Can Exercise</h3>
            <ul className="list-disc list-inside mt-2 space-y-2 ml-4">
              <li>
                <strong className="text-white">Access</strong>: You can view all your on-chain data
                through any NEAR Protocol block explorer
              </li>
              <li>
                <strong className="text-white">Local Data Deletion</strong>: You can delete all
                client-side data by clearing your browser&apos;s local storage
              </li>
              <li>
                <strong className="text-white">Analytics Opt-Out</strong>: You can use browser
                extensions or settings to block Google Analytics tracking
              </li>
              <li>
                <strong className="text-white">Pseudonymity</strong>: You can use the Platform
                without revealing your real identity
              </li>
              <li>
                <strong className="text-white">Account Discontinuation</strong>: You can stop using
                the Platform at any time by disconnecting your wallet
              </li>
            </ul>

            <h3 className="text-lg font-medium text-white mt-6 mb-3">8.2 Limitations Due to Blockchain Technology</h3>
            <p>
              The following rights under traditional data protection laws (such as GDPR) are
              technically limited in a blockchain context:
            </p>
            <ul className="list-disc list-inside mt-2 space-y-2 ml-4">
              <li>
                <strong className="text-white">Right to Erasure (&quot;Right to be Forgotten&quot;)</strong>:
                We cannot delete data recorded on the NEAR Protocol blockchain. This is a fundamental
                technical limitation of blockchain technology.
              </li>
              <li>
                <strong className="text-white">Right to Rectification</strong>: On-chain data cannot
                be modified once confirmed. New transactions can be made, but historical records
                persist.
              </li>
              <li>
                <strong className="text-white">Data Portability</strong>: Your on-chain data is
                already publicly accessible and portable by design.
              </li>
            </ul>
            <p className="mt-3">
              We acknowledge these limitations and have designed the Platform to minimize personal
              data collection. By using a blockchain-based service, you consent to the inherent
              data permanence characteristics of the technology.
            </p>
          </section>

          {/* 9. COOKIES */}
          <section>
            <h2 className="text-2xl font-semibold text-white mb-4">9. Cookies and Local Storage</h2>
            <p>
              YouTick does <strong className="text-white">not</strong> use traditional HTTP cookies
              for session management or tracking. However:
            </p>
            <ul className="list-disc list-inside mt-3 space-y-2 ml-4">
              <li>
                <strong className="text-white">localStorage</strong>: Used for session key caching,
                wallet credentials, user preferences, and trial account data. This data stays on
                your device.
              </li>
              <li>
                <strong className="text-white">sessionStorage</strong>: Used for temporary session
                state during your browsing session. Cleared when you close the browser tab.
              </li>
              <li>
                <strong className="text-white">Google Analytics Cookies</strong>: GA4 may set cookies
                for analytics purposes. These are governed by Google&apos;s privacy policy.
              </li>
            </ul>
          </section>

          {/* 10. CHILDREN'S PRIVACY */}
          <section>
            <h2 className="text-2xl font-semibold text-white mb-4">10. Children&apos;s Privacy</h2>
            <p>
              YouTick is not intended for use by individuals under the age of 18 (or the age of
              majority in their jurisdiction). We do not knowingly collect personal information from
              children. If we become aware that a minor has used the Platform, we will take
              appropriate steps to restrict access through the frontend interface.
            </p>
          </section>

          {/* 11. INTERNATIONAL DATA */}
          <section>
            <h2 className="text-2xl font-semibold text-white mb-4">11. International Data Considerations</h2>
            <p>
              The NEAR Protocol blockchain is a globally distributed network. Your on-chain data is
              replicated across validator nodes worldwide. IPFS content is distributed across a global
              network of storage nodes. By using the Platform, you consent to the global distribution
              of your data through these decentralized networks.
            </p>
            <p className="mt-3">
              Google Analytics data may be processed in any country where Google operates data centers.
              Google&apos;s data processing practices are governed by their own privacy policy and data
              processing agreements.
            </p>
          </section>

          {/* 12. NOVA PROTOCOL */}
          <section>
            <h2 className="text-2xl font-semibold text-white mb-4">12. Nova Protocol and Trusted Execution Environment</h2>
            <p>
              YouTick uses Nova Protocol for video encryption and access control. Nova operates a
              Trusted Execution Environment (TEE) that:
            </p>
            <ul className="list-disc list-inside mt-3 space-y-2 ml-4">
              <li>Manages encryption keys within a hardware-secured enclave</li>
              <li>Performs encryption/decryption operations without exposing keys</li>
              <li>Maintains group membership lists for access control</li>
              <li>Provides cryptographic attestation of TEE integrity</li>
            </ul>
            <p className="mt-3">
              YouTick does not have access to Nova&apos;s encryption keys. The TEE ensures that
              encryption keys cannot be extracted by any party, including Nova Protocol operators
              or YouTick. Nova Protocol&apos;s own privacy practices govern the data processed
              within their TEE infrastructure.
            </p>
          </section>

          {/* 13. CHANGES */}
          <section>
            <h2 className="text-2xl font-semibold text-white mb-4">13. Changes to This Privacy Policy</h2>
            <p>
              We may update this Privacy Policy from time to time to reflect changes in our practices,
              technology, legal requirements, or for other operational reasons. Changes will be posted
              on this page with an updated &quot;Last Updated&quot; date. We encourage you to review
              this Privacy Policy periodically.
            </p>
            <p className="mt-3">
              For material changes that significantly affect how we handle your data, we will make
              reasonable efforts to provide notice through the Platform interface.
            </p>
          </section>

          {/* 14. CONTACT */}
          <section>
            <h2 className="text-2xl font-semibold text-white mb-4">14. Contact Information</h2>
            <p>
              For privacy-related questions, concerns, or requests, please contact us through our
              official channels or via the NEAR Protocol ecosystem.
            </p>
            <p className="mt-3">
              For Google Analytics opt-out options, please visit
              Google&apos;s privacy tools or use a browser extension to block analytics tracking.
            </p>
          </section>

          {/* SUMMARY BOX */}
          <section className="p-6 bg-gray-900 rounded-xl border border-gray-800 mt-12">
            <h2 className="text-xl font-semibold text-white mb-4">Privacy at a Glance</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div>
                <h4 className="text-green-400 font-medium mb-2">What We Don&apos;t Collect</h4>
                <ul className="space-y-1 text-gray-400">
                  <li>- No email or phone numbers</li>
                  <li>- No real names or identity documents</li>
                  <li>- No payment card information</li>
                  <li>- No viewing history or watch time</li>
                  <li>- No private keys or seed phrases</li>
                  <li>- No traditional cookies</li>
                </ul>
              </div>
              <div>
                <h4 className="text-yellow-400 font-medium mb-2">What Is Public (Blockchain)</h4>
                <ul className="space-y-1 text-gray-400">
                  <li>- Your NEAR account ID</li>
                  <li>- Transaction history</li>
                  <li>- NFT ownership records</li>
                  <li>- Event/video metadata</li>
                  <li>- Payment amounts and timestamps</li>
                  <li>- Smart contract interactions</li>
                </ul>
              </div>
            </div>
          </section>

          <div className="border-t border-gray-800 pt-8 mt-12">
            <p className="text-gray-500 text-sm">
              This Privacy Policy was last updated on February 15, 2026. By using YouTick, you
              acknowledge that you have read and understood this Privacy Policy.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
