/**
 * Filesystem abstraction for chunkify.
 *
 * All filesystem access goes through this interface so that the combiner
 * can be tested with an in-memory fake.
 */
export interface IFilesystemHost {
  /** List entries in a directory. Returns names (not full paths). */
  readdir(dir: string): DirEntry[];

  /** Read a file as UTF-8 text. */
  readFile(filePath: string): string;

  /** Write a file as UTF-8 text. */
  writeFile(filePath: string, content: string): void;

  /** Check if a path exists. */
  exists(filePath: string): boolean;

  /** Check if a path is a directory. */
  isDirectory(filePath: string): boolean;

  /** Delete a file. */
  deleteFile(filePath: string): void;
}

export interface DirEntry {
  name: string;
  isDirectory: boolean;
}
