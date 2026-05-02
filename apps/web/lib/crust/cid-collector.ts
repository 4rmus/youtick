/**
 * CID Collector
 *
 * Accumulates CID + size pairs that need persistent storage orders.
 * New uploads store delivery assets under one IPFS directory root; legacy
 * callers may still collect individual manifest/segment/media assets.
 */

export type UploadedAssetType =
  | 'delivery-root'
  | 'manifest'
  | 'init-segment'
  | 'media-segment'
  | 'thumbnail'
  | 'poster';

export interface UploadedAsset {
  cid: string;
  size: number;
  type: UploadedAssetType;
}

export class CidCollector {
  private assets: UploadedAsset[] = [];

  add(cid: string, size: number, type: UploadedAssetType): void {
    if (!cid) return;
    this.assets.push({ cid, size, type });
  }

  getAll(): UploadedAsset[] {
    return [...this.assets];
  }

  getTotalSize(): number {
    return this.assets.reduce((sum, asset) => sum + asset.size, 0);
  }

  getManifestCid(): string | undefined {
    return this.assets.find((a) => a.type === 'manifest')?.cid;
  }

  getDeliveryRootCid(): string | undefined {
    return this.assets.find((a) => a.type === 'delivery-root')?.cid;
  }

  count(): number {
    return this.assets.length;
  }

  clear(): void {
    this.assets = [];
  }
}
