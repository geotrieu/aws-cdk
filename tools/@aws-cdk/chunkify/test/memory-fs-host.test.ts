import { MemoryFilesystemHost } from './memory-fs-host';

describe('MemoryFilesystemHost', () => {
  test('readdir returns immediate children', () => {
    const host = new MemoryFilesystemHost();
    host.addFile('/a/b.js', '');
    host.addFile('/a/c/d.js', '');
    const entries = host.readdir('/a');
    expect(entries).toEqual([
      { name: 'b.js', isDirectory: false },
      { name: 'c', isDirectory: true },
    ]);
  });

  test('readFile returns content', () => {
    const host = new MemoryFilesystemHost();
    host.addFile('/x.js', 'hello');
    expect(host.readFile('/x.js')).toBe('hello');
  });

  test('readFile throws for missing file', () => {
    const host = new MemoryFilesystemHost();
    expect(() => host.readFile('/nope')).toThrow('ENOENT');
  });

  test('writeFile creates file readable by readFile', () => {
    const host = new MemoryFilesystemHost();
    host.writeFile('/out.js', 'content');
    expect(host.readFile('/out.js')).toBe('content');
  });

  test('exists returns true for files and directories', () => {
    const host = new MemoryFilesystemHost();
    host.addFile('/a/b.js', '');
    expect(host.exists('/a/b.js')).toBe(true);
    expect(host.exists('/a')).toBe(true);
    expect(host.exists('/nope')).toBe(false);
  });

  test('isDirectory distinguishes files from directories', () => {
    const host = new MemoryFilesystemHost();
    host.addFile('/a/b.js', '');
    expect(host.isDirectory('/a')).toBe(true);
    expect(host.isDirectory('/a/b.js')).toBe(false);
    expect(host.isDirectory('/nope')).toBe(false);
  });
});
