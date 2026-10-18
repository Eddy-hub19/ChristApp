/**
 * Замір клієнта "Отари" у справжньому Chrome (CDP): емуляція iPhone 13 (390x844, DPR 3, touch) і CPU x4.
 * Відкриває сторінку гри під переданим JWT, натискає "Грати", рахує кадри requestAnimationFrame та зайнятість
 * головного потоку (Performance.getMetrics) за вікно замірів.
 *
 * Використовується з load-scenarios.ts (сценарії flock*-browser). Потрібні: запущений фронтенд
 * (LOAD_FRONTEND_URL, зібраний/запущений з NEXT_PUBLIC_WS_URL на цей бекенд) і Chrome (LOAD_CHROME_BIN).
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import WebSocket from 'ws';

export type BrowserBenchResult = {
  cpuThrottle: number;
  seconds: number;
  fps: number;
  frames: number;
  framesOver33: number;
  framesOver50: number;
  frameP95Ms: number;
  frameMaxMs: number;
  /** Частка часу, коли головний потік був зайнятий (TaskDuration), %. */
  mainThreadBusyPct: number;
  scriptPct: number;
  layoutPct: number;
  /** Чи дійшла гра до стану "грає" (інакше замір не показовий). */
  playing: boolean;
};

const CHROME =
  process.env.LOAD_CHROME_BIN ??
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';

class Cdp {
  private id = 0;
  private pending = new Map<
    number,
    { res: (v: any) => void; rej: (e: Error) => void }
  >();
  constructor(private ws: WebSocket) {
    ws.on('message', (raw) => {
      const m = JSON.parse(String(raw));
      const p = m.id ? this.pending.get(m.id) : undefined;
      if (!p) return;
      this.pending.delete(m.id);
      if (m.error) p.rej(new Error(`${m.error.message}`));
      else p.res(m.result);
    });
  }
  send<T = any>(method: string, params: object = {}): Promise<T> {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((res, rej) => this.pending.set(id, { res, rej }));
  }
  eval<T = any>(expression: string): Promise<T> {
    return this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    }).then((r: any) => r.result?.value as T);
  }
  close() {
    this.ws.close();
  }
}

async function connect(port: number): Promise<Cdp> {
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, {
        method: 'PUT',
      });
      const t = (await res.json()) as { webSocketDebuggerUrl: string };
      const ws = new WebSocket(t.webSocketDebuggerUrl);
      await new Promise((ok, no) => {
        ws.once('open', ok);
        ws.once('error', no);
      });
      return new Cdp(ws);
    } catch {
      await sleep(300);
    }
  }
  throw new Error('Chrome DevTools недоступний');
}

const metricsMap = (m: { metrics: { name: string; value: number }[] }) =>
  Object.fromEntries(m.metrics.map((x) => [x.name, x.value]));

