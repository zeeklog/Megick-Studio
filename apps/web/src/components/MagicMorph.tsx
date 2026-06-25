import { useLayoutEffect, useRef, useState } from "react";

interface MagicMorphProps {
  /** 初始展示的文字 */
  from?: string;
  /** 变换之后定型的文字 */
  to?: string;
  /** 进入到正式开始变换前的停留时间（ms） */
  startDelay?: number;
  /** 粒子从 from 飞舞到 to 的时长（ms） */
  morphDuration?: number;
  /** 粒子总数上限 */
  particleCount?: number;
  /** 是否在变换完成后循环重播 */
  loop?: boolean;
  /** 两次循环之间的间隔（ms），仅 loop 为 true 时生效 */
  loopGap?: number;
  /** 文字相对父级字号的放大比例 */
  scale?: number;
  /** 画布水平方向相对容器额外扩展的比例（左右各扩 paddingX × 容器宽） */
  paddingX?: number;
  /** 画布垂直方向相对容器额外扩展的比例（上下各扩 paddingY × 容器高） */
  paddingY?: number;
}

type Particle = {
  ax: number;
  ay: number;
  bx: number;
  by: number;
  cx: number;
  cy: number;
  hue: number;
  size: number;
  delay: number;
  phaseOffset: number;
  twinkleSpeed: number;
};

const HUE_BANDS = [
  { min: 72, max: 92 }, // solar gold
  { min: 94, max: 108 }, // champagne
  { min: 38, max: 52 }, // amber accent
];

