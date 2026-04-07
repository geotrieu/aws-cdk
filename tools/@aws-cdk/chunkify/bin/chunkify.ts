import * as path from 'path';
import { RealFilesystemHost, combineSubmodule, discoverSubmodules, generateEntryPoints, copySupportingFiles, cleanSourceFiles } from '../lib';

function main() {
  const host = new RealFilesystemHost();

  const args = process.argv.slice(2);
  let root = process.cwd();
  let outputDir: string | undefined;
  let clean = false;
  const submoduleArgs: string[] = [];

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--out' || args[i] === '-o') {
      outputDir = path.resolve(args[++i]);
    } else if (args[i] === '--clean') {
      clean = true;
    } else if (args[i].startsWith('-')) {
      console.error(`Unknown option: ${args[i]}`);
      process.exit(1);
    } else if (!submoduleArgs.length && !outputDir && i === 0 && host.isDirectory(path.resolve(args[i]))) {
      root = path.resolve(args[i]);
    } else {
      submoduleArgs.push(args[i]);
    }
  }

  if (clean && outputDir) {
    console.error('Error: --clean and --out are mutually exclusive. --clean is for in-place mode only.');
    process.exit(1);
  }

  const submodules = submoduleArgs.length > 0 ? submoduleArgs : discoverSubmodules(host, root);

  console.log(`Combining ${submodules.length} submodules in ${root}...`);
  if (outputDir) {
    console.log(`Output directory: ${outputDir}`);
  }

  let success = 0;
  let skipped = 0;
  const allSourceFiles: string[] = [];

  for (const sub of submodules) {
    const dir = path.join(root, sub);
    const result = combineSubmodule(host, dir, sub, outputDir);
    if (result) {
      console.log(`  ${sub}: ${result.moduleCount} files combined`);
      allSourceFiles.push(...result.sourceFiles);
      success++;
    } else {
      skipped++;
    }
  }

  const wrappers = generateEntryPoints(host, root, outputDir);
  if (wrappers.length > 0) {
    console.log(`Generated ${wrappers.length} entry point wrappers`);
  }

  if (outputDir) {
    const copied = copySupportingFiles(host, root, outputDir);
    if (copied > 0) {
      console.log(`Copied ${copied} supporting files`);
    }
  }

  if (clean) {
    const entryPointSet = new Set(wrappers);
    const deleted = cleanSourceFiles(host, allSourceFiles, entryPointSet);
    console.log(`Cleaned ${deleted} source files (kept ${allSourceFiles.length - deleted} entry points)`);
  }

  console.log(`\nDone: ${success} combined, ${skipped} skipped.`);
}

main();
