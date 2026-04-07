import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execSync } from 'child_process';
import { RealFilesystemHost, combineSubmodule, generateEntryPoints, copySupportingFiles, discoverSubmodules, cleanSourceFiles } from '../lib';

const host = new RealFilesystemHost();

/** Create a temp dir that is cleaned up after the test */
function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'chunkify-test-'));
}

/** Write files into a directory from a flat map */
function writeFiles(root: string, files: Record<string, string>) {
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(root, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content, 'utf-8');
  }
}

/** Run a JS snippet via Node in a given directory, return stdout */
function runNode(cwd: string, code: string): string {
  const tmpFile = path.join(cwd, '__test_runner.js');
  fs.writeFileSync(tmpFile, code, 'utf-8');
  try {
    return execSync(`"${process.execPath}" __test_runner.js`, {
      cwd,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  } finally {
    fs.unlinkSync(tmpFile);
  }
}

/** Run chunkify on srcRoot, write output to outRoot, return submodule list */
function chunkify(srcRoot: string, outRoot: string): string[] {
  const submodules = discoverSubmodules(host, srcRoot);
  for (const sub of submodules) {
    combineSubmodule(host, path.join(srcRoot, sub), sub, outRoot);
  }
  generateEntryPoints(host, srcRoot, outRoot);
  copySupportingFiles(host, srcRoot, outRoot);
  return submodules;
}

/** Run the same test program against original and chunkified dirs, assert same output */
function assertSameOutput(srcRoot: string, outRoot: string, testCode: string) {
  const originalOutput = runNode(srcRoot, testCode);
  const chunkifiedOutput = runNode(outRoot, testCode);
  expect(chunkifiedOutput).toEqual(originalOutput);
}

let srcRoot: string;
let outRoot: string;

afterEach(() => {
  if (srcRoot) fs.rmSync(srcRoot, { recursive: true, force: true });
  if (outRoot) fs.rmSync(outRoot, { recursive: true, force: true });
});

describe('basic module loading', () => {
  test('exports from a single submodule match', () => {
    srcRoot = makeTempDir();
    outRoot = makeTempDir();
    writeFiles(srcRoot, {
      'package.json': JSON.stringify({ exports: { './mymod': './mymod/index.js' } }),
      'mymod/index.js': [
        '"use strict";',
        'exports.greeting = "hello";',
        'exports.num = 42;',
      ].join('\n'),
    });
    chunkify(srcRoot, outRoot);
    fs.copyFileSync(path.join(srcRoot, 'package.json'), path.join(outRoot, 'package.json'));

    const code = `
      const m = require("./mymod");
      console.log(JSON.stringify({ greeting: m.greeting, num: m.num }));
    `;
    assertSameOutput(srcRoot, outRoot, code);
  });
});

describe('intra-submodule requires', () => {
  test('index re-exports from lib files', () => {
    srcRoot = makeTempDir();
    outRoot = makeTempDir();
    writeFiles(srcRoot, {
      'package.json': JSON.stringify({ exports: { './mymod': './mymod/index.js' } }),
      'mymod/index.js': '"use strict";\nexports.Foo = require("./lib/foo").Foo;',
      'mymod/lib/foo.js': '"use strict";\nexports.Foo = class Foo { name() { return "foo"; } };',
    });
    chunkify(srcRoot, outRoot);
    fs.copyFileSync(path.join(srcRoot, 'package.json'), path.join(outRoot, 'package.json'));

    const code = `
      const m = require("./mymod");
      console.log(new m.Foo().name());
    `;
    assertSameOutput(srcRoot, outRoot, code);
  });

  test('subdirectory index requires', () => {
    srcRoot = makeTempDir();
    outRoot = makeTempDir();
    writeFiles(srcRoot, {
      'package.json': JSON.stringify({ exports: { './mymod': './mymod/index.js' } }),
      'mymod/index.js': '"use strict";\nexports.deep = require("./lib/sub").val;',
      'mymod/lib/sub/index.js': '"use strict";\nexports.val = "from-sub";',
    });
    chunkify(srcRoot, outRoot);
    fs.copyFileSync(path.join(srcRoot, 'package.json'), path.join(outRoot, 'package.json'));

    assertSameOutput(srcRoot, outRoot, 'console.log(require("./mymod").deep);');
  });
});

describe('cross-submodule requires', () => {
  test('one submodule requires another', () => {
    srcRoot = makeTempDir();
    outRoot = makeTempDir();
    writeFiles(srcRoot, {
      'package.json': JSON.stringify({
        exports: { './alpha': './alpha/index.js', './beta': './beta/index.js' },
      }),
      'alpha/index.js': '"use strict";\nexports.a = "alpha";',
      'beta/index.js': '"use strict";\nconst alpha = require("../alpha");\nexports.b = "beta+" + alpha.a;',
    });
    chunkify(srcRoot, outRoot);
    fs.copyFileSync(path.join(srcRoot, 'package.json'), path.join(outRoot, 'package.json'));

    assertSameOutput(srcRoot, outRoot, 'console.log(require("./beta").b);');
  });

  test('deep cross-submodule require into lib/', () => {
    srcRoot = makeTempDir();
    outRoot = makeTempDir();
    writeFiles(srcRoot, {
      'package.json': JSON.stringify({
        exports: {
          './core': './core/index.js',
          './core/lib/errors': './core/lib/errors.js',
          './consumer': './consumer/index.js',
        },
      }),
      'core/index.js': '"use strict";\nexports.errors = require("./lib/errors");',
      'core/lib/errors.js': '"use strict";\nexports.ValidationError = class ValidationError extends Error {};',
      'consumer/index.js': '"use strict";\nconst errors = require("../core/lib/errors");\nexports.ErrName = errors.ValidationError.name;',
    });
    chunkify(srcRoot, outRoot);
    fs.copyFileSync(path.join(srcRoot, 'package.json'), path.join(outRoot, 'package.json'));

    assertSameOutput(srcRoot, outRoot, 'console.log(require("./consumer").ErrName);');
  });
});

describe('__dirname and __filename', () => {
  test('__dirname resolves to original file location', () => {
    srcRoot = makeTempDir();
    outRoot = makeTempDir();
    writeFiles(srcRoot, {
      'package.json': JSON.stringify({ exports: { './mymod': './mymod/index.js' } }),
      'mymod/index.js': '"use strict";\nexports.dir = require("./lib/deep").dir;',
      'mymod/lib/deep.js': '"use strict";\nconst path = require("path");\nexports.dir = path.basename(__dirname);',
    });
    chunkify(srcRoot, outRoot);
    fs.copyFileSync(path.join(srcRoot, 'package.json'), path.join(outRoot, 'package.json'));

    assertSameOutput(srcRoot, outRoot, 'console.log(require("./mymod").dir);');
  });

  test('__filename resolves to original file location', () => {
    srcRoot = makeTempDir();
    outRoot = makeTempDir();
    writeFiles(srcRoot, {
      'package.json': JSON.stringify({ exports: { './mymod': './mymod/index.js' } }),
      'mymod/index.js': '"use strict";\nexports.file = require("./lib/deep").file;',
      'mymod/lib/deep.js': '"use strict";\nconst path = require("path");\nexports.file = path.basename(__filename);',
    });
    chunkify(srcRoot, outRoot);
    fs.copyFileSync(path.join(srcRoot, 'package.json'), path.join(outRoot, 'package.json'));

    assertSameOutput(srcRoot, outRoot, 'console.log(require("./mymod").file);');
  });
});

describe('circular dependencies', () => {
  test('circular require between submodules does not crash', () => {
    srcRoot = makeTempDir();
    outRoot = makeTempDir();
    writeFiles(srcRoot, {
      'package.json': JSON.stringify({
        exports: { './a': './a/index.js', './b': './b/index.js' },
      }),
      // a requires b, b requires a — classic circular
      'a/index.js': '"use strict";\nexports.name = "a";\nconst b = require("../b");\nexports.bName = b.name;',
      'b/index.js': '"use strict";\nexports.name = "b";\nconst a = require("../a");\nexports.aName = a.name;',
    });
    chunkify(srcRoot, outRoot);
    fs.copyFileSync(path.join(srcRoot, 'package.json'), path.join(outRoot, 'package.json'));

    // In CommonJS circular deps, one side gets partial exports.
    // The important thing is both produce the same result.
    assertSameOutput(srcRoot, outRoot, `
      const a = require("./a");
      const b = require("./b");
      console.log(JSON.stringify({ aName: a.name, bName: b.name, abName: a.bName, baName: b.aName }));
    `);
  });
});

describe('json data files', () => {
  test('require of .json file works after chunkify', () => {
    srcRoot = makeTempDir();
    outRoot = makeTempDir();
    writeFiles(srcRoot, {
      'package.json': JSON.stringify({ exports: { './mymod': './mymod/index.js' } }),
      'mymod/index.js': '"use strict";\nexports.data = require("./lib/loader").data;',
      'mymod/lib/loader.js': '"use strict";\nexports.data = require("./metadata.json");',
      'mymod/lib/metadata.json': '{"version": "1.2.3"}',
    });
    chunkify(srcRoot, outRoot);
    fs.copyFileSync(path.join(srcRoot, 'package.json'), path.join(outRoot, 'package.json'));

    assertSameOutput(srcRoot, outRoot, 'console.log(JSON.stringify(require("./mymod").data));');
  });
});

describe('entry point wrappers', () => {
  test('deep export wrapper resolves correctly', () => {
    srcRoot = makeTempDir();
    outRoot = makeTempDir();
    writeFiles(srcRoot, {
      'package.json': JSON.stringify({
        exports: {
          './core': './core/index.js',
          './core/lib/helpers': './core/lib/helpers.js',
        },
      }),
      'core/index.js': '"use strict";\nexports.helpers = require("./lib/helpers");',
      'core/lib/helpers.js': '"use strict";\nexports.help = function() { return "helped"; };',
    });
    chunkify(srcRoot, outRoot);
    fs.copyFileSync(path.join(srcRoot, 'package.json'), path.join(outRoot, 'package.json'));

    // Test the deep export wrapper
    assertSameOutput(srcRoot, outRoot, 'console.log(require("./core/lib/helpers").help());');
  });

  test('root index.js re-exports work', () => {
    srcRoot = makeTempDir();
    outRoot = makeTempDir();
    writeFiles(srcRoot, {
      'package.json': JSON.stringify({
        exports: { '.': './index.js', './alpha': './alpha/index.js' },
      }),
      'index.js': '"use strict";\nexports.alpha = require("./alpha");',
      'alpha/index.js': '"use strict";\nexports.val = "from-alpha";',
    });
    chunkify(srcRoot, outRoot);
    fs.copyFileSync(path.join(srcRoot, 'package.json'), path.join(outRoot, 'package.json'));

    assertSameOutput(srcRoot, outRoot, 'console.log(require(".").alpha.val);');
  });
});

describe('clean source files', () => {
  test('deletes source files but keeps entry point wrappers', () => {
    srcRoot = makeTempDir();
    outRoot = ''; // not used
    writeFiles(srcRoot, {
      'package.json': JSON.stringify({
        exports: {
          './mymod': './mymod/index.js',
          './mymod/lib/helpers': './mymod/lib/helpers.js',
        },
      }),
      'mymod/index.js': '"use strict";\nexports.Foo = require("./lib/foo").Foo;\nexports.helpers = require("./lib/helpers");',
      'mymod/lib/foo.js': '"use strict";\nexports.Foo = class Foo {};',
      'mymod/lib/helpers.js': '"use strict";\nexports.help = function() { return "helped"; };',
      'mymod/lib/internal.js': '"use strict";\nexports.secret = 42;',
    });

    // Combine in-place
    const result = combineSubmodule(host, path.join(srcRoot, 'mymod'), 'mymod');
    expect(result).toBeDefined();

    // Generate entry points (overwrites index.js and lib/helpers.js with wrappers)
    const wrappers = generateEntryPoints(host, srcRoot);
    const entryPointSet = new Set(wrappers);

    // Clean
    const deleted = cleanSourceFiles(host, result!.sourceFiles, entryPointSet);

    // index.js and lib/helpers.js are entry points — should be kept (as wrappers)
    expect(fs.existsSync(path.join(srcRoot, 'mymod/index.js'))).toBe(true);
    expect(fs.existsSync(path.join(srcRoot, 'mymod/lib/helpers.js'))).toBe(true);

    // lib/foo.js and lib/internal.js are NOT entry points — should be deleted
    expect(fs.existsSync(path.join(srcRoot, 'mymod/lib/foo.js'))).toBe(false);
    expect(fs.existsSync(path.join(srcRoot, 'mymod/lib/internal.js'))).toBe(false);

    // Combined file should exist
    expect(fs.existsSync(path.join(srcRoot, 'mymod/index.combined.js'))).toBe(true);

    // And it should still work via the entry point wrapper
    const output = runNode(srcRoot, 'console.log(require("./mymod").Foo.name);');
    expect(output).toBe('Foo');

    expect(deleted).toBe(2); // foo.js and internal.js
  });
});
