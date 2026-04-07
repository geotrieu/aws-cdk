import * as fs from 'fs';
import * as path from 'path';
import type { IFilesystemHost, DirEntry } from './fs-host';

/**
 * Real filesystem implementation of IFilesystemHost.
 */
export class RealFilesystemHost implements IFilesystemHost {
  public readdir(dir: string): DirEntry[] {
    return fs.readdirSync(dir, { withFileTypes: true }).map(e => ({
      name: e.name,
      isDirectory: e.isDirectory(),
    }));
  }

  public readFile(filePath: string): string {
    return fs.readFileSync(filePath, 'utf-8');
  }

  public writeFile(filePath: string, content: string): void {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content, 'utf-8');
  }

  public exists(filePath: string): boolean {
    return fs.existsSync(filePath);
  }

  public isDirectory(filePath: string): boolean {
    try {
      return fs.statSync(filePath).isDirectory();
    } catch {
      return false;
    }
  }

  public deleteFile(filePath: string): void {
    fs.unlinkSync(filePath);
  }
}
