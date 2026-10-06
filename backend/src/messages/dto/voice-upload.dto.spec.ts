import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { VoiceUploadDto } from './voice-upload.dto';

const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
});

const run = (voiceDuration?: unknown) =>
  pipe.transform(
    {
      roomId: 'room-1',
      ...(voiceDuration === undefined ? {} : { voiceDuration }),
    },
    { type: 'body', metatype: VoiceUploadDto },
  ) as Promise<VoiceUploadDto>;

describe('VoiceUploadDto voiceDuration', () => {
  it('accepts a number', async () => {
    expect((await run(7.2)).voiceDuration).toBe(7.2);
  });

  it('converts a multipart string to a number', async () => {
    expect((await run('7.2')).voiceDuration).toBe(7.2);
  });

  it.each([
    ['NaN', NaN],
    ['"NaN"', 'NaN'],
    ['Infinity', Infinity],
    ['"Infinity"', 'Infinity'],
    ['negative', -3],
    ['empty string', ''],
    ['garbage', 'abc'],
    ['too large', 999999],
  ])('does not reject %s, leaves duration empty', async (_n, value) => {
    expect((await run(value)).voiceDuration).toBeUndefined();
  });

  it('does not reject a missing duration', async () => {
    expect((await run()).voiceDuration).toBeUndefined();
  });
});
