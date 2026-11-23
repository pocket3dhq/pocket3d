import { downloadFileName, formatCount, formatSize } from './download';

describe('viewer download helpers', () => {
  it('names the file after the title, with the version when it is not the live one', () => {
    expect(downloadFileName('Robot arm', 3, 3)).toBe('Robot arm.glb');
    expect(downloadFileName('Robot arm', 2, 3)).toBe('Robot arm-v2.glb');
    expect(downloadFileName('Robot arm', 1, null)).toBe('Robot arm-v1.glb');
  });

  it('keeps only characters every system accepts in a file name', () => {
    expect(downloadFileName('a/b\\c:d*e?f"g<h>i|j', 1, 1)).toBe('a b c d e f g h i j.glb');
    expect(downloadFileName('../../etc/passwd', 1, 1)).toBe('etc passwd.glb');
    expect(downloadFileName('tab\there\nnew', 1, 1)).toBe('tab here new.glb');
    expect(downloadFileName('Château 🚀', 1, 1)).toBe('Château 🚀.glb');
  });

  it('falls back to "model" and caps the length', () => {
    expect(downloadFileName('', 1, 1)).toBe('model.glb');
    expect(downloadFileName(' /// ', 1, 1)).toBe('model.glb');
    expect(downloadFileName('...', 2, 1)).toBe('model-v2.glb');
    expect(downloadFileName('x'.repeat(200), 1, 1)).toBe(`${'x'.repeat(80)}.glb`);
  });

  it('formats sizes and counts', () => {
    expect(formatSize(500)).toBe('1 KB');
    expect(formatSize(4.2 * 1024 * 1024)).toBe('4.2 MB');
    expect(formatCount(1, 'view', 'views')).toBe('1 view');
    expect(formatCount(1234, 'view', 'views')).toBe('1,234 views');
    expect(formatCount(0, 'download', 'downloads')).toBe('0 downloads');
  });
});
