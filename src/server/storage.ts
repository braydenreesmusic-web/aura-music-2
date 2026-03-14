import fs from 'fs';
import path from 'path';

export interface MediaStorage {
  getAbsolutePath(filename: string): string;
  getPublicUrl(filename: string): string;
  exists(filename: string): boolean;
  delete(filename: string): void;
}

export class LocalDiskStorage implements MediaStorage {
  constructor(private readonly rootDir: string) {}

  getAbsolutePath(filename: string) {
    return path.join(this.rootDir, filename);
  }

  getPublicUrl(filename: string) {
    return `/api/file/${encodeURIComponent(filename)}`;
  }

  exists(filename: string) {
    return fs.existsSync(this.getAbsolutePath(filename));
  }

  delete(filename: string) {
    const filePath = this.getAbsolutePath(filename);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }
}