export async function benchFlockBrowser(opts: {
  frontendUrl: string;
  token: string;
  userId: string;
  lang?: string;
  cpuThrottle?: number;
  /** Скін власної овечки (платні скіни мають бути куплені в БД). */
  skin?: number;
  /** Куда сохранить PNG-снимок экрана игры в конце замера. */
  screenshot?: string;
  warmupSec?: number;
  seconds?: number;
}): Promise<BrowserBenchResult> {
  const throttle = opts.cpuThrottle ?? 4;
  const seconds = opts.seconds ?? 30;
  const port = 9333 + Math.floor(Math.random() * 500);
  const profile = mkdtempSync(join(tmpdir(), 'flock-bench-'));
  const chrome: ChildProcess = spawn(
    CHROME,
    [
      '--headless=new',
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${profile}`,
      '--no-first-run',
      '--disable-extensions',
      '--mute-audio',
      '--window-size=390,844',
    ],
    { stdio: 'ignore' },
  );
  let cdp: Cdp | null = null;
  try {
    cdp = await connect(port);
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Performance.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 390,
      height: 844,
      deviceScaleFactor: 3,
      mobile: true,
    });
    await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true });
    await cdp.send('Emulation.setUserAgentOverride', { userAgent: IPHONE_UA });
    // токен + "Що нового" вже переглянуто (щоб картка не заважала); колектор кадрів стартує за командою
    await cdp.send('Page.addScriptToEvaluateOnNewDocument', {
      source: `
        try {
          localStorage.setItem('christ_access_token', ${JSON.stringify(opts.token)});
          localStorage.setItem('christapp:flock:whatsNew:${opts.userId}', '999');
          localStorage.setItem('christapp:flock:skin', '${opts.skin ?? 0}');
        } catch (e) {}
        window.__bench = { on: false, last: 0, frames: [] };
        const tick = (t) => {
          const b = window.__bench;
          if (b.on) { if (b.last) b.frames.push(t - b.last); b.last = t; }
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      `,
    });
    await cdp.send('Page.navigate', {
      url: `${opts.frontendUrl}/${opts.lang ?? 'ua'}/games/flock?flockDebug=1`,
    });
    // чекаємо кнопку "Грати" (лобі готове) і тиснемо її
    let clicked = false;
    for (let i = 0; i < 120 && !clicked; i++) {
      await sleep(500);
      clicked = await cdp.eval<boolean>(`(() => {
        const b = [...document.querySelectorAll('button')].find(x => /^(Грати|Играть|Play)$/.test(x.textContent.trim()) && !x.disabled);
        if (!b) return false; b.click(); return true; })()`);
    }
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle });
    // рух: тримаємо вказівник біля краю екрана - овечка рухається, світ скролиться
    await cdp.send('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: 300,
      y: 300,
    });
    await sleep((opts.warmupSec ?? 8) * 1000);
    const playing =
      clicked && (await cdp.eval<boolean>(`!!window.__flockModel`));
    await cdp.eval(
      'window.__bench.frames = []; window.__bench.last = 0; window.__bench.on = true',
    );
    const m0 = metricsMap(await cdp.send('Performance.getMetrics'));
    const t0 = Date.now();
    // шевелимо вказівником, щоб напрямок змінювався, як у людини
    for (let i = 0; Date.now() - t0 < seconds * 1000; i++) {
      await cdp.send('Input.dispatchMouseEvent', {
        type: 'mouseMoved',
        x: 195 + Math.cos(i / 6) * 150,
        y: 422 + Math.sin(i / 6) * 150,
      });
      await sleep(250);
    }
    if (opts.screenshot) {
      const shot = await cdp.send<{ data: string }>('Page.captureScreenshot', {
        format: 'png',
      });
      writeFileSync(opts.screenshot, Buffer.from(shot.data, 'base64'));
    }
    const wall = (Date.now() - t0) / 1000;
    const m1 = metricsMap(await cdp.send('Performance.getMetrics'));
    const frames: number[] = (await cdp.eval('window.__bench.frames')) ?? [];
    const sorted = [...frames].sort((a, b) => a - b);
    const pct = (k: string) => Math.round(((m1[k] - m0[k]) / wall) * 1000) / 10;
    return {
      cpuThrottle: throttle,
      seconds: Math.round(wall),
      fps: Math.round((frames.length / wall) * 10) / 10,
      frames: frames.length,
      framesOver33: frames.filter((f) => f > 33.4).length,
      framesOver50: frames.filter((f) => f > 50).length,
      frameP95Ms:
        Math.round((sorted[Math.floor(sorted.length * 0.95)] ?? 0) * 10) / 10,
      frameMaxMs: Math.round((sorted[sorted.length - 1] ?? 0) * 10) / 10,
      mainThreadBusyPct: pct('TaskDuration'),
      scriptPct: pct('ScriptDuration'),
      layoutPct: pct('LayoutDuration'),
      playing,
    };
  } finally {
    cdp?.close();
    chrome.kill();
  }
}
