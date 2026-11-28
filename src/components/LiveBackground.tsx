import React, { useEffect, useRef } from 'react';
import { DEFAULT_CUSTOM_BACKGROUND } from '../api';
import { resolveThemePalette } from '../hooks/useSettings';
import {
  CustomBackgroundConfig,
  CustomBackgroundPattern,
  LiveBackgroundMode,
  ThemeMode,
} from '../types';
import {
  createCritterScene,
  CritterMode,
  CritterScene,
  renderCritterScene,
  resizeCritterScene,
  stepCritterScene,
} from '../utils/liveCritters';

interface LiveBackgroundProps {
  mode: LiveBackgroundMode;
  theme: ThemeMode;
  opacityPercent?: number;
  speedMultiplier?: number;
  customConfig?: CustomBackgroundConfig;
}

function hexToRgba(hex: string, alpha: number): string {
  const raw = hex.trim().replace('#', '');
  const full =
    raw.length === 3
      ? raw
          .split('')
          .map((ch) => ch + ch)
          .join('')
      : raw;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) {
    return `rgba(99, 102, 241, ${alpha})`;
  }
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function isCritterMode(mode: LiveBackgroundMode): mode is CritterMode {
  return mode === 'pokemon' || mode === 'animals' || mode === 'aquarium';
}

function getPatternStyle(
  pattern: CustomBackgroundPattern,
  isDark: boolean,
  accentHex: string
): React.CSSProperties | null {
  if (pattern === 'none') return null;
  const line = isDark ? 'rgba(255, 255, 255, 0.09)' : 'rgba(15, 23, 42, 0.08)';
  const accentSoft = hexToRgba(accentHex, isDark ? 0.16 : 0.11);

  switch (pattern) {
    case 'dots':
      return {
        backgroundImage: `radial-gradient(${line} 1.15px, transparent 1.15px)`,
        backgroundSize: '24px 24px',
      };
    case 'grid':
      return {
        backgroundImage: `linear-gradient(to right, ${line} 1px, transparent 1px), linear-gradient(to bottom, ${line} 1px, transparent 1px)`,
        backgroundSize: '36px 36px',
      };
    case 'diagonal':
      return {
        backgroundImage: `repeating-linear-gradient(135deg, ${line} 0px, ${line} 1px, transparent 1px, transparent 14px)`,
      };
    case 'rings':
      return {
        backgroundImage: `repeating-radial-gradient(circle at 50% 42%, transparent 0, transparent 34px, ${accentSoft} 35px, transparent 36px)`,
      };
    default:
      return null;
  }
}

