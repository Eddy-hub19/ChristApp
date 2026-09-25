import * as dns from 'dns/promises';
import { UnsafeUrlError, assertPublicHttpUrl } from './url-safety';

jest.mock('dns/promises', () => ({ lookup: jest.fn() }));
const mockedLookup = dns.lookup as jest.Mock;

describe('assertPublicHttpUrl', () => {
  it('відхиляє неправильний URL', async () => {
    await expect(assertPublicHttpUrl('not a url')).rejects.toThrow(UnsafeUrlError);
  });

  it('відхиляє протоколи, відмінні від http/https', async () => {
    await expect(assertPublicHttpUrl('ftp://example.com/file')).rejects.toThrow(UnsafeUrlError);
    await expect(assertPublicHttpUrl('file:///etc/passwd')).rejects.toThrow(UnsafeUrlError);
    await expect(assertPublicHttpUrl('javascript:alert(1)')).rejects.toThrow(UnsafeUrlError);
  });

  it('відхиляє localhost без DNS-резолву', async () => {
    await expect(assertPublicHttpUrl('http://localhost/x')).rejects.toThrow(UnsafeUrlError);
    await expect(assertPublicHttpUrl('http://sub.localhost/x')).rejects.toThrow(UnsafeUrlError);
    await expect(assertPublicHttpUrl('http://0.0.0.0/x')).rejects.toThrow(UnsafeUrlError);
  });

  it('відхиляє IPv4 з приватних/зарезервованих діапазонів, вказаних напряму в URL', async () => {
    const blocked = [
      'http://127.0.0.1/',
      'http://127.1.2.3/',
      'http://10.0.0.5/',
      'http://172.16.0.1/',
      'http://172.31.255.255/',
      'http://192.168.1.1/',
      'http://169.254.169.254/', // AWS/GCP/Azure metadata endpoint
      'http://224.0.0.1/',
    ];
    for (const url of blocked) {
      await expect(assertPublicHttpUrl(url)).rejects.toThrow(UnsafeUrlError);
    }
  });

  it('не блокує суміжні публічні IPv4 (172.15.x, 172.32.x, 192.169.x)', async () => {
    await expect(assertPublicHttpUrl('http://172.15.0.1/')).resolves.toBeInstanceOf(URL);
    await expect(assertPublicHttpUrl('http://172.32.0.1/')).resolves.toBeInstanceOf(URL);
    await expect(assertPublicHttpUrl('http://192.169.0.1/')).resolves.toBeInstanceOf(URL);
    await expect(assertPublicHttpUrl('http://8.8.8.8/')).resolves.toBeInstanceOf(URL);
  });

  it('відхиляє IPv6 loopback і link-local, вказані напряму', async () => {
    await expect(assertPublicHttpUrl('http://[::1]/')).rejects.toThrow(UnsafeUrlError);
    await expect(assertPublicHttpUrl('http://[fe80::1]/')).rejects.toThrow(UnsafeUrlError);
    await expect(assertPublicHttpUrl('http://[fd00::1]/')).rejects.toThrow(UnsafeUrlError);
  });

  it('відхиляє IPv4-mapped IPv6, що вказує на приватну адресу', async () => {
    await expect(assertPublicHttpUrl('http://[::ffff:127.0.0.1]/')).rejects.toThrow(UnsafeUrlError);
  });

  it('перевіряє результат DNS-резолву за іменем хоста, а не лише сам рядок', async () => {
    mockedLookup.mockResolvedValueOnce([{ address: '127.0.0.1', family: 4 }]);
    await expect(assertPublicHttpUrl('http://evil.example.com/')).rejects.toThrow(UnsafeUrlError);
  });

  it('пропускає ім\'я хоста, що резолвиться у публічну адресу', async () => {
    mockedLookup.mockResolvedValueOnce([{ address: '93.184.216.34', family: 4 }]);
    await expect(assertPublicHttpUrl('http://example.com/')).resolves.toBeInstanceOf(URL);
  });

  it('відхиляє, якщо DNS-резолв не вдався (замість "пощастило — вважаємо безпечним")', async () => {
    mockedLookup.mockRejectedValueOnce(new Error('ENOTFOUND'));
    await expect(assertPublicHttpUrl('http://does-not-resolve.invalid/')).rejects.toThrow(
      UnsafeUrlError,
    );
  });
});
