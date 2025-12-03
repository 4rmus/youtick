# YouTick - Decentralized Video-on-Demand Platform

**YouTick** is a Web3-native Video-on-Demand (VOD) platform built on the **NEAR Protocol**. It enables content creators to securely upload encrypted videos to IPFS and monetize them via NFT-gated access control.

![Status](https://img.shields.io/badge/Status-Proof%20of%20Concept-green)
![NEAR](https://img.shields.io/badge/Blockchain-NEAR%20Testnet-blue)
![IPFS](https://img.shields.io/badge/Storage-IPFS%20(Lighthouse)-yellow)
![Lit](https://img.shields.io/badge/Encryption-Lit%20Protocol-orange)

## 🌟 Key Features

*   **Decentralized Storage**: Videos are stored on **IPFS** using Lighthouse Storage, ensuring censorship resistance and permanence.
*   **Client-Side Encryption**: Content is encrypted in the browser using **Lit Protocol** before being uploaded, ensuring only authorized users can view it.
*   **NFT-Gated Access**: Access control is managed via **NEAR NFTs**. Only users who hold the specific NFT in their wallet can decrypt and watch the video.
*   **Seamless Auth**: Uses **MPC (Multi-Party Computation)** to bridge NEAR accounts with Lit Protocol's EVM-based encryption, providing a smooth "Sign-In with NEAR" experience.
*   **Instant Minting**: Integrated test NFT minting for easy demonstration and verification of the access control flow.

## 🛠️ Technology Stack

*   **Frontend**: Next.js 14 (App Router), React, Tailwind CSS, Lucide Icons.
*   **Blockchain**: NEAR Protocol (Testnet).
*   **Smart Contracts**: Rust (NEAR SDK).
*   **Encryption & Access Control**: Lit Protocol (Datil Dev Network).
*   **Storage**: Lighthouse (IPFS Gateway).
*   **Wallet Integration**: NEAR Wallet Selector.

## 🚀 Getting Started

### Prerequisites

*   Node.js 18+
*   npm or yarn
*   A NEAR Testnet Wallet (e.g., MyNearWallet)

### Installation

1.  **Clone the repository**:
    ```bash
    git clone https://github.com/4rmus/youtick-demo.git
    cd youtick-demo
    ```

2.  **Install dependencies**:
    ```bash
    npm install
    # or
    cd apps/web && npm install
    ```

3.  **Run the development server**:
    ```bash
    npm run dev
    # or
    cd apps/web && npm run dev
    ```

4.  **Open the app**:
    Visit [http://localhost:3000](http://localhost:3000) in your browser.

## 📖 Usage Guide

1.  **Connect Wallet**: Click the "Connect Wallet" button to sign in with your NEAR Testnet account.
2.  **Upload Video**:
    *   Select a video file.
    *   Enter a title and description.
    *   Click "Upload". The app will encrypt the file and upload it to IPFS.
    *   **Copy the CID** (Content Identifier) displayed after upload.
3.  **Watch Video**:
    *   Paste the CID into the "Watch Decrypted Video" section.
    *   Click "Load".
    *   **If Access Denied**: Click "Mint Test NFT" to receive the required access token.
    *   **Decrypt**: Click "Load" again. You will be prompted to sign a secure message (SIWE) to prove ownership.
    *   **Play**: The video will decrypt and start playing.

## 🗺️ Roadmap

See [PROJECT_STATUS_AND_ROADMAP.md](./PROJECT_STATUS_AND_ROADMAP.md) for detailed project status and future plans.

## 📄 License

This project is licensed under the MIT License.