export function LiveBackground({
  mode,
  theme,
  opacityPercent = 100,
  speedMultiplier = 1,
  customConfig = DEFAULT_CUSTOM_BACKGROUND,
}: LiveBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const clampedOpacity = Math.max(0.2, Math.min(1, opacityPercent / 100));
  const clampedSpeed = Math.max(0.25, Math.min(2.0, speedMultiplier));
  const themePalette = resolveThemePalette(theme);

  const activeCanvasMode: string | null =
    mode === 'custom'
      ? customConfig.motion !== 'none' && customConfig.motion !== 'aurora'
        ? customConfig.motion
        : null
      : mode === 'waves' ||
          mode === 'particles' ||
          mode === 'starfield' ||
          mode === 'rain' ||
          mode === 'fireflies' ||
          mode === 'topography' ||
          isCritterMode(mode)
        ? mode
        : null;

  const canvasPalette =
    mode === 'custom'
      ? {
          primary: customConfig.primaryColor,
          secondary: customConfig.secondaryColor,
          tertiary: customConfig.tertiaryColor,
          isDark: themePalette.isDark,
        }
      : themePalette;

  useEffect(() => {
    if (!activeCanvasMode) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const palette = canvasPalette;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let rafId = 0;
    let width = window.innerWidth;
    let height = window.innerHeight;
    let dpr = Math.min(window.devicePixelRatio || 1, 2);

    const critterActive = isCritterMode(activeCanvasMode as LiveBackgroundMode);
    let critterScene: CritterScene | null = critterActive
      ? createCritterScene(activeCanvasMode as CritterMode, width, height, palette)
      : null;

    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (critterScene) {
        resizeCritterScene(critterScene, width, height);
      }
    };

    resize();
    window.addEventListener('resize', resize);

    // Neural particles seed
    const particleCount = Math.min(52, Math.max(24, Math.floor((width * height) / 26000)));
    const particles = Array.from({ length: particleCount }, (_, idx) => ({
      x: Math.random() * width,
      y: Math.random() * height,
      vx: (Math.random() - 0.5) * 0.42,
      vy: (Math.random() - 0.5) * 0.42,
      radius: 1.3 + (idx % 3) * 0.65,
      color: idx % 3 === 0 ? palette.primary : idx % 3 === 1 ? palette.secondary : palette.tertiary,
    }));

    // Starfield seed
    const starCount = Math.min(130, Math.max(60, Math.floor((width * height) / 14000)));
    const stars = Array.from({ length: starCount }, (_, idx) => ({
      x: Math.random() * width,
      y: Math.random() * height,
      z: 0.35 + Math.random() * 0.9,
      r: 0.75 + (idx % 4) * 0.42,
      phase: Math.random() * Math.PI * 2,
      color:
        idx % 5 === 0
          ? palette.primary
          : idx % 7 === 0
            ? palette.secondary
            : palette.isDark
              ? '#ffffff'
              : palette.tertiary,
    }));
    const shootingStars: { x: number; y: number; vx: number; vy: number; life: number; maxLife: number }[] = [];
    let nextShootTimer = 2.4;

    // Rain seed
    const rainCount = Math.min(100, Math.max(48, Math.floor(width / 16)));
    const raindrops = Array.from({ length: rainCount }, (_, idx) => ({
      x: Math.random() * (width + 180),
      y: Math.random() * height,
      len: 14 + (idx % 5) * 6,
      speed: 360 + (idx % 6) * 55,
      alpha: 0.14 + (idx % 4) * 0.06,
      color: idx % 3 === 0 ? palette.secondary : palette.primary,
    }));
    const ripples: { x: number; y: number; r: number; maxR: number; alpha: number; color: string }[] = [];

    // Fireflies seed
    const fireflyCount = Math.min(44, Math.max(22, Math.floor((width * height) / 36000)));
    const fireflies = Array.from({ length: fireflyCount }, (_, idx) => ({
      x: Math.random() * width,
      y: Math.random() * height,
      angle: Math.random() * Math.PI * 2,
      turnRate: (Math.random() - 0.5) * 0.8,
      speed: 14 + Math.random() * 18,
      size: 2.2 + (idx % 4) * 0.9,
      pulsePhase: Math.random() * Math.PI * 2,
      color: idx % 3 === 0 ? palette.primary : idx % 3 === 1 ? palette.tertiary : palette.secondary,
    }));

    const startTime = performance.now();
    let lastTime = startTime;

    const drawWaves = (tSec: number) => {
      ctx.clearRect(0, 0, width, height);
      const t = tSec * clampedSpeed;
      const waveConfigs = [
        { amp: 46, freq: 0.0028, speed: 0.45, yRatio: 0.34, color: palette.primary, alpha: palette.isDark ? 0.24 : 0.14 },
        { amp: 58, freq: 0.0021, speed: -0.34, yRatio: 0.52, color: palette.secondary, alpha: palette.isDark ? 0.2 : 0.11 },
        { amp: 38, freq: 0.0036, speed: 0.62, yRatio: 0.68, color: palette.tertiary, alpha: palette.isDark ? 0.18 : 0.1 },
        { amp: 28, freq: 0.0044, speed: -0.5, yRatio: 0.8, color: palette.primary, alpha: palette.isDark ? 0.14 : 0.08 },
      ];

      for (const cfg of waveConfigs) {
        const baseY = height * cfg.yRatio;
        ctx.beginPath();
        ctx.moveTo(0, height);
        for (let x = 0; x <= width; x += 18) {
          const y =
            baseY +
            Math.sin(x * cfg.freq + t * cfg.speed) * cfg.amp +
            Math.cos(x * cfg.freq * 0.55 - t * cfg.speed * 0.7) * (cfg.amp * 0.45);
          ctx.lineTo(x, y);
        }
        ctx.lineTo(width, height);
        ctx.closePath();

        const grad = ctx.createLinearGradient(0, baseY - cfg.amp, 0, height);
        grad.addColorStop(0, hexToRgba(cfg.color, cfg.alpha));
        grad.addColorStop(0.55, hexToRgba(cfg.color, cfg.alpha * 0.28));
        grad.addColorStop(1, 'transparent');
        ctx.fillStyle = grad;
        ctx.fill();

        ctx.beginPath();
        for (let x = 0; x <= width; x += 18) {
          const y =
            baseY +
            Math.sin(x * cfg.freq + t * cfg.speed) * cfg.amp +
            Math.cos(x * cfg.freq * 0.55 - t * cfg.speed * 0.7) * (cfg.amp * 0.45);
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = hexToRgba(cfg.color, Math.min(0.45, cfg.alpha * 1.8));
        ctx.lineWidth = 1.4;
        ctx.stroke();
      }
    };

    const drawParticles = (dt: number, animate: boolean) => {
      ctx.clearRect(0, 0, width, height);
      const stepFactor = dt * 60 * clampedSpeed;

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        if (animate) {
          p.x += p.vx * stepFactor;
          p.y += p.vy * stepFactor;
          if (p.x < -10) p.x = width + 10;
          if (p.x > width + 10) p.x = -10;
          if (p.y < -10) p.y = height + 10;
          if (p.y > height + 10) p.y = -10;
        }

        for (let j = i + 1; j < particles.length; j++) {
          const q = particles[j];
          const dx = p.x - q.x;
          const dy = p.y - q.y;
          const distSq = dx * dx + dy * dy;
          const maxDist = 155;
          if (distSq < maxDist * maxDist) {
            const ratio = 1 - Math.sqrt(distSq) / maxDist;
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(q.x, q.y);
            ctx.strokeStyle = hexToRgba(
              palette.primary,
              ratio * (palette.isDark ? 0.22 : 0.14)
            );
            ctx.lineWidth = 1;
            ctx.stroke();
          }
        }

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fillStyle = hexToRgba(p.color, palette.isDark ? 0.7 : 0.45);
        ctx.fill();
      }
    };

    const drawStarfield = (tSec: number, dt: number, animate: boolean) => {
      ctx.clearRect(0, 0, width, height);
      const step = dt * clampedSpeed;

      for (const s of stars) {
        if (animate) {
          s.x -= s.z * 8 * step;
          s.y += s.z * 2.5 * step;
          if (s.x < -4) s.x = width + 4;
          if (s.y > height + 4) s.y = -4;
        }
        const twinkle = 0.45 + 0.55 * Math.sin(tSec * 2.1 * clampedSpeed + s.phase);
        const alpha = (palette.isDark ? 0.85 : 0.55) * twinkle * (0.4 + s.z * 0.5);

        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fillStyle = s.color.startsWith('#') ? hexToRgba(s.color, alpha) : s.color;
        ctx.fill();

        if (s.r > 1.5 && twinkle > 0.82) {
          ctx.beginPath();
          ctx.arc(s.x, s.y, s.r * 2.8, 0, Math.PI * 2);
          ctx.fillStyle = hexToRgba(palette.primary, alpha * 0.18);
          ctx.fill();
        }
      }

      if (animate) {
        nextShootTimer -= step;
        if (nextShootTimer <= 0 && shootingStars.length < 2) {
          nextShootTimer = 3 + Math.random() * 5;
          shootingStars.push({
            x: width * (0.25 + Math.random() * 0.7),
            y: height * Math.random() * 0.35,
            vx: -380 - Math.random() * 180,
            vy: 150 + Math.random() * 90,
            life: 0,
            maxLife: 0.75,
          });
        }

        for (let i = shootingStars.length - 1; i >= 0; i--) {
          const st = shootingStars[i];
          st.life += step;
          st.x += st.vx * step;
          st.y += st.vy * step;
          if (st.life >= st.maxLife) {
            shootingStars.splice(i, 1);
            continue;
          }
          const fade = Math.sin((st.life / st.maxLife) * Math.PI);
          const tailX = st.x - st.vx * 0.14;
          const tailY = st.y - st.vy * 0.14;
          const grad = ctx.createLinearGradient(st.x, st.y, tailX, tailY);
          grad.addColorStop(0, hexToRgba(palette.primary, 0.8 * fade));
          grad.addColorStop(1, 'transparent');
          ctx.beginPath();
          ctx.moveTo(st.x, st.y);
          ctx.lineTo(tailX, tailY);
          ctx.strokeStyle = grad;
          ctx.lineWidth = 1.6;
          ctx.stroke();
        }
      }
    };

    const drawRain = (dt: number, animate: boolean) => {
      ctx.clearRect(0, 0, width, height);
      const step = dt * clampedSpeed;
      const windX = -88;

      for (const drop of raindrops) {
        if (animate) {
          drop.x += windX * step;
          drop.y += drop.speed * step;
          if (drop.y > height + 20) {
            if (ripples.length < 18 && Math.random() < 0.28) {
              ripples.push({
                x: Math.max(20, Math.min(width - 20, drop.x)),
                y: height * (0.72 + Math.random() * 0.24),
                r: 2,
                maxR: 18 + Math.random() * 20,
                alpha: palette.isDark ? 0.3 : 0.2,
                color: drop.color,
              });
            }
            drop.y = -25 - Math.random() * 60;
            drop.x = Math.random() * (width + 220);
          }
        }
        const dx = (windX / drop.speed) * drop.len;
        ctx.beginPath();
        ctx.moveTo(drop.x, drop.y);
        ctx.lineTo(drop.x + dx, drop.y + drop.len);
        ctx.strokeStyle = hexToRgba(drop.color, palette.isDark ? drop.alpha * 1.4 : drop.alpha);
        ctx.lineWidth = 1.1;
        ctx.stroke();
      }

      for (let i = ripples.length - 1; i >= 0; i--) {
        const rp = ripples[i];
        if (animate) {
          rp.r += 26 * step;
        }
        if (rp.r >= rp.maxR) {
          ripples.splice(i, 1);
          continue;
        }
        const fade = 1 - rp.r / rp.maxR;
        ctx.beginPath();
        ctx.ellipse(rp.x, rp.y, rp.r, rp.r * 0.35, 0, 0, Math.PI * 2);
        ctx.strokeStyle = hexToRgba(rp.color, rp.alpha * fade);
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    };

    const drawFireflies = (tSec: number, dt: number, animate: boolean) => {
      ctx.clearRect(0, 0, width, height);
      const step = dt * clampedSpeed;

      for (const ff of fireflies) {
        if (animate) {
          ff.angle += (ff.turnRate + Math.sin(tSec * 0.7 + ff.pulsePhase) * 0.45) * step;
          ff.x += Math.cos(ff.angle) * ff.speed * step;
          ff.y += Math.sin(ff.angle) * ff.speed * step;
          if (ff.x < -30) ff.x = width + 30;
          if (ff.x > width + 30) ff.x = -30;
          if (ff.y < -30) ff.y = height + 30;
          if (ff.y > height + 30) ff.y = -30;
        }

        const pulse = 0.45 + 0.55 * Math.sin(tSec * 1.8 * clampedSpeed + ff.pulsePhase);
        const haloRadius = ff.size * (5 + pulse * 4);
        const grad = ctx.createRadialGradient(ff.x, ff.y, 0, ff.x, ff.y, haloRadius);
        grad.addColorStop(0, hexToRgba(ff.color, (palette.isDark ? 0.55 : 0.36) * pulse));
        grad.addColorStop(0.4, hexToRgba(ff.color, (palette.isDark ? 0.16 : 0.1) * pulse));
        grad.addColorStop(1, 'transparent');

        ctx.beginPath();
        ctx.arc(ff.x, ff.y, haloRadius, 0, Math.PI * 2);
        ctx.fillStyle = grad;
        ctx.fill();

        ctx.beginPath();
        ctx.arc(ff.x, ff.y, ff.size * 0.75, 0, Math.PI * 2);
        ctx.fillStyle = hexToRgba(ff.color, palette.isDark ? 0.85 : 0.65);
        ctx.fill();
      }
    };

    const drawTopography = (tSec: number) => {
      ctx.clearRect(0, 0, width, height);
      const t = tSec * 0.35 * clampedSpeed;
      const lines = 14;
      for (let i = 0; i < lines; i++) {
        const ratio = i / (lines - 1);
        const baseY = height * (0.08 + ratio * 0.86);
        const color = i % 3 === 0 ? palette.primary : i % 3 === 1 ? palette.secondary : palette.tertiary;
        const alpha = palette.isDark ? 0.15 : 0.11;

        ctx.beginPath();
        for (let x = 0; x <= width; x += 22) {
          const wave1 = Math.sin(x * 0.0026 + t + i * 0.45) * 34;
          const wave2 = Math.cos(x * 0.0052 - t * 0.7 + i * 0.8) * 16;
          const y = baseY + wave1 + wave2;
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = hexToRgba(color, alpha);
        ctx.lineWidth = 1.15;
        ctx.stroke();
      }
    };

    const tick = (now: number) => {
      const tSec = (now - startTime) / 1000;
      const dt = Math.min(0.05, Math.max(0, (now - lastTime) / 1000));
      lastTime = now;

      if (activeCanvasMode === 'waves') {
        drawWaves(tSec);
      } else if (activeCanvasMode === 'starfield') {
        drawStarfield(tSec, dt, !reducedMotion);
      } else if (activeCanvasMode === 'rain') {
        drawRain(dt, !reducedMotion);
      } else if (activeCanvasMode === 'fireflies') {
        drawFireflies(tSec, dt, !reducedMotion);
      } else if (activeCanvasMode === 'topography') {
        drawTopography(tSec);
      } else if (critterScene) {
        if (!reducedMotion) {
          stepCritterScene(critterScene, dt * clampedSpeed, palette);
        }
        renderCritterScene(ctx, critterScene, palette, tSec * clampedSpeed);
      } else {
        drawParticles(dt, !reducedMotion);
      }

      if (!reducedMotion) {
        rafId = requestAnimationFrame(tick);
      }
    };

    if (reducedMotion) {
      tick(startTime);
    } else {
      rafId = requestAnimationFrame(tick);
    }

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', resize);
      critterScene = null;
    };
  }, [activeCanvasMode, canvasPalette, clampedSpeed]);

  if (mode === 'off') return null;

  if (mode === 'aurora') {
    const opacityMain =
      (theme.startsWith('amoled-') ? 0.24 : themePalette.isDark ? 0.18 : 0.11) * clampedOpacity;

    return (
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-0 overflow-hidden"
        style={{ opacity: clampedOpacity }}
      >
        <div
          className="cs-aurora-1 absolute -top-[18%] -left-[12%] h-[62vw] max-h-[680px] w-[62vw] max-w-[680px] rounded-full blur-[110px]"
          style={{
            backgroundColor: hexToRgba(themePalette.primary, opacityMain),
            animationDuration: `${(18 / clampedSpeed).toFixed(1)}s`,
          }}
        />
        <div
          className="cs-aurora-2 absolute top-[22%] -right-[14%] h-[54vw] max-h-[620px] w-[54vw] max-w-[620px] rounded-full blur-[120px]"
          style={{
            backgroundColor: hexToRgba(themePalette.secondary, opacityMain * 0.9),
            animationDuration: `${(23 / clampedSpeed).toFixed(1)}s`,
          }}
        />
        <div
          className="cs-aurora-3 absolute -bottom-[20%] left-[25%] h-[50vw] max-h-[560px] w-[50vw] max-w-[560px] rounded-full blur-[120px]"
          style={{
            backgroundColor: hexToRgba(themePalette.tertiary, opacityMain * 0.78),
            animationDuration: `${(28 / clampedSpeed).toFixed(1)}s`,
          }}
        />
      </div>
    );
  }

  if (mode === 'grid') {
    const dotColor = themePalette.isDark
      ? 'rgba(255, 255, 255, 0.12)'
      : 'rgba(15, 23, 42, 0.1)';
    return (
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-0 overflow-hidden"
        style={{ opacity: clampedOpacity }}
      >
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: `radial-gradient(${dotColor} 1px, transparent 1px)`,
            backgroundSize: '28px 28px',
          }}
        />
        <div
          className="cs-aurora-1 absolute top-[8%] left-[18%] h-[55vw] max-h-[600px] w-[55vw] max-w-[600px] rounded-full blur-[130px]"
          style={{
            backgroundColor: hexToRgba(
              themePalette.primary,
              theme.startsWith('amoled-') ? 0.22 : themePalette.isDark ? 0.16 : 0.1
            ),
            animationDuration: `${(18 / clampedSpeed).toFixed(1)}s`,
          }}
        />
        <div
          className="cs-aurora-2 absolute right-[10%] bottom-[8%] h-[42vw] max-h-[480px] w-[42vw] max-w-[480px] rounded-full blur-[130px]"
          style={{
            backgroundColor: hexToRgba(
              themePalette.secondary,
              theme.startsWith('amoled-') ? 0.18 : themePalette.isDark ? 0.12 : 0.08
            ),
            animationDuration: `${(23 / clampedSpeed).toFixed(1)}s`,
          }}
        />
      </div>
    );
  }

  if (mode === 'custom') {
    const patternStyle = getPatternStyle(
      customConfig.pattern,
      themePalette.isDark,
      customConfig.primaryColor
    );
    const hasImage = customConfig.baseStyle === 'image' && Boolean(customConfig.imageDataUrl);
    const washAlpha = themePalette.isDark ? 0.34 : 0.22;

    const baseBgStyle: React.CSSProperties =
      customConfig.baseStyle === 'solid'
        ? { backgroundColor: hexToRgba(customConfig.primaryColor, washAlpha * 1.15) }
        : customConfig.baseStyle === 'radial'
          ? {
              backgroundImage: `radial-gradient(circle at 22% 20%, ${hexToRgba(customConfig.primaryColor, washAlpha * 1.25)}, transparent 55%), radial-gradient(circle at 82% 28%, ${hexToRgba(customConfig.secondaryColor, washAlpha)}, transparent 52%), radial-gradient(circle at 52% 84%, ${hexToRgba(customConfig.tertiaryColor, washAlpha * 0.95)}, transparent 58%)`,
            }
          : {
              backgroundImage: `linear-gradient(${customConfig.angleDeg}deg, ${hexToRgba(customConfig.primaryColor, washAlpha)}, ${hexToRgba(customConfig.secondaryColor, washAlpha * 0.85)}, ${hexToRgba(customConfig.tertiaryColor, washAlpha * 0.78)})`,
            };

    return (
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-0 overflow-hidden"
        style={{ opacity: clampedOpacity }}
      >
        {hasImage ? (
          <>
            <img
              src={customConfig.imageDataUrl}
              alt=""
              referrerPolicy="no-referrer"
              className="absolute inset-0 h-full w-full scale-105 object-cover"
              style={{
                filter:
                  customConfig.imageBlurPx > 0
                    ? `blur(${customConfig.imageBlurPx}px)`
                    : undefined,
              }}
            />
            <div
              className="absolute inset-0"
              style={{
                backgroundColor: themePalette.isDark
                  ? `rgba(0, 0, 0, ${customConfig.imageDimPercent / 100})`
                  : `rgba(255, 255, 255, ${customConfig.imageDimPercent / 100})`,
              }}
            />
          </>
        ) : (
          <div className="absolute inset-0" style={baseBgStyle} />
        )}

        {patternStyle && <div className="absolute inset-0" style={patternStyle} />}

        {customConfig.motion === 'aurora' && (
          <>
            <div
              className="cs-aurora-1 absolute -top-[16%] -left-[10%] h-[58vw] max-h-[620px] w-[58vw] max-w-[620px] rounded-full blur-[110px]"
              style={{
                backgroundColor: hexToRgba(customConfig.primaryColor, 0.25),
                animationDuration: `${(18 / clampedSpeed).toFixed(1)}s`,
              }}
            />
            <div
              className="cs-aurora-2 absolute top-[24%] -right-[12%] h-[50vw] max-h-[560px] w-[50vw] max-w-[560px] rounded-full blur-[120px]"
              style={{
                backgroundColor: hexToRgba(customConfig.secondaryColor, 0.22),
                animationDuration: `${(23 / clampedSpeed).toFixed(1)}s`,
              }}
            />
            <div
              className="cs-aurora-3 absolute -bottom-[18%] left-[24%] h-[46vw] max-h-[520px] w-[46vw] max-w-[520px] rounded-full blur-[120px]"
              style={{
                backgroundColor: hexToRgba(customConfig.tertiaryColor, 0.2),
                animationDuration: `${(28 / clampedSpeed).toFixed(1)}s`,
              }}
            />
          </>
        )}

        {activeCanvasMode && (
          <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
        )}
      </div>
    );
  }

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-0 h-full w-full"
      style={{ opacity: clampedOpacity }}
    />
  );
}
