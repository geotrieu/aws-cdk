import * as path from 'path';
import { IFilesystemHost, DirEntry } from '../lib/fs-host';

/**
 * In-memory filesystem for testing.
 *
 * Paths are normalized to use forward slashes. Directories are inferred
 * from the files that are added.
 */
export class MemoryFilesystemHost implements IFilesystemHost {
  private files = new Map<string, string>();

  /** Add a file. Parent directories are created implicitly. */
  addFile(filePath: string, content: string): void {
    this.files.set(this.norm(filePath), content);
  }

  /** Get all written files (useful for assertions). */
  writtenFiles(): Map<string, string> {
    return new Map(this.files);
  }

  readdir(dir: string): DirEntry[] {
    const d = this.norm(dir);
    const prefix = d.endsWith('/') ? d : d + '/';
    const seen = new Set<string>();
    const entries: DirEntry[] = [];

    for (const key of this.files.keys()) {
      if (!key.startsWith(prefix)) continue;
      const rest = key.substring(prefix.length);
      const firstSegment = rest.split('/')[0];
      if (seen.has(firstSegment)) continue;
      seen.add(firstSegment);

      const isDir = rest.includes('/');
      entries.push({ name: firstSegment, isDirectory: isDir });
    }
    return entries.sort((a, b) => a.name.localeCompare(b.name));
  }

  readFile(filePath: string): string {
    const content = this.files.get(this.norm(filePath));
    if (content === undefined) throw new Error(`ENOENT: ${filePath}`);
    return content;
  }

  writeFile(filePath: string, content: string): void {
    this.files.set(this.norm(filePath), content);
  }

  exists(filePath: string): boolean {
    const n = this.norm(filePath);
    if (this.files.has(n)) return true;
    // Check if it's a directory (any file starts with this prefix)
    const prefix = n + '/';
    for (const key of this.files.keys()) {
      if (key.startsWith(prefix)) return true;
    }
    return false;
  }

  isDirectory(filePath: string): boolean {
    const n = this.norm(filePath);
    if (this.files.has(n)) return false;
    const prefix = n + '/';
    for (const key of this.files.keys()) {
      if (key.startsWith(prefix)) return true;
    }
    return false;
  }

  deleteFile(filePath: string): void {
    const n = this.norm(filePath);
    if (!this.files.has(n)) throw new Error(`ENOENT: ${filePath}`);
    this.files.delete(n);
  }

  private norm(p: string): string {
    return path.normalize(p).replace(/\\/g, '/');
  }
}
