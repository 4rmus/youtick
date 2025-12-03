# YouTick Demo - Project Status & Roadmap

## 🟢 Current Status (Completed Features)

The **YouTick Demo** is a functional Proof-of-Concept (PoC) for a decentralized Video-on-Demand (VOD) platform on the NEAR blockchain.

### Core Features
1.  **Wallet Connection**:
    -   Integrated **NEAR Wallet Selector**.
    -   Supports MyNearWallet and other standard wallets.
2.  **Video Upload**:
    -   Secure upload to **IPFS** using **Lighthouse Storage**.
    -   **Encryption**: Videos are encrypted client-side using **Lit Protocol** before upload.
3.  **Access Control (NFT Gating)**:
    -   **Minting**: Users can mint a test NFT directly from the UI (`MintButton`).
    -   **Verification**: The application verifies if the viewer owns the required NFT on the NEAR testnet.
    -   **Decryption**: Only NFT holders can generate the valid `AuthSig` (SIWE) required to decrypt and play the video.
4.  **Playback**:
    -   Custom `IpfsPlayer` component fetches encrypted chunks, decrypts them in memory, and plays the video.

### Technical Stack
-   **Frontend**: Next.js 14 (React), Tailwind CSS.
-   **Blockchain**: NEAR Protocol (Testnet).
-   **Storage**: IPFS (Lighthouse).
-   **Encryption**: Lit Protocol (Datil Dev Network).
-   **Auth**: SIWE (Sign-In with Ethereum) adapted for NEAR via MPC (Multi-Party Computation).

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
