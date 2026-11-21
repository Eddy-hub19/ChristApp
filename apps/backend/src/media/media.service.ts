import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface ExtractedAudio {
  title: string;
  durationSec: number | null;
  audioUrl: string;
}

@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);

  /**
   * Достаёт прямую ссылку на аудиопоток через yt-dlp (должен быть в PATH).
   * execFile без shell + `--` перед URL: ввод не может стать командой или опцией.
   */
  async extractAudio(url: string): Promise<ExtractedAudio> {
    let stdout: string;
    try {
      ({ stdout } = await execFileAsync(
        process.env.YT_DLP_PATH || 'yt-dlp',
        [
          '--no-playlist',
          '--no-warnings',
          '-f',
          'bestaudio/best',
          '--print',
          '%(title)s',
          '--print',
          '%(duration)s',
          '--print',
          'urls',
          '--',
          url,
        ],
        { timeout: 30_000, maxBuffer: 1024 * 1024 },
      ));
    } catch (err: any) {
      if (err?.code === 'ENOENT') {
        throw new ServiceUnavailableException('yt-dlp is not installed');
      }
      this.logger.warn(`yt-dlp failed for ${url}: ${err?.stderr || err?.message}`);
      throw new BadRequestException('Could not extract audio from this URL');
    }

    const [title, duration, audioUrl] = stdout.trim().split('\n');
    if (!audioUrl) {
      throw new BadRequestException('No audio stream found');
    }
    const durationSec = Number(duration);
    return {
      title: title || '',
      durationSec: Number.isFinite(durationSec) ? durationSec : null,
      audioUrl,
    };
  }
}