function pickHue() {
  const band = HUE_BANDS[Math.floor(Math.random() * HUE_BANDS.length)];
  return band.min + Math.random() * (band.max - band.min);
}

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function MagicMorph({
  from = "magic",
  to = "megick ✨",
  startDelay = 1500,
  morphDuration = 2000,
  particleCount = 2800,
  loop = false,
  loopGap = 4500,
  scale = 1.18,
  paddingX = 0.45,
  paddingY = 0.45,
}: MagicMorphProps) {
  const containerRef = useRef<HTMLSpanElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hydrated, setHydrated] = useState(false);

  useLayoutEffect(() => {
    if (typeof window === "undefined") return;
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    let raf: number | null = null;
    let timeout: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;
    let resizeTimer: ReturnType<typeof setTimeout> | null = null;

    const clearLoops = () => {
      if (raf !== null) {
        cancelAnimationFrame(raf);
        raf = null;
      }
      if (timeout !== null) {
        clearTimeout(timeout);
        timeout = null;
      }
    };

    const samplePoints = (
      text: string,
      cssW: number,
      cssH: number,
      dpr: number,
      fontStr: string,
      letterSpacing: string,
      step: number,
      leftX: number,
    ): Float32Array => {
      const off = document.createElement("canvas");
      off.width = Math.max(1, Math.floor(cssW * dpr));
      off.height = Math.max(1, Math.floor(cssH * dpr));
      const o = off.getContext("2d");
      if (!o) return new Float32Array(0);
      o.scale(dpr, dpr);
      o.font = fontStr;
      if ("letterSpacing" in o) {
        try {
          (o as unknown as { letterSpacing: string }).letterSpacing = letterSpacing;
        } catch {
          // unsupported - ignore
        }
      }
      o.textBaseline = "middle";
      // 以 inline 容器左边缘为锚点绘制，让 magic / megick ✨ 共享同一起点
      o.textAlign = "left";
      o.fillStyle = "#fff";
      o.fillText(text, leftX, cssH / 2);
      const data = o.getImageData(0, 0, off.width, off.height).data;
      const collected: number[] = [];
      const w = off.width;
      const h = off.height;
      for (let yy = 0; yy < h; yy += step) {
        for (let xx = 0; xx < w; xx += step) {
          const idx = (yy * w + xx) * 4 + 3;
          if (data[idx] > 110) {
            collected.push(xx / dpr, yy / dpr);
          }
        }
      }
      return Float32Array.from(collected);
    };

    const setup = async () => {
      try {
        await (document as Document & { fonts?: { ready: Promise<unknown> } }).fonts?.ready;
      } catch {
        // ignore - fall back to whatever font is currently available
      }
      if (cancelled) return;

      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const rect = container.getBoundingClientRect();
      const containerW = Math.max(1, Math.floor(rect.width));
      const containerH = Math.max(1, Math.floor(rect.height));
      if (containerW < 12 || containerH < 12) return;

      // 让画布显著超出 inline 容器，避免粒子飞出后被裁切
      const padX = Math.round(containerW * paddingX);
      const padY = Math.round(containerH * paddingY);
      const cssW = containerW + padX * 2;
      const cssH = containerH + padY * 2;

      canvas.style.left = `${-padX}px`;
      canvas.style.top = `${-padY}px`;
      canvas.style.width = `${cssW}px`;
      canvas.style.height = `${cssH}px`;
      canvas.width = Math.floor(cssW * dpr);
      canvas.height = Math.floor(cssH * dpr);

      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.scale(dpr, dpr);

      const styles = getComputedStyle(container);
      const fontFamily = styles.fontFamily || "Inter, sans-serif";
      const fontWeight = styles.fontWeight || "700";
      const fontSize = parseFloat(styles.fontSize) || 56;
      const fontStyle = styles.fontStyle || "normal";
      const letterSpacing =
        styles.letterSpacing && styles.letterSpacing !== "normal" ? styles.letterSpacing : "0px";
      const fontStr = `${fontStyle} ${fontWeight} ${fontSize}px ${fontFamily}`;

      // 采样步长基于 device pixel 单位下的字号；越小越细腻
      const samplingStep = Math.max(2, Math.round((fontSize * dpr) / 44));
      const fromArr = samplePoints(
        from,
        cssW,
        cssH,
        dpr,
        fontStr,
        letterSpacing,
        samplingStep,
        padX,
      );
      const toArr = samplePoints(to, cssW, cssH, dpr, fontStr, letterSpacing, samplingStep, padX);

      const fromLen = fromArr.length / 2;
      const toLen = toArr.length / 2;
      if (fromLen === 0 || toLen === 0) return;

      const desiredCount = Math.max(particleCount, Math.max(fromLen, toLen));
      const N = Math.min(4500, desiredCount);

      // 准备打乱的索引序列，模拟从两个文字采样池中随机配对
      const fromOrder = shuffle(Array.from({ length: fromLen }, (_, i) => i));
      const toOrder = shuffle(Array.from({ length: toLen }, (_, i) => i));

      // 限制粒子飞舞振幅在 padding 内，避免飞出 canvas 或盖到下一行文字
      const swirlX = padX * 0.55;
      const swirlY = padY * 0.55;

      const particles: Particle[] = new Array(N);
      for (let i = 0; i < N; i++) {
        const fi = fromOrder[i % fromOrder.length] * 2;
        const ti = toOrder[i % toOrder.length] * 2;
        const ax = fromArr[fi];
        const ay = fromArr[fi + 1];
        const bx = toArr[ti];
        const by = toArr[ti + 1];
        // cx/cy 仅作为每个粒子飞舞时的"个性化随机方向"，不再用作两段式中转点
        const angle = Math.random() * Math.PI * 2;
        const rRoll = 0.4 + Math.random() * 0.6;
        particles[i] = {
          ax,
          ay,
          bx,
          by,
          cx: Math.cos(angle) * swirlX * rRoll,
          cy: Math.sin(angle) * swirlY * rRoll,
          hue: pickHue(),
          size: 0.45 + Math.random() * 0.85,
          delay: Math.random() * 0.42,
          phaseOffset: Math.random() * Math.PI * 2,
          twinkleSpeed: 0.0014 + Math.random() * 0.0026,
        };
      }

      setHydrated(true);

      const easeInOutCubic = (x: number) =>
        x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;

      const fadeInMs = 480;
      const settleMs = 1300;
      const cycle = startDelay + morphDuration + settleMs + loopGap;

      let cycleStart = performance.now();

      const reroll = () => {
        const fOrd = shuffle(fromOrder);
        const tOrd = shuffle(toOrder);
        for (let i = 0; i < particles.length; i++) {
          const p = particles[i];
          const fi = fOrd[i % fOrd.length] * 2;
          const ti = tOrd[i % tOrd.length] * 2;
          p.ax = fromArr[fi];
          p.ay = fromArr[fi + 1];
          p.bx = toArr[ti];
          p.by = toArr[ti + 1];
          const angle = Math.random() * Math.PI * 2;
          const rRoll = 0.4 + Math.random() * 0.6;
          p.cx = Math.cos(angle) * swirlX * rRoll;
          p.cy = Math.sin(angle) * swirlY * rRoll;
          p.hue = pickHue();
        }
      };

      const draw = (now: number) => {
        if (cancelled) return;

        let t = now - cycleStart;
        if (loop && t > cycle) {
          cycleStart = now;
          t = 0;
          reroll();
        }

        ctx.clearRect(0, 0, cssW, cssH);
        ctx.globalCompositeOperation = "lighter";

        const fadeIn = Math.min(1, t / fadeInMs);

        let phase: "showFrom" | "morph" | "showTo";
        let phaseT: number;

        if (t < startDelay) {
          phase = "showFrom";
          phaseT = t / Math.max(1, startDelay);
        } else if (t < startDelay + morphDuration) {
          phase = "morph";
          phaseT = (t - startDelay) / morphDuration;
        } else {
          phase = "showTo";
          phaseT = Math.min(1, (t - startDelay - morphDuration) / settleMs);
        }

        for (let i = 0; i < particles.length; i++) {
          const p = particles[i];
          const breathe = 0.78 + 0.22 * Math.sin(now * p.twinkleSpeed + p.phaseOffset);

          let x: number;
          let y: number;
          let alpha: number;
          let size: number;
          let hueShift = 0;

          if (phase === "showFrom") {
            const wobble = 0.55 + (1 - fadeIn) * 1.4;
            x = p.ax + Math.cos(now / 480 + p.phaseOffset) * wobble;
            y = p.ay + Math.sin(now / 480 + p.phaseOffset) * wobble;
            alpha = breathe * fadeIn;
            size = p.size * (0.6 + 0.4 * fadeIn);
          } else if (phase === "morph") {
            const local = Math.max(
              0,
              Math.min(1, (phaseT - p.delay * 0.45) / Math.max(0.05, 1 - p.delay * 0.45)),
            );
            const u = easeInOutCubic(local);
            // 主路径：每个粒子直接从 magic 字符位置流向 megick ✨ 字符位置
            const baseX = p.ax + (p.bx - p.ax) * u;
            const baseY = p.ay + (p.by - p.ay) * u;
            // 飞舞振幅曲线（在路径中段最大，起终点为 0）
            const burst = 4 * u * (1 - u);
            // 让每个粒子有自己的独立飞舞方向 + 时间相关漂浮
            const t1 = now / 260 + p.phaseOffset;
            const driftX = p.cx + Math.cos(t1) * swirlX * 0.35;
            const driftY = p.cy + Math.sin(t1) * swirlY * 0.35;
            x = baseX + driftX * burst;
            y = baseY + driftY * burst;
            alpha = (0.55 + 0.45 * burst) * breathe;
            size = p.size * (1 + burst * 0.7);
            hueShift = burst * 30;
          } else {
            const wobble = 0.5 + (1 - phaseT) * 2.2;
            x = p.bx + Math.cos(now / 520 + p.phaseOffset) * wobble;
            y = p.by + Math.sin(now / 520 + p.phaseOffset) * wobble;
            alpha = breathe * (0.85 + 0.15 * Math.sin(now / 720 + p.phaseOffset));
            size = p.size;
          }

          const hue = (p.hue + hueShift + 360) % 360;

          // 外发光（柔和大圈）
          ctx.fillStyle = `hsla(${hue}, 95%, 70%, ${alpha * 0.12})`;
          ctx.beginPath();
          ctx.arc(x, y, size * 3.2, 0, Math.PI * 2);
          ctx.fill();

          // 中层光晕
          ctx.fillStyle = `hsla(${hue}, 95%, 76%, ${alpha * 0.4})`;
          ctx.beginPath();
          ctx.arc(x, y, size * 1.7, 0, Math.PI * 2);
          ctx.fill();

          // 核心高光
          ctx.fillStyle = `hsla(${hue}, 100%, 90%, ${Math.min(1, alpha * 1.05)})`;
          ctx.beginPath();
          ctx.arc(x, y, size, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.globalCompositeOperation = "source-over";

        if (!loop && phase === "showTo" && phaseT >= 1) {
          // 一次性动画结束后保留低频闪烁，营造持续魔法感
          timeout = setTimeout(() => {
            timeout = null;
            raf = requestAnimationFrame(draw);
          }, 110);
          return;
        }

        raf = requestAnimationFrame(draw);
      };

      if (reduceMotion) {
        ctx.clearRect(0, 0, cssW, cssH);
        ctx.globalCompositeOperation = "lighter";
        for (const p of particles) {
          ctx.fillStyle = `hsla(${p.hue}, 95%, 80%, 0.9)`;
          ctx.beginPath();
          ctx.arc(p.bx, p.by, p.size, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalCompositeOperation = "source-over";
        return;
      }

      raf = requestAnimationFrame(draw);
    };

    setup();

    const ro = new ResizeObserver(() => {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        if (cancelled) return;
        clearLoops();
        setup();
      }, 220);
    });
    ro.observe(container);

    return () => {
      cancelled = true;
      if (resizeTimer) clearTimeout(resizeTimer);
      clearLoops();
      ro.disconnect();
    };
  }, [from, to, startDelay, morphDuration, particleCount, loop, loopGap, paddingX, paddingY]);

  return (
    <span
      ref={containerRef}
      className="relative inline-block"
      style={{
        verticalAlign: "baseline",
        whiteSpace: "nowrap",
        // 让粒子文字略大于其它正文，凸显魔法效果
        fontSize: `${scale}em`,
        lineHeight: 1,
        // 内联级别也要保证子元素溢出可见
        overflow: "visible",
      }}
    >
      <span aria-hidden="true" style={{ visibility: "hidden", whiteSpace: "nowrap" }}>
        {to}
      </span>

      <canvas
        ref={canvasRef}
        aria-hidden="true"
        style={{
          position: "absolute",
          // 实际尺寸/偏移在 setup 中根据容器动态写入
          left: 0,
          top: 0,
          pointerEvents: "none",
          opacity: hydrated ? 1 : 0,
          transition: "opacity 280ms ease",
        }}
      />

      <span
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          display: "block",
          whiteSpace: "nowrap",
          lineHeight: "inherit",
          opacity: hydrated ? 0 : 1,
          transition: "opacity 280ms ease",
          pointerEvents: "none",
          textAlign: "left",
          backgroundImage:
            "linear-gradient(135deg, oklch(0.72 0.16 48) 0%, oklch(0.9 0.11 96) 45%, oklch(0.8 0.17 82) 100%)",
          backgroundClip: "text",
          WebkitBackgroundClip: "text",
          color: "transparent",
          filter: "drop-shadow(0 0 18px oklch(0.84 0.16 88 / 0.18))",
        }}
      >
        <span
          style={{
            display: "inline-block",
            whiteSpace: "nowrap",
            verticalAlign: "baseline",
          }}
        >
          {from}
        </span>
      </span>

      <span className="sr-only">{to}</span>
    </span>
  );
}
