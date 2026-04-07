export type { IFilesystemHost, DirEntry } from './fs-host';
export { RealFilesystemHost } from './real-fs-host';
export {
  collectFiles,
  registryKey,
  rewriteRequires,
  generateCombinedSource,
  combineSubmodule,
  discoverSubmodules,
  generateEntryPoints,
  copySupportingFiles,
  cleanSourceFiles,
  minifySource,
} from './combine';
export type { CollectedFiles, CombineResult } from './combine';
