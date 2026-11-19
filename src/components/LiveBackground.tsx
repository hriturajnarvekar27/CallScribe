import React, { useEffect, useRef } from 'react';
import { LiveBackgroundMode, ThemeMode } from '../types';

interface LiveBackgroundProps {
  mode: LiveBackgroundMode;
  theme: ThemeMode;
}

function getThemeColors(theme: ThemeMode): {
  primary: string;
  secondary: string;
  tertiary: string;
  isDark: boolean;
} {
  const prefersDark =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches;
  const isDark =
    theme === 'dark' ||
    theme.startsWith('amoled-') ||
    (theme === 'system' && prefersDark);

  switch (theme) {
    case 'amoled-cyan':
      return {
        primary: '#00f0ff',
        secondary: '#3b82f6',
        tertiary: '#14b8a6',
        isDark: true,
      };
    case 'amoled-violet':
      return {
        primary: '#d946ef',
        secondary: '#8b5cf6',
        tertiary: '#ec4899',
        isDark: true,
      };
    case 'amoled-emerald':
      return {
        primary: '#10b981',
        secondary: '#06b6d4',
        tertiary: '#22c55e',
        isDark: true,
      };
    case 'light':
      return {
        primary: '#4f46e5',
        secondary: '#0ea5e9',
        tertiary: '#8b5cf6',
        isDark: false,
      };
    default:
      return {
        primary: '#6366f1',
        secondary: '#06b6d4',
        tertiary: '#8b5cf6',
        isDark,
      };
  }
}

function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function LiveBackground({ mode, theme }: LiveBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (mode !== 'waves' && mode !== 'particles') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const palette = getThemeColors(theme);
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let rafId = 0;
    let width = window.innerWidth;
    let height = window.innerHeight;
    let dpr = Math.min(window.devicePixelRatio || 1, 2);

    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    resize();
    window.addEventListener('resize', resize);

    // Particle seed state
    const particleCount = Math.min(48, Math.max(24, Math.floor((width * height) / 28000)));
    const particles = Array.from({ length: particleCount }, (_, idx) => ({
      x: Math.random() * width,
      y: Math.random() * height,
      vx: (Math.random() - 0.5) * 0.35,
      vy: (Math.random() - 0.5) * 0.35,
      radius: 1.3 + (idx % 3) * 0.65,
      color: idx % 3 === 0 ? palette.primary : idx % 3 === 1 ? palette.secondary : palette.tertiary,
    }));

    const startTime = performance.now();

    const drawWaves = (tSec: number) => {
      ctx.clearRect(0, 0, width, height);

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
            Math.sin(x * cfg.freq + tSec * cfg.speed) * cfg.amp +
            Math.cos(x * cfg.freq * 0.55 - tSec * cfg.speed * 0.7) * (cfg.amp * 0.45);
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

        // Crisp ribbon crest line
        ctx.beginPath();
        for (let x = 0; x <= width; x += 18) {
          const y =
            baseY +
            Math.sin(x * cfg.freq + tSec * cfg.speed) * cfg.amp +
            Math.cos(x * cfg.freq * 0.55 - tSec * cfg.speed * 0.7) * (cfg.amp * 0.45);
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = hexToRgba(cfg.color, Math.min(0.45, cfg.alpha * 1.8));
        ctx.lineWidth = 1.4;
        ctx.stroke();
      }
    };

    const drawParticles = (animate: boolean) => {
      ctx.clearRect(0, 0, width, height);

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        if (animate) {
          p.x += p.vx;
          p.y += p.vy;
          if (p.x < -10) p.x = width + 10;
          if (p.x > width + 10) p.x = -10;
          if (p.y < -10) p.y = height + 10;
          if (p.y > height + 10) p.y = -10;
        }

        // Draw links
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

    const tick = (now: number) => {
      const tSec = (now - startTime) / 1000;
      if (mode === 'waves') {
        drawWaves(tSec);
      } else {
        drawParticles(!reducedMotion);
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
    };
  }, [mode, theme]);

  if (mode === 'off') return null;

  const palette = getThemeColors(theme);

  if (mode === 'aurora') {
    const opacityMain = theme.startsWith('amoled-')
      ? 0.24
      : palette.isDark
        ? 0.18
        : 0.11;

    return (
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-0 overflow-hidden"
      >
        <div
          className="cs-aurora-1 absolute -top-[18%] -left-[12%] h-[62vw] max-h-[680px] w-[62vw] max-w-[680px] rounded-full blur-[110px]"
          style={{ backgroundColor: hexToRgba(palette.primary, opacityMain) }}
        />
        <div
          className="cs-aurora-2 absolute top-[22%] -right-[14%] h-[54vw] max-h-[620px] w-[54vw] max-w-[620px] rounded-full blur-[120px]"
          style={{ backgroundColor: hexToRgba(palette.secondary, opacityMain * 0.9) }}
        />
        <div
          className="cs-aurora-3 absolute -bottom-[20%] left-[25%] h-[50vw] max-h-[560px] w-[50vw] max-w-[560px] rounded-full blur-[120px]"
          style={{ backgroundColor: hexToRgba(palette.tertiary, opacityMain * 0.78) }}
        />
      </div>
    );
  }

  if (mode === 'grid') {
    const dotColor = palette.isDark
      ? 'rgba(255, 255, 255, 0.12)'
      : 'rgba(15, 23, 42, 0.1)';
    return (
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-0 overflow-hidden"
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
              palette.primary,
              theme.startsWith('amoled-') ? 0.22 : palette.isDark ? 0.16 : 0.1
            ),
          }}
        />
        <div
          className="cs-aurora-2 absolute right-[10%] bottom-[8%] h-[42vw] max-h-[480px] w-[42vw] max-w-[480px] rounded-full blur-[130px]"
          style={{
            backgroundColor: hexToRgba(
              palette.secondary,
              theme.startsWith('amoled-') ? 0.18 : palette.isDark ? 0.12 : 0.08
            ),
          }}
        />
      </div>
    );
  }

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-0 h-full w-full"
    />
  );
}
