/**
 * CID Collector
 *
 * Accumulates CID + size pairs during the upload flow so that
 * storage orders can be placed for every uploaded asset —
 * not just the manifest.
 */

export type UploadedAssetType =
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

  count(): number {
    return this.assets.length;
  }

  clear(): void {
    this.assets = [];
  }
}
