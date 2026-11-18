import * as dns from 'dns/promises';
import * as undici from 'undici';
import {
  UnsafeUrlError,
  assertPublicHttpUrl,
  assertPublicHttpUrlPinned,
  buildPinnedLookup,
  checkEmbeddable,
  safeFetch,
} from './url-safety';

jest.mock('dns/promises', () => ({ lookup: jest.fn() }));
const mockedLookup = dns.lookup as jest.Mock;

jest.mock('undici', () => {
  const actual = jest.requireActual('undici');
  return {
    ...actual,
    Agent: jest.fn((opts?: unknown) => new actual.Agent(opts)),
    fetch: jest.fn(actual.fetch),
  };
});
const mockedAgent = undici.Agent as unknown as jest.Mock;
const mockedUndiciFetch = undici.fetch as unknown as jest.Mock;

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

describe('assertPublicHttpUrlPinned', () => {
  it('для літеральної публічної IP не має що пінити (addresses: null)', async () => {
    const { addresses } = await assertPublicHttpUrlPinned('http://8.8.8.8/');
    expect(addresses).toBeNull();
  });

  it('для імені хоста повертає резолвнуті адреси разом з URL', async () => {
    mockedLookup.mockResolvedValueOnce([
      { address: '93.184.216.34', family: 4 },
      { address: '2606:2800:220:1:248:1893:25c8:1946', family: 6 },
    ]);
    const { url, addresses } = await assertPublicHttpUrlPinned('http://example.com/x');
    expect(url.hostname).toBe('example.com');
    expect(addresses).toEqual([
      { address: '93.184.216.34', family: 4 },
      { address: '2606:2800:220:1:248:1893:25c8:1946', family: 6 },
    ]);
  });
});

describe('buildPinnedLookup', () => {
  it('на запит "all" повертає всі перевірені адреси без нового резолву', () => {
    const addresses = [
      { address: '1.2.3.4', family: 4 },
      { address: '5.6.7.8', family: 4 },
    ];
    const lookup = buildPinnedLookup(addresses);
    const callback = jest.fn();
    lookup('example.com', { all: true }, callback);
    expect(callback).toHaveBeenCalledWith(null, addresses);
  });

  it('без "all" повертає лише першу адресу і її сімейство', () => {
    const addresses = [{ address: '1.2.3.4', family: 4 }];
    const lookup = buildPinnedLookup(addresses);
    const callback = jest.fn();
    lookup('example.com', {}, callback);
    expect(callback).toHaveBeenCalledWith(null, '1.2.3.4', 4);
  });
});

describe('DNS rebinding: safeFetch пінує реальне зʼєднання до вже перевірених адрес', () => {
  beforeEach(() => {
    mockedAgent.mockClear();
    mockedUndiciFetch.mockReset();
    mockedUndiciFetch.mockResolvedValue(
      new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }),
    );
  });

  it('передає в undici dispatcher з lookup, що повертає РІВНО ті адреси, що пройшли перевірку — а не новий DNS-резолв', async () => {
    const resolved = [{ address: '93.184.216.34', family: 4 }];
    mockedLookup.mockResolvedValueOnce(resolved);

    await safeFetch('http://example.com/');

    expect(mockedAgent).toHaveBeenCalledTimes(1);
    const connectOpts = mockedAgent.mock.calls[0][0] as {
      connect: { lookup: ReturnType<typeof buildPinnedLookup> };
    };
    const lookupCallback = jest.fn();
    connectOpts.connect.lookup('example.com', { all: true }, lookupCallback);
    // Колбек отримав саме заздалегідь перевірені адреси, а не результат нового резолву —
    // це і закриває вікно rebinding-а: реальний конект undici піде на них.
    expect(lookupCallback).toHaveBeenCalledWith(null, resolved);

    const dispatcherUsed = mockedUndiciFetch.mock.calls[0][1].dispatcher;
    expect(dispatcherUsed).toBe(mockedAgent.mock.results[0].value);
  });

  it('для літеральної публічної IP не створює dispatcher (нема чого пінити)', async () => {
    await safeFetch('http://93.184.216.34/');

    expect(mockedAgent).not.toHaveBeenCalled();
    expect(mockedUndiciFetch.mock.calls[0][1].dispatcher).toBeUndefined();
  });
});

describe('checkEmbeddable', () => {
  beforeEach(() => {
    // mockedUndiciFetch/mockedAgent — спільні на весь файл jest.fn(); чистимо історію викликів
    // (не імплементацію), щоб "not.toHaveBeenCalled()" нижче не рахував виклики з інших describe.
    mockedUndiciFetch.mockClear();
    mockedAgent.mockClear();
  });

  it('SSRF-фільтр відхилив адресу (метадані хмари) → "unsafe", а не null — це не "сайт не відповів"', async () => {
    mockedLookup.mockResolvedValueOnce([{ address: '169.254.169.254', family: 4 }]);
    const result = await checkEmbeddable('http://cloud-metadata.example/latest/meta-data/');
    expect(result).toBe('unsafe');
    // Жодного реального запиту — assertPublicHttpUrl впав ще до fetch().
    expect(mockedUndiciFetch).not.toHaveBeenCalled();
  });

  it('справжня мережева помилка (публічна адреса, з\'єднання впало) → null, не "unsafe"', async () => {
    mockedLookup.mockResolvedValueOnce([{ address: '93.184.216.34', family: 4 }]);
    mockedUndiciFetch.mockRejectedValueOnce(new Error('ECONNRESET'));
    const result = await checkEmbeddable('https://example.com/watch');
    expect(result).toBeNull();
  });
});
