/**
 * CID Collector
 *
 * Accumulates CID + size pairs that need persistence status verification.
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
