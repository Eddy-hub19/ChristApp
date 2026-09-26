import { Test } from '@nestjs/testing';
import { VideoResolverService } from './video-resolver.service';
import * as urlSafety from './url-safety';

jest.mock('./url-safety', () => ({
  checkEmbeddable: jest.fn(),
  safeFetchContentType: jest.fn(),
  safeFetchJson: jest.fn(),
}));

const mockedSafeFetchJson = urlSafety.safeFetchJson as jest.Mock;
const mockedCheckEmbeddable = urlSafety.checkEmbeddable as jest.Mock;
const mockedSafeFetchContentType = urlSafety.safeFetchContentType as jest.Mock;

describe('VideoResolverService', () => {
  let service: VideoResolverService;

  beforeEach(async () => {
    jest.resetAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [VideoResolverService],
    }).compile();
    service = moduleRef.get(VideoResolverService);
  });

  it('розпізнає "голий" YouTube videoId (без URL)', async () => {
    mockedSafeFetchJson.mockResolvedValue({ title: 'Rick Astley', thumbnail_url: 'https://i.ytimg.com/x.jpg' });
    const result = await service.resolveLink('dQw4w9WgXcQ');
    expect(result).toMatchObject({ ok: true, provider: 'YOUTUBE', videoId: 'dQw4w9WgXcQ' });
  });

  it.each([
    ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://youtu.be/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://www.youtube.com/shorts/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42', 'dQw4w9WgXcQ'],
  ])('розпізнає YouTube-посилання %s', async (url, expectedId) => {
    mockedSafeFetchJson.mockResolvedValue({ title: 'T' });
    const result = await service.resolveLink(url);
    expect(result).toMatchObject({ ok: true, provider: 'YOUTUBE', videoId: expectedId });
  });

  it.each([
    ['https://vimeo.com/76979871', '76979871'],
    ['https://player.vimeo.com/video/76979871', '76979871'],
  ])('розпізнає Vimeo-посилання %s', async (url, expectedId) => {
    mockedSafeFetchJson.mockResolvedValue({ title: 'Vimeo T', thumbnail_url: 'https://i.vimeocdn.com/x.jpg' });
    const result = await service.resolveLink(url);
    expect(result).toMatchObject({ ok: true, provider: 'VIMEO', videoId: expectedId });
  });

  it.each([
    ['https://www.dailymotion.com/video/x7tgd2p', 'x7tgd2p'],
    ['https://dai.ly/x7tgd2p', 'x7tgd2p'],
  ])('розпізнає Dailymotion-посилання %s', async (url, expectedId) => {
    mockedSafeFetchJson.mockResolvedValue({ title: 'DM T' });
    const result = await service.resolveLink(url);
    expect(result).toMatchObject({ ok: true, provider: 'DAILYMOTION', videoId: expectedId });
  });

  it('розпізнає пряме посилання на файл за розширенням, без мережевого запиту', async () => {
    const result = await service.resolveLink('https://cdn.example.com/sermon.mp4');
    expect(result).toMatchObject({ ok: true, provider: 'FILE', videoId: 'https://cdn.example.com/sermon.mp4' });
    expect(mockedSafeFetchContentType).not.toHaveBeenCalled();
  });

  it('розпізнає .m3u8 за розширенням', async () => {
    const result = await service.resolveLink('https://cdn.example.com/stream.m3u8?token=abc');
    expect(result).toMatchObject({ ok: true, provider: 'FILE' });
  });

  it('без видимого розширення питає content-type перед тим, як здатися', async () => {
    mockedSafeFetchContentType.mockResolvedValue('video/mp4');
    const result = await service.resolveLink('https://cdn.example.com/file?token=abc');
    expect(result).toMatchObject({ ok: true, provider: 'FILE' });
    expect(mockedSafeFetchContentType).toHaveBeenCalled();
  });

  it('невідомий сайт, що дозволяє вбудовування → IFRAME', async () => {
    mockedCheckEmbeddable.mockResolvedValue({ embeddable: true, finalUrl: 'https://example.com/watch' });
    const result = await service.resolveLink('https://example.com/watch');
    expect(result).toMatchObject({ ok: true, provider: 'IFRAME' });
  });

  it('невідомий сайт, що забороняє вбудовування → MANUAL', async () => {
    mockedCheckEmbeddable.mockResolvedValue({ embeddable: false, finalUrl: 'https://example.com/watch' });
    const result = await service.resolveLink('https://example.com/watch');
    expect(result).toMatchObject({ ok: true, provider: 'MANUAL' });
  });

  it('якщо перевірку embeddable взагалі не вдалося провести → MANUAL, а не "пощастило"', async () => {
    mockedCheckEmbeddable.mockResolvedValue(null);
    const result = await service.resolveLink('https://example.com/watch');
    expect(result).toMatchObject({ ok: true, provider: 'MANUAL' });
  });

  it('YouTube oEmbed не відповів → NOT_FOUND', async () => {
    mockedSafeFetchJson.mockResolvedValue(null);
    const result = await service.resolveLink('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    expect(result).toMatchObject({ ok: false, code: 'NOT_FOUND' });
  });

  it('позначає http-посилання прапорцем mixedContent для попередження в UI', async () => {
    mockedSafeFetchContentType.mockResolvedValue('video/mp4');
    const result = await service.resolveLink('http://cdn.example.com/file?token=abc');
    expect(result).toMatchObject({ ok: true, provider: 'FILE', mixedContent: true });
  });

  it('https-посилання — mixedContent: false', async () => {
    mockedSafeFetchJson.mockResolvedValue({ title: 'T' });
    const result = await service.resolveLink('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    expect(result).toMatchObject({ mixedContent: false });
  });

  it('"голий" YouTube videoId (без URL) — mixedContent завжди false', async () => {
    mockedSafeFetchJson.mockResolvedValue({ title: 'Rick Astley' });
    const result = await service.resolveLink('dQw4w9WgXcQ');
    expect(result).toMatchObject({ mixedContent: false });
  });

  it('відхиляє некоректний ввід (порожній рядок)', async () => {
    const result = await service.resolveLink('   ');
    expect(result).toMatchObject({ ok: false, code: 'INVALID_VIDEO' });
  });

  it('відхиляє посилання з непідтримуваним протоколом', async () => {
    const result = await service.resolveLink('ftp://example.com/video.mp4');
    expect(result).toMatchObject({ ok: false, code: 'INVALID_VIDEO' });
  });

  it('кешує результат — другий виклик того самого посилання не б\'є в мережу вдруге', async () => {
    mockedSafeFetchJson.mockResolvedValue({ title: 'T' });
    await service.resolveLink('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    await service.resolveLink('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    expect(mockedSafeFetchJson).toHaveBeenCalledTimes(1);
  });
});
