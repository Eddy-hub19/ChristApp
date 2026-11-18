"use client";

import { useEffect, useRef } from "react";
import { drawArtifact } from "./flockArtifacts";
import { drawCreature } from "./flockRender";
import { animFrame, skinOf } from "./flockSkins";
import { isSpecialDeco } from "./flockSpecialDeco";
import { prefersReducedMotion } from "./flockSprites";
import { subscribePreviewTick } from "./flockPreviewTicker";

/** Прев'ю скіна; преміум анімується (кадри 8/с від одного спільного таймера), при «зменшити рух» - статичний кадр. */
export default function SkinPreview({ skinId, artifactId = 0, size = 56 }: { skinId: number; artifactId?: number; size?: number }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const cv = ref.current;
    const ctx = cv?.getContext("2d");
    if (!cv || !ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = cv.height = size * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const skin = skinOf(skinId);
    // Шари анімації виходять за радіус тіла - преміум малюємо трохи меншим, щоб не обрізались краєм полотна.
    // Особливі виступають за тіло (кристали, капелюшок, антена) - теж трохи менші.
    const radius = skin.anim ? size * 0.27 : isSpecialDeco(skin.deco) ? size * 0.3 : size * 0.36;
    const draw = (frame: number) => {
      ctx.clearRect(0, 0, size, size);
      drawCreature(ctx, skin, size / 2, size / 2 + 1, radius, 0.5, 0, 0, frame);
      if (artifactId > 0) drawArtifact(ctx, artifactId, skin, size / 2, size / 2 + 1, radius, 0.5);
    };
    draw(0);
    if (!skin.anim || prefersReducedMotion()) return;
    let last = 0;
    return subscribePreviewTick(() => {
      const f = animFrame(skin, performance.now() / 1000);
      if (f !== last) {
        last = f;
        draw(f);
      }
    });
  }, [skinId, artifactId, size]);
  return <canvas ref={ref} style={{ width: size, height: size }} aria-hidden />;
}
