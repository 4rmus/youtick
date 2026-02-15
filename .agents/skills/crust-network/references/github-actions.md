# Crust GitHub Actions Reference

## Available Actions

### ipfs-upload-action

Uploads a directory to IPFS and pins it on Crust Network. Ideal for static websites and dApps.

**Repository**: `crustio/ipfs-upload-action`

```yaml
- uses: crustio/ipfs-upload-action@v1
  with:
    path: ./dist              # Directory to upload
    seeds: ${{ secrets.CRUST_SEEDS }}  # Crust account mnemonic
```

### ipfs-crust-action

Pins an existing IPFS CID on Crust Network. Use when you already have a CID.

**Repository**: `crustio/ipfs-crust-action`

```yaml
- uses: crustio/ipfs-crust-action@v2.0.6
  with:
    cid: QmevJf2rdNibZCGrgeyVJEM82y5DsXgMDHXM6zBtQ6G4Vj
    seeds: ${{ secrets.CRUST_SEEDS }}
```

## Complete Deployment Workflow

### Static Website

```yaml
name: Deploy to Crust IPFS
on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - uses: actions/setup-node@v3
        with:
          node-version: 18

      - name: Install and Build
        run: |
          npm ci
          npm run build

      - name: Upload to Crust IPFS
        uses: crustio/ipfs-upload-action@v1
        id: upload
        with:
          path: ./dist
          seeds: ${{ secrets.CRUST_SEEDS }}

      - name: Pin on Crust
        uses: crustio/ipfs-crust-action@v2.0.6
        with:
          cid: ${{ steps.upload.outputs.cid }}
          seeds: ${{ secrets.CRUST_SEEDS }}

      - name: Output deployment URL
        run: |
          echo "Deployed to: https://gw.crustgw.work/ipfs/${{ steps.upload.outputs.cid }}"
```

### NEAR dApp Deployment

```yaml
name: Deploy NEAR dApp
on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - uses: actions/setup-node@v3
        with:
          node-version: 18

      - name: Build NEAR dApp
        run: |
          npm ci
          npm run build
        env:
          NEAR_ENV: mainnet
          CONTRACT_NAME: your-app.near

      - name: Deploy to Crust
        uses: crustio/ipfs-upload-action@v1
        id: deploy
        with:
          path: ./dist
          seeds: ${{ secrets.CRUST_SEEDS }}

      - name: Ensure persistence
        uses: crustio/ipfs-crust-action@v2.0.6
        with:
          cid: ${{ steps.deploy.outputs.cid }}
          seeds: ${{ secrets.CRUST_SEEDS }}

      - name: Update DNS (optional)
        run: |
          echo "Update IPNS or DNS TXT record to: ${{ steps.deploy.outputs.cid }}"
```

## Secrets Configuration

Required GitHub repository secret:

| Secret | Description | Example |
|--------|-------------|---------|
| `CRUST_SEEDS` | Crust account mnemonic (12 words) | `word1 word2 ... word12` |

**Setup**: Repository Settings > Secrets and variables > Actions > New repository secret

## Access URLs

After deployment, files are accessible at:

```
https://gw.crustgw.work/ipfs/<CID>
https://gw.crustgw.org/ipfs/<CID>
https://gw.crust-gateway.xyz/ipfs/<CID>
https://crustipfs.xyz/ipfs/<CID>
```

For websites, append `/index.html` if needed:
```
https://gw.crustgw.work/ipfs/<CID>/index.html
```
