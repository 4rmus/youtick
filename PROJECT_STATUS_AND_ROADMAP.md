# YouTick Demo - Project Status & Roadmap

## 🟢 Current Status (Completed Features)

The **YouTick Demo** is a functional Proof-of-Concept (PoC) for a decentralized Video-on-Demand (VOD) platform on the NEAR blockchain.

### Core Features
1.  **Global Dark Theme**:
    -   Consistent, premium "cinematic" dark mode across the entire application (Landing, Upload, Discover, Watch).
2.  **Wallet Connection**:
    -   Integrated **NEAR Wallet Selector**.
    -   Supports MyNearWallet and other standard wallets.
3.  **Video Upload & Thumbnails**:
    -   **Automatic Thumbnails**: Extracts a frame from the video in the browser to use as the NFT Ticket image.
    -   **Rich Preview**: "Ticket Preview" card shows live metadata (Title, Price, Uploader) and thumbnail before minting.
    -   **Encryption**: Videos are encrypted client-side using **Lit Protocol** before upload to IPFS (Lighthouse).
4.  **Access Control (NFT Gating)**:
    -   **Minting**: Users mint an NFT that embeds the thumbnail CID + Access Key.
    -   **Verification**: The application verifies ownership on-chain.
    -   **Decryption**: Only holders can decrypt and play.
5.  **Playback**:
    -   Custom `IpfsPlayer` handles encrypted streaming.

6.  **Optimized UX**:
    -   **Single Signature Upload**: Bundles NFT Minting and Event Creation into one transaction (Storage fee covered by prepaid gas).
    -   **Pay-First Flow**: Users pay the exact simplified "Service Fee" upfront if balance is low.
    -   **Hidden Gas Mechanics**: "GasTank" complexity is abstracted away; unused gas is retained for future uploads.

### Technical Stack
-   **Frontend**: Next.js 14 (React), Tailwind CSS, Lucide Icons.
-   **Blockchain**: NEAR Protocol (Testnet).
-   **Storage**: IPFS (Lighthouse).
-   **Encryption**: Lit Protocol (Datil Dev Network).
-   **Auth**: SIWE over MPC (Multi-Party Computation).

---

## 🗺️ Roadmap (Future Development)

### Phase 1: hardening Security & Smart Contracts (Immediate Next Steps)
-   [ ] **Robust Lit Action**: Move the NFT ownership check from the client-side (`IpfsPlayer.tsx`) to a server-side **Lit Action**. This ensures that the encryption key is *only* released if the Lit nodes independently verify the NFT ownership on-chain.
-   [ ] **Smart Contract Upgrade**: Deploy a comprehensive NEAR smart contract that supports:
    -   Dynamic NFT minting upon video upload.
    -   Royalty distribution (uploader gets paid when NFT is sold).
    -   Marketplace features (buy/sell access NFTs).
-   [ ] **Environment Variables**: Move all hardcoded contract IDs and API keys to `.env` files.

### Phase 2: Data Indexing & Discovery
-   [ ] **Indexer Integration**: Implement a NEAR Indexer (or The Graph) to query:
    -   All videos uploaded by a specific user.
    -   All videos a user has access to.
    -   Trending videos.
-   [ ] **Video Feed**: Create a "Discover" page that lists available videos fetched from the indexer, rather than relying on manual CID entry.

### Phase 3: UI/UX Improvements
-   [ ] **Profile Page**: A dedicated page for users to view their minted NFTs and uploaded videos.
-   [ ] **Better Player**: Support for adaptive streaming (HLS/DASH) for larger video files.
-   [ ] **Mobile Optimization**: Ensure the dApp works seamlessly on mobile wallets (Meteor, Here Wallet).

### Phase 4: Mainnet Launch
-   [ ] **Audit**: Security audit of the Smart Contract and Lit Action code.
-   [ ] **Mainnet Deployment**: Deploy contracts to NEAR Mainnet and switch Lit Protocol to production network.

---

## 🚀 How to Run Locally

1.  **Install Dependencies**:
    ```bash
    npm install
    ```
2.  **Run Development Server**:
    ```bash
    npm run dev
    ```
3.  **Test the Flow**:
    -   Connect Wallet.
    -   Upload a video (Encrypts & Uploads).
    -   Copy the CID.
    -   Paste CID in the Player.
    -   Mint Test NFT (if needed).
    -   Decrypt & Watch.
