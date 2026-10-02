import { bookFilename, sniffBookFormat } from './book-sniff.util';

function fakeEpub(first = 'mimetype', value = 'application/epub+zip') {
  const header = Buffer.alloc(30);
  header.set([0x50, 0x4b, 0x03, 0x04]);
  return Buffer.concat([header, Buffer.from(first + value), Buffer.alloc(40)]);
}

describe('sniffBookFormat', () => {
  it('detects PDF by magic bytes', () => {
    expect(sniffBookFormat(Buffer.from('%PDF-1.7\n...'))).toBe('pdf');
  });

  it('detects EPUB by the leading mimetype entry', () => {
    expect(sniffBookFormat(fakeEpub())).toBe('epub');
  });

  it('rejects a plain ZIP and other content regardless of name', () => {
    expect(
      sniffBookFormat(fakeEpub('mimetype', 'application/zip-----')),
    ).toBeNull();
    expect(
      sniffBookFormat(fakeEpub('other___', 'application/epub+zip')),
    ).toBeNull();
    expect(
      sniffBookFormat(Buffer.from('<html><script>1</script></html>')),
    ).toBeNull();
    expect(sniffBookFormat(Buffer.alloc(0))).toBeNull();
  });
});

describe('bookFilename', () => {
  it('forces the extension of the real format', () => {
    expect(bookFilename('story.pdf', 'epub')).toBe('story.epub');
    expect(bookFilename('story', 'pdf')).toBe('story.pdf');
    expect(bookFilename('a/b.PDF', 'pdf')).toBe('a_b.PDF');
  });
});
