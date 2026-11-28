import { LiveBackgroundMode } from '../types';

export type CritterMode = Extract<LiveBackgroundMode, 'pokemon' | 'animals' | 'aquarium'>;

export interface ThemePalette {
  primary: string;
  secondary: string;
  tertiary: string;
  isDark: boolean;
}

type PokemonSpecies =
  | 'sparkmouse'
  | 'flamelizard'
  | 'bubbleturtle'
  | 'leafbuddy'
  | 'melonpuff'
  | 'fluffkit';

type AnimalSpecies = 'bunny' | 'kitty' | 'shiba' | 'fox' | 'duckling' | 'butterfly';

type AquariumSpecies = 'koi' | 'seaturtle' | 'pondduck';

type CritterSpecies = PokemonSpecies | AnimalSpecies | AquariumSpecies;

interface CritterEntity {
  id: number;
  species: CritterSpecies;
  variant: number;
  x: number;
  y: number;
  baseY: number;
  vx: number;
  vy: number;
  dir: 1 | -1;
  scale: number;
  phase: number;
  hopTimer: number;
  hopDuration: number;
  hopCooldown: number;
  blinkTimer: number;
  particleCooldown: number;
  swimWaveAmp: number;
  swimWaveFreq: number;
}

interface AmbientMote {
  kind: 'spark' | 'ember' | 'bubble' | 'leaf' | 'note' | 'heart' | 'ripple';
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  life: number;
  maxLife: number;
  color: string;
  rotation: number;
}

export interface CritterScene {
  mode: CritterMode;
  width: number;
  height: number;
  critters: CritterEntity[];
  motes: AmbientMote[];
  stars: { x: number; y: number; r: number; phase: number; color: string }[];
  nextId: number;
}

function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function randRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function pickLaneY(height: number, index: number, total: number, isFlyerOrTop: boolean): number {
  if (isFlyerOrTop) {
    return randRange(height * 0.1, height * 0.48);
  }
  // Distribute nicely across bottom, lower-mid, and upper-mid bands so critters peek around UI cards
  const bands = [0.16, 0.32, 0.52, 0.72, 0.86, 0.92];
  const base = bands[index % bands.length] ?? ((index + 0.5) / Math.max(1, total));
  return Math.max(48, Math.min(height - 34, height * base + randRange(-24, 24)));
}

export function createCritterScene(
  mode: CritterMode,
  width: number,
  height: number,
  palette: ThemePalette
): CritterScene {
  const critters: CritterEntity[] = [];
  let speciesPool: CritterSpecies[] = [];

  if (mode === 'pokemon') {
    speciesPool = [
      'sparkmouse',
      'flamelizard',
      'bubbleturtle',
      'leafbuddy',
      'melonpuff',
      'fluffkit',
      'sparkmouse',
      'melonpuff',
      'bubbleturtle',
      'fluffkit',
    ];
  } else if (mode === 'animals') {
    speciesPool = [
      'bunny',
      'kitty',
      'shiba',
      'fox',
      'duckling',
      'butterfly',
      'bunny',
      'butterfly',
      'kitty',
      'shiba',
      'butterfly',
    ];
  } else {
    speciesPool = [
      'koi',
      'seaturtle',
      'pondduck',
      'koi',
      'seaturtle',
      'koi',
      'pondduck',
      'koi',
      'seaturtle',
    ];
  }

  const count = width < 768 ? Math.min(speciesPool.length, 7) : speciesPool.length;
  for (let i = 0; i < count; i++) {
    const species = speciesPool[i];
    const dir: 1 | -1 = i % 2 === 0 ? 1 : -1;
    const isTop = species === 'butterfly' || species === 'melonpuff';
    const baseY = pickLaneY(height, i, count, isTop);
    const speedBase =
      species === 'butterfly'
        ? randRange(24, 38)
        : species === 'koi'
          ? randRange(22, 36)
          : species === 'seaturtle'
            ? randRange(15, 25)
            : species === 'bunny'
              ? randRange(26, 36)
              : randRange(18, 30);

    critters.push({
      id: i + 1,
      species,
      variant: i % 3,
      x: ((i + 0.5) / count) * width + randRange(-40, 40),
      y: baseY,
      baseY,
      vx: speedBase * dir,
      vy: 0,
      dir,
      scale: randRange(0.84, 1.12),
      phase: randRange(0, Math.PI * 2),
      hopTimer: 0,
      hopDuration: species === 'bunny' ? 0.55 : 0.45,
      hopCooldown: randRange(0.8, 3.8),
      blinkTimer: randRange(1.5, 5.5),
      particleCooldown: randRange(0.5, 2.2),
      swimWaveAmp: randRange(10, 26),
      swimWaveFreq: randRange(0.7, 1.35),
    });
  }

  const stars = Array.from({ length: 22 }, (_, i) => ({
    x: Math.random() * width,
    y: Math.random() * height,
    r: 1 + (i % 3) * 0.7,
    phase: randRange(0, Math.PI * 2),
    color: i % 3 === 0 ? palette.primary : i % 3 === 1 ? palette.secondary : palette.tertiary,
  }));

  const initialMotes: AmbientMote[] = [];
  if (mode === 'aquarium') {
    for (let i = 0; i < 18; i++) {
      initialMotes.push({
        kind: 'bubble',
        x: Math.random() * width,
        y: Math.random() * height,
        vx: randRange(-4, 4),
        vy: randRange(-24, -12),
        size: randRange(2.5, 6.5),
        life: randRange(0, 4),
        maxLife: randRange(5, 9),
        color: palette.secondary,
        rotation: 0,
      });
    }
  }

  return {
    mode,
    width,
    height,
    critters,
    motes: initialMotes,
    stars,
    nextId: count + 1,
  };
}

export function resizeCritterScene(scene: CritterScene, width: number, height: number): void {
  const prevW = Math.max(1, scene.width);
  const prevH = Math.max(1, scene.height);
  const sx = width / prevW;
  const sy = height / prevH;

  scene.width = width;
  scene.height = height;

  for (const c of scene.critters) {
    c.x *= sx;
    c.baseY = Math.max(42, Math.min(height - 30, c.baseY * sy));
    c.y = c.baseY;
  }
  for (const s of scene.stars) {
    s.x *= sx;
    s.y *= sy;
  }
}

export function stepCritterScene(
  scene: CritterScene,
  dt: number,
  palette: ThemePalette
): void {
  const { width, height, critters, motes } = scene;

  for (const c of critters) {
    c.phase += dt * (c.species === 'butterfly' ? 9.5 : 5.2);
    c.x += c.vx * dt;

    // Gentle wrap around horizontal bounds
    const pad = 64;
    if (c.dir === 1 && c.x > width + pad) {
      c.x = -pad;
      c.baseY = Math.max(48, Math.min(height - 34, c.baseY + randRange(-36, 36)));
    } else if (c.dir === -1 && c.x < -pad) {
      c.x = width + pad;
      c.baseY = Math.max(48, Math.min(height - 34, c.baseY + randRange(-36, 36)));
    }

    // Blink countdown
    c.blinkTimer -= dt;
    if (c.blinkTimer <= -0.14) {
      c.blinkTimer = randRange(2.4, 6.2);
    }

    // Vertical locomotion per archetype
    if (c.species === 'melonpuff' || c.species === 'butterfly') {
      c.y = c.baseY + Math.sin(c.phase * 0.45) * (c.species === 'butterfly' ? 20 : 14);
    } else if (c.species === 'koi' || c.species === 'seaturtle' || c.species === 'pondduck') {
      const freq = c.species === 'pondduck' ? 0.5 : c.swimWaveFreq;
      const amp = c.species === 'pondduck' ? 4 : c.swimWaveAmp;
      c.y = c.baseY + Math.sin(c.phase * 0.38 * freq) * amp;
    } else {
      // Ground walkers with periodic cute hops
      if (c.hopTimer > 0) {
        c.hopTimer = Math.max(0, c.hopTimer - dt);
        const p = 1 - c.hopTimer / c.hopDuration;
        const hopHeight = c.species === 'bunny' ? 22 : 14;
        c.y = c.baseY - Math.sin(p * Math.PI) * hopHeight;
      } else {
        c.hopCooldown -= dt;
        if (c.hopCooldown <= 0) {
          c.hopTimer = c.hopDuration;
          c.hopCooldown = c.species === 'bunny' ? randRange(0.45, 1.35) : randRange(2.2, 5.8);
        }
        c.y = c.baseY - Math.abs(Math.sin(c.phase * 1.15)) * 2.2;
      }
    }

    // Emit playful ambient motes
    c.particleCooldown -= dt;
    if (c.particleCooldown <= 0 && motes.length < 75) {
      if (c.species === 'sparkmouse') {
        c.particleCooldown = randRange(1.4, 2.8);
        motes.push({
          kind: 'spark',
          x: c.x + randRange(-8, 8),
          y: c.y - 18 * c.scale,
          vx: randRange(-12, 12),
          vy: randRange(-20, -8),
          size: randRange(4, 6.5),
          life: 0,
          maxLife: randRange(0.9, 1.4),
          color: '#fde047',
          rotation: randRange(0, Math.PI),
        });
      } else if (c.species === 'flamelizard') {
        c.particleCooldown = randRange(0.7, 1.5);
        motes.push({
          kind: 'ember',
          x: c.x - c.dir * 18 * c.scale,
          y: c.y - 10 * c.scale,
          vx: randRange(-8, 8),
          vy: randRange(-26, -14),
          size: randRange(2.2, 3.8),
          life: 0,
          maxLife: randRange(0.9, 1.5),
          color: '#fb923c',
          rotation: 0,
        });
      } else if (c.species === 'bubbleturtle') {
        c.particleCooldown = randRange(1.2, 2.4);
        motes.push({
          kind: 'bubble',
          x: c.x + c.dir * 14 * c.scale,
          y: c.y - 12 * c.scale,
          vx: c.dir * randRange(4, 10),
          vy: randRange(-22, -12),
          size: randRange(3, 5.5),
          life: 0,
          maxLife: randRange(1.8, 2.8),
          color: '#7dd3fc',
          rotation: 0,
        });
      } else if (c.species === 'leafbuddy') {
        c.particleCooldown = randRange(1.8, 3.2);
        motes.push({
          kind: 'leaf',
          x: c.x,
          y: c.y - 18 * c.scale,
          vx: randRange(-14, 6),
          vy: randRange(-14, -4),
          size: randRange(4, 6),
          life: 0,
          maxLife: randRange(1.6, 2.4),
          color: '#4ade80',
          rotation: randRange(0, Math.PI * 2),
        });
      } else if (c.species === 'melonpuff') {
        c.particleCooldown = randRange(1.8, 3.4);
        motes.push({
          kind: 'note',
          x: c.x + randRange(-6, 8),
          y: c.y - 18 * c.scale,
          vx: randRange(-6, 10),
          vy: randRange(-20, -10),
          size: randRange(8, 11),
          life: 0,
          maxLife: randRange(1.6, 2.3),
          color: '#f472b6',
          rotation: randRange(-0.2, 0.2),
        });
      } else if (c.species === 'kitty' || c.species === 'shiba' || c.species === 'bunny') {
        c.particleCooldown = randRange(3.2, 6.0);
        motes.push({
          kind: 'heart',
          x: c.x + c.dir * 6 * c.scale,
          y: c.y - 22 * c.scale,
          vx: randRange(-5, 5),
          vy: randRange(-18, -10),
          size: randRange(4.5, 6),
          life: 0,
          maxLife: randRange(1.3, 1.9),
          color: '#fb7185',
          rotation: 0,
        });
      } else if (c.species === 'koi' || c.species === 'pondduck') {
        c.particleCooldown = randRange(1.0, 2.0);
        motes.push({
          kind: 'ripple',
          x: c.x - c.dir * 10 * c.scale,
          y: c.y + 4,
          vx: 0,
          vy: 0,
          size: 5,
          life: 0,
          maxLife: 1.8,
          color: palette.secondary,
          rotation: 0,
        });
      } else {
        c.particleCooldown = 3.0;
      }
    }
  }

  // Keep aquarium bubbles replenished
  if (scene.mode === 'aquarium' && motes.filter((m) => m.kind === 'bubble').length < 16) {
    motes.push({
      kind: 'bubble',
      x: Math.random() * width,
      y: height + 10,
      vx: randRange(-4, 4),
      vy: randRange(-26, -14),
      size: randRange(2.5, 6),
      life: 0,
      maxLife: randRange(6, 10),
      color: palette.secondary,
      rotation: 0,
    });
  }

  for (let i = motes.length - 1; i >= 0; i--) {
    const m = motes[i];
    m.life += dt;
    if (m.life >= m.maxLife) {
      motes.splice(i, 1);
      continue;
    }
    m.x += m.vx * dt;
    m.y += m.vy * dt;
    if (m.kind === 'leaf') {
      m.x += Math.sin(m.life * 3.5) * 12 * dt;
      m.rotation += dt * 1.4;
    } else if (m.kind === 'bubble') {
      m.x += Math.sin(m.life * 2.5 + m.size) * 8 * dt;
    } else if (m.kind === 'ripple') {
      m.size += dt * 18;
    }
  }
}

function drawEllipse(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  rx: number,
  ry: number,
  rot = 0
) {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
}

function drawCuteEye(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  blinking: boolean,
  irisColor = '#18181b'
) {
  if (blinking) {
    ctx.beginPath();
    ctx.arc(x, y + 0.5, r, Math.PI * 0.12, Math.PI * 0.88);
    ctx.strokeStyle = irisColor;
    ctx.lineWidth = 1.6;
    ctx.lineCap = 'round';
    ctx.stroke();
    return;
  }
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = irisColor;
  ctx.fill();

  ctx.beginPath();
  ctx.arc(x - r * 0.3, y - r * 0.32, r * 0.36, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
}

function drawGroundShadow(
  ctx: CanvasRenderingContext2D,
  x: number,
  groundY: number,
  rx: number,
  airborneOffset: number,
  isDark: boolean
) {
  const factor = Math.max(0.45, 1 - airborneOffset / 34);
  ctx.beginPath();
  ctx.ellipse(x, groundY + 12, rx * factor, 3.2 * factor, 0, 0, Math.PI * 2);
  ctx.fillStyle = isDark ? 'rgba(0, 0, 0, 0.32)' : 'rgba(15, 23, 42, 0.1)';
  ctx.fill();
}

function drawSparkMouse(
  ctx: CanvasRenderingContext2D,
  c: CritterEntity,
  blinking: boolean,
  outline: string
) {
  const step = Math.sin(c.phase * 1.4);
  const earTwitch = Math.sin(c.phase * 0.8) * 0.08;
  const tailWag = Math.sin(c.phase * 1.6) * 0.18;

  // Lightning bolt tail
  ctx.save();
  ctx.translate(-10, 4);
  ctx.rotate(-0.35 + tailWag);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(-7, -3);
  ctx.lineTo(-5, -8);
  ctx.lineTo(-14, -12);
  ctx.lineTo(-11, -17);
  ctx.lineTo(-20, -21);
  ctx.lineTo(-14, -11);
  ctx.lineTo(-9, -7);
  ctx.closePath();
  ctx.fillStyle = '#facc15';
  ctx.fill();
  ctx.strokeStyle = outline;
  ctx.lineWidth = 1.1;
  ctx.stroke();
  ctx.restore();

  // Back ear
  ctx.save();
  ctx.translate(4, -13);
  ctx.rotate(0.28 + earTwitch);
  drawEllipse(ctx, 0, -7, 3.2, 8.5);
  ctx.fillStyle = '#fde047';
  ctx.fill();
  ctx.strokeStyle = outline;
  ctx.lineWidth = 1.1;
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(0, -12.5, 2.2, 3.4, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#27272a';
  ctx.fill();
  ctx.restore();

  // Body
  drawEllipse(ctx, -1, 3, 11.5, 10);
  ctx.fillStyle = '#fde047';
  ctx.fill();
  ctx.strokeStyle = outline;
  ctx.lineWidth = 1.2;
  ctx.stroke();

  // Cute brown back stripes
  ctx.beginPath();
  ctx.roundRect(-9, -1, 5.5, 2.4, 1);
  ctx.roundRect(-8.5, 3.2, 4.8, 2.2, 1);
  ctx.fillStyle = '#92400e';
  ctx.fill();

  // Little feet
  drawEllipse(ctx, -4 + step * 2, 12, 3.6, 2.1);
  ctx.fillStyle = '#facc15';
  ctx.fill();
  drawEllipse(ctx, 5 - step * 2, 12, 3.6, 2.1);
  ctx.fill();

  // Head
  ctx.beginPath();
  ctx.arc(4.5, -7, 9.2, 0, Math.PI * 2);
  ctx.fillStyle = '#fde047';
  ctx.fill();
  ctx.strokeStyle = outline;
  ctx.lineWidth = 1.2;
  ctx.stroke();

  // Front ear
  ctx.save();
  ctx.translate(1.5, -14);
  ctx.rotate(-0.36 - earTwitch);
  drawEllipse(ctx, 0, -7, 3.3, 9);
  ctx.fillStyle = '#fde047';
  ctx.fill();
  ctx.strokeStyle = outline;
  ctx.lineWidth = 1.1;
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(0, -12.8, 2.3, 3.5, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#27272a';
  ctx.fill();
  ctx.restore();

  // Rosy electric cheeks
  ctx.beginPath();
  ctx.arc(8.5, -4.5, 2.6, 0, Math.PI * 2);
  ctx.fillStyle = '#ef4444';
  ctx.fill();

  // Eye & tiny nose
  drawCuteEye(ctx, 9, -8.3, 1.9, blinking);
  ctx.beginPath();
  ctx.arc(13.1, -6.5, 1, 0, Math.PI * 2);
  ctx.fillStyle = '#27272a';
  ctx.fill();
}

function drawFlameLizard(
  ctx: CanvasRenderingContext2D,
  c: CritterEntity,
  blinking: boolean,
  outline: string
) {
  const step = Math.sin(c.phase * 1.35);
  const flicker = Math.sin(c.phase * 3.8);

  // Tail + flickering flame
  ctx.beginPath();
  ctx.moveTo(-8, 6);
  ctx.quadraticCurveTo(-18, 6, -19, -5);
  ctx.quadraticCurveTo(-16, -5, -13, 2);
  ctx.closePath();
  ctx.fillStyle = '#fb923c';
  ctx.fill();
  ctx.strokeStyle = outline;
  ctx.lineWidth = 1.1;
  ctx.stroke();

  // Flame outer
  ctx.beginPath();
  ctx.moveTo(-19, -4);
  ctx.quadraticCurveTo(-24 - flicker * 1.4, -10, -19 + flicker * 0.9, -17);
  ctx.quadraticCurveTo(-14 + flicker * 1.1, -10, -19, -4);
  ctx.fillStyle = '#f97316';
  ctx.fill();

  // Flame core
  ctx.beginPath();
  ctx.ellipse(-19 + flicker * 0.4, -9, 2.3, 3.8, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#fde047';
  ctx.fill();

  // Body
  drawEllipse(ctx, -1, 3, 10, 10.5, -0.1);
  ctx.fillStyle = '#fb923c';
  ctx.fill();
  ctx.strokeStyle = outline;
  ctx.lineWidth = 1.2;
  ctx.stroke();

  // Cream belly
  drawEllipse(ctx, 3.2, 4, 5.2, 7.6, -0.1);
  ctx.fillStyle = '#fef3c7';
  ctx.fill();

  // Feet
  drawEllipse(ctx, -4 + step * 2.2, 12.2, 3.8, 2.2);
  ctx.fillStyle = '#fb923c';
  ctx.fill();
  drawEllipse(ctx, 4.5 - step * 2.2, 12.2, 3.8, 2.2);
  ctx.fill();

  // Head
  drawEllipse(ctx, 4.5, -8.5, 8.8, 7.8, 0.08);
  ctx.fillStyle = '#fb923c';
  ctx.fill();
  ctx.strokeStyle = outline;
  ctx.lineWidth = 1.2;
  ctx.stroke();

  // Little arm
  drawEllipse(ctx, 6.5, 2, 3.4, 2, 0.35);
  ctx.fillStyle = '#fb923c';
  ctx.fill();

  drawCuteEye(ctx, 7.8, -9.5, 2.1, blinking, '#0f766e');
  ctx.beginPath();
  ctx.arc(12.2, -8, 0.9, 0, Math.PI * 2);
  ctx.fillStyle = '#7c2d12';
  ctx.fill();
}

function drawBubbleTurtle(
  ctx: CanvasRenderingContext2D,
  c: CritterEntity,
  blinking: boolean,
  outline: string
) {
  const step = Math.sin(c.phase * 1.3);
  const tailBob = Math.sin(c.phase * 1.5) * 1.5;

  // Curled wave tail
  ctx.beginPath();
  ctx.arc(-13, 3 + tailBob * 0.3, 6.2, 0, Math.PI * 2);
  ctx.fillStyle = '#93c5fd';
  ctx.fill();
  ctx.strokeStyle = outline;
  ctx.lineWidth = 1.1;
  ctx.stroke();

  // Chestnut shell back
  drawEllipse(ctx, -3, 2, 9.5, 10.5, -0.15);
  ctx.fillStyle = '#92400e';
  ctx.fill();
  ctx.strokeStyle = outline;
  ctx.lineWidth = 1.2;
  ctx.stroke();

  // Cream shell rim
  drawEllipse(ctx, 1.5, 2.8, 6.2, 9.4, -0.1);
  ctx.fillStyle = '#fef3c7';
  ctx.fill();

  // Blue body front
  drawEllipse(ctx, 3.5, 3, 5.5, 8.2);
  ctx.fillStyle = '#60a5fa';
  ctx.fill();

  // Feet
  drawEllipse(ctx, -3 + step * 2.1, 12.2, 3.6, 2.2);
  ctx.fillStyle = '#60a5fa';
  ctx.fill();
  drawEllipse(ctx, 5 - step * 2.1, 12.2, 3.6, 2.2);
  ctx.fill();

  // Round head
  ctx.beginPath();
  ctx.arc(5, -8.5, 8.6, 0, Math.PI * 2);
  ctx.fillStyle = '#60a5fa';
  ctx.fill();
  ctx.strokeStyle = outline;
  ctx.lineWidth = 1.2;
  ctx.stroke();

  // Little arm
  drawEllipse(ctx, 8, 1.8, 3.2, 2, 0.25);
  ctx.fillStyle = '#60a5fa';
  ctx.fill();

  drawCuteEye(ctx, 8.5, -9.2, 2.0, blinking, '#7f1d1d');
  // Happy smile
  ctx.beginPath();
  ctx.arc(9.8, -5.8, 3.2, 0.1, Math.PI * 0.72);
  ctx.strokeStyle = '#1e3a8a';
  ctx.lineWidth = 1.1;
  ctx.stroke();
}

function drawLeafBuddy(
  ctx: CanvasRenderingContext2D,
  c: CritterEntity,
  blinking: boolean,
  outline: string
) {
  const step = Math.sin(c.phase * 1.25);
  const bulbSway = Math.sin(c.phase * 0.9) * 0.06;

  // Green seed bulb on back
  ctx.save();
  ctx.translate(-4, -3);
  ctx.rotate(-0.2 + bulbSway);
  ctx.beginPath();
  ctx.moveTo(-8, 4);
  ctx.quadraticCurveTo(-11, -7, 0, -14);
  ctx.quadraticCurveTo(11, -7, 8, 4);
  ctx.closePath();
  ctx.fillStyle = '#22c55e';
  ctx.fill();
  ctx.strokeStyle = outline;
  ctx.lineWidth = 1.1;
  ctx.stroke();

  // Darker leaf fold
  ctx.beginPath();
  ctx.moveTo(0, -14);
  ctx.quadraticCurveTo(-4, -5, -2, 3);
  ctx.strokeStyle = '#15803d';
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ctx.restore();

  // Chubby mint-teal body
  drawEllipse(ctx, 1, 3.5, 11.5, 8.5);
  ctx.fillStyle = '#5eead4';
  ctx.fill();
  ctx.strokeStyle = outline;
  ctx.lineWidth = 1.2;
  ctx.stroke();

  // Teal spots
  ctx.beginPath();
  ctx.arc(-5, 3, 2.2, 0, Math.PI * 2);
  ctx.arc(0, 6, 1.7, 0, Math.PI * 2);
  ctx.fillStyle = '#0f766e';
  ctx.fill();

  // Legs
  drawEllipse(ctx, -5 + step * 2, 11.5, 3.2, 2.8);
  ctx.fillStyle = '#5eead4';
  ctx.fill();
  drawEllipse(ctx, 6 - step * 2, 11.5, 3.2, 2.8);
  ctx.fill();

  // Ears
  ctx.beginPath();
  ctx.moveTo(3, -9);
  ctx.lineTo(1, -15);
  ctx.lineTo(6.5, -11);
  ctx.closePath();
  ctx.fillStyle = '#5eead4';
  ctx.fill();

  // Wide head
  drawEllipse(ctx, 8, -3.5, 8.5, 7.2);
  ctx.fillStyle = '#5eead4';
  ctx.fill();
  ctx.strokeStyle = outline;
  ctx.lineWidth = 1.2;
  ctx.stroke();

  drawCuteEye(ctx, 11.2, -4.5, 2.0, blinking, '#991b1b');
}

function drawMelonPuff(
  ctx: CanvasRenderingContext2D,
  c: CritterEntity,
  blinking: boolean,
  outline: string
) {
  const armWave = Math.sin(c.phase * 1.4) * 0.25;

  // Back ear
  ctx.beginPath();
  ctx.moveTo(4, -10);
  ctx.lineTo(8, -19);
  ctx.lineTo(10, -8);
  ctx.closePath();
  ctx.fillStyle = '#f9a8d4';
  ctx.fill();
  ctx.strokeStyle = outline;
  ctx.lineWidth = 1.1;
  ctx.stroke();

  // Round pink puff body
  ctx.beginPath();
  ctx.arc(0, 0, 12.2, 0, Math.PI * 2);
  ctx.fillStyle = '#f9a8d4';
  ctx.fill();
  ctx.strokeStyle = outline;
  ctx.lineWidth = 1.2;
  ctx.stroke();

  // Front ear
  ctx.beginPath();
  ctx.moveTo(-7, -9);
  ctx.lineTo(-10, -19);
  ctx.lineTo(-2, -11);
  ctx.closePath();
  ctx.fillStyle = '#f9a8d4';
  ctx.fill();
  ctx.strokeStyle = outline;
  ctx.lineWidth = 1.1;
  ctx.stroke();

  // Inner ear triangle
  ctx.beginPath();
  ctx.moveTo(-6.8, -11);
  ctx.lineTo(-8.8, -16.5);
  ctx.lineTo(-4, -11.5);
  ctx.closePath();
  ctx.fillStyle = '#be185d';
  ctx.fill();

  // Forehead tuft curl
  ctx.beginPath();
  ctx.arc(3.5, -10, 3.6, Math.PI * 0.8, Math.PI * 2.1);
  ctx.fillStyle = '#f9a8d4';
  ctx.fill();
  ctx.strokeStyle = outline;
  ctx.lineWidth = 1.1;
  ctx.stroke();

  // Big sparkly aqua eyes
  drawCuteEye(ctx, 4.8, -1.8, 3.1, blinking, '#0d9488');
  drawCuteEye(ctx, 10.6, -1.5, 2.4, blinking, '#0d9488');

  // Tiny singing mouth
  ctx.beginPath();
  ctx.arc(8.2, 3.2, 1.6, 0, Math.PI * 2);
  ctx.fillStyle = '#be185d';
  ctx.fill();

  // Stubby waving arms & tiny feet
  ctx.save();
  ctx.translate(-2, 4);
  ctx.rotate(armWave);
  drawEllipse(ctx, 0, 0, 3.6, 2.1);
  ctx.fillStyle = '#f9a8d4';
  ctx.fill();
  ctx.restore();

  drawEllipse(ctx, -4, 12, 3.4, 2);
  ctx.fillStyle = '#f472b6';
  ctx.fill();
  drawEllipse(ctx, 4.5, 12, 3.4, 2);
  ctx.fill();
}

function drawFluffKit(
  ctx: CanvasRenderingContext2D,
  c: CritterEntity,
  blinking: boolean,
  outline: string
) {
  const step = Math.sin(c.phase * 1.45);
  const tailWag = Math.sin(c.phase * 1.4) * 0.16;

  // Bushy cream-tipped fox tail
  ctx.save();
  ctx.translate(-10, 3);
  ctx.rotate(-0.45 + tailWag);
  drawEllipse(ctx, -7, -2, 8.5, 4.8);
  ctx.fillStyle = '#d97706';
  ctx.fill();
  ctx.strokeStyle = outline;
  ctx.lineWidth = 1.1;
  ctx.stroke();
  drawEllipse(ctx, -12, -2.5, 4.4, 3.6);
  ctx.fillStyle = '#fef3c7';
  ctx.fill();
  ctx.restore();

  // Body
  drawEllipse(ctx, -1, 4, 10.2, 7.2);
  ctx.fillStyle = '#d97706';
  ctx.fill();
  ctx.strokeStyle = outline;
  ctx.lineWidth = 1.2;
  ctx.stroke();

  // Paws
  drawEllipse(ctx, -5 + step * 2.4, 11.8, 2.8, 2);
  ctx.fillStyle = '#b45309';
  ctx.fill();
  drawEllipse(ctx, 5 - step * 2.4, 11.8, 2.8, 2);
  ctx.fill();

  // Fluffy cream neck ruff
  ctx.beginPath();
  ctx.arc(4.5, 1.5, 7, 0, Math.PI * 2);
  ctx.fillStyle = '#fef3c7';
  ctx.fill();

  // Long ears
  ctx.beginPath();
  ctx.moveTo(3, -10);
  ctx.lineTo(-1, -22);
  ctx.lineTo(6.5, -13);
  ctx.closePath();
  ctx.fillStyle = '#d97706';
  ctx.fill();
  ctx.strokeStyle = outline;
  ctx.lineWidth = 1.1;
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(8, -10);
  ctx.lineTo(13, -21);
  ctx.lineTo(11, -8);
  ctx.closePath();
  ctx.fillStyle = '#d97706';
  ctx.fill();

  // Head
  ctx.beginPath();
  ctx.arc(6.5, -6.5, 7.8, 0, Math.PI * 2);
  ctx.fillStyle = '#d97706';
  ctx.fill();
  ctx.strokeStyle = outline;
  ctx.lineWidth = 1.2;
  ctx.stroke();

  drawCuteEye(ctx, 9.2, -7.2, 2.0, blinking);
  ctx.beginPath();
  ctx.arc(13.2, -5.8, 1.1, 0, Math.PI * 2);
  ctx.fillStyle = '#451a03';
  ctx.fill();
}

function drawBunny(
  ctx: CanvasRenderingContext2D,
  c: CritterEntity,
  blinking: boolean,
  outline: string
) {
  const isLavender = c.variant === 1;
  const fur = isLavender ? '#ede9fe' : '#f8fafc';
  const earLag = Math.sin(c.phase * 1.4) * 0.12;

  // Fluffy cotton puff tail
  ctx.beginPath();
  ctx.arc(-11.5, 4.5, 4.2, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.strokeStyle = outline;
  ctx.lineWidth = 1;
  ctx.stroke();

  // Plump bunny body
  drawEllipse(ctx, -1, 4, 10.5, 8.2);
  ctx.fillStyle = fur;
  ctx.fill();
  ctx.strokeStyle = outline;
  ctx.lineWidth = 1.2;
  ctx.stroke();

  // Long ears
  for (const offset of [-1, 1]) {
    ctx.save();
    ctx.translate(4.5 + offset * 1.5, -10);
    ctx.rotate(-0.28 + offset * 0.14 + earLag);
    drawEllipse(ctx, 0, -8.5, 3, 8.8);
    ctx.fillStyle = fur;
    ctx.fill();
    ctx.strokeStyle = outline;
    ctx.lineWidth = 1.1;
    ctx.stroke();
    drawEllipse(ctx, 0, -8, 1.5, 5.5);
    ctx.fillStyle = '#f9a8d4';
    ctx.fill();
    ctx.restore();
  }

  // Head
  ctx.beginPath();
  ctx.arc(6, -5.5, 7.6, 0, Math.PI * 2);
  ctx.fillStyle = fur;
  ctx.fill();
  ctx.strokeStyle = outline;
  ctx.lineWidth = 1.2;
  ctx.stroke();

  // Paws
  drawEllipse(ctx, -3, 11.5, 3.6, 2);
  ctx.fillStyle = fur;
  ctx.fill();
  drawEllipse(ctx, 6.5, 11.5, 3.2, 2);
  ctx.fill();

  drawCuteEye(ctx, 8.8, -6.5, 1.8, blinking);
  // Pink nose & blush
  ctx.beginPath();
  ctx.arc(12.8, -4.8, 1.3, 0, Math.PI * 2);
  ctx.fillStyle = '#f472b6';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(7.8, -3.5, 2, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(244, 114, 182, 0.4)';
  ctx.fill();
}

function drawKitty(
  ctx: CanvasRenderingContext2D,
  c: CritterEntity,
  blinking: boolean,
  outline: string
) {
  const step = Math.sin(c.phase * 1.45);
  const tailSway = Math.sin(c.phase * 1.2) * 3.5;
  const fur = c.variant === 2 ? '#e2e8f0' : '#fef3c7';
  const patch = c.variant === 2 ? '#94a3b8' : '#fb923c';

  // Curling S-curve tail
  ctx.beginPath();
  ctx.moveTo(-9, 3);
  ctx.bezierCurveTo(-18, 2, -20, -10 + tailSway, -13, -13 + tailSway);
  ctx.strokeStyle = patch;
  ctx.lineWidth = 3.2;
  ctx.lineCap = 'round';
  ctx.stroke();

  // Body
  drawEllipse(ctx, -1, 4.5, 10.5, 6.8);
  ctx.fillStyle = fur;
  ctx.fill();
  ctx.strokeStyle = outline;
  ctx.lineWidth = 1.2;
  ctx.stroke();

  // Cute calico back patch
  ctx.beginPath();
  ctx.arc(-4, 1.5, 4.2, 0, Math.PI * 2);
  ctx.fillStyle = patch;
  ctx.fill();

  // Trotting paws
  drawEllipse(ctx, -6 + step * 2.5, 11.5, 2.6, 2);
  ctx.fillStyle = fur;
  ctx.fill();
  drawEllipse(ctx, 5 - step * 2.5, 11.5, 2.6, 2);
  ctx.fill();

  // Ears
  ctx.beginPath();
  ctx.moveTo(2, -9);
  ctx.lineTo(1.5, -16);
  ctx.lineTo(6.5, -11);
  ctx.closePath();
  ctx.fillStyle = patch;
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(8, -10);
  ctx.lineTo(11.5, -16);
  ctx.lineTo(12, -8);
  ctx.closePath();
  ctx.fillStyle = fur;
  ctx.fill();

  // Round kitty head
  drawEllipse(ctx, 6.8, -5.5, 7.6, 6.8);
  ctx.fillStyle = fur;
  ctx.fill();
  ctx.strokeStyle = outline;
  ctx.lineWidth = 1.2;
  ctx.stroke();

  drawCuteEye(ctx, 9.6, -6.2, 1.8, blinking, '#15803d');

  // Nose & whiskers
  ctx.beginPath();
  ctx.arc(13.4, -4.6, 1.1, 0, Math.PI * 2);
  ctx.fillStyle = '#fb7185';
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(11.5, -3.8);
  ctx.lineTo(16, -4.5);
  ctx.moveTo(11.5, -2.8);
  ctx.lineTo(15.8, -2);
  ctx.strokeStyle = outline;
  ctx.lineWidth = 0.8;
  ctx.stroke();
}

function drawShiba(
  ctx: CanvasRenderingContext2D,
  c: CritterEntity,
  blinking: boolean,
  outline: string
) {
  const step = Math.sin(c.phase * 1.5);
  const wag = Math.sin(c.phase * 3.4) * 0.25;

  // Curled wagging tail
  ctx.save();
  ctx.translate(-10, 1.5);
  ctx.rotate(wag);
  ctx.beginPath();
  ctx.arc(-3, -3, 4.8, 0, Math.PI * 2);
  ctx.fillStyle = '#f59e0b';
  ctx.fill();
  ctx.strokeStyle = outline;
  ctx.lineWidth = 1.1;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(-4.5, -3.5, 2.2, 0, Math.PI * 2);
  ctx.fillStyle = '#fffbeb';
  ctx.fill();
  ctx.restore();

  // Body
  drawEllipse(ctx, -1, 4, 11, 7.2);
  ctx.fillStyle = '#f59e0b';
  ctx.fill();
  ctx.strokeStyle = outline;
  ctx.lineWidth = 1.2;
  ctx.stroke();

  // Cream belly
  drawEllipse(ctx, 2, 6.2, 6.5, 4);
  ctx.fillStyle = '#fffbeb';
  ctx.fill();

  // Paws
  drawEllipse(ctx, -5.5 + step * 2.6, 11.8, 2.8, 2);
  ctx.fillStyle = '#fffbeb';
  ctx.fill();
  drawEllipse(ctx, 5.5 - step * 2.6, 11.8, 2.8, 2);
  ctx.fill();

  // Perked ears
  ctx.beginPath();
  ctx.moveTo(2.5, -9);
  ctx.lineTo(1.5, -16.5);
  ctx.lineTo(7, -11);
  ctx.closePath();
  ctx.fillStyle = '#d97706';
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(8, -10);
  ctx.lineTo(12, -16);
  ctx.lineTo(12, -8);
  ctx.closePath();
  ctx.fillStyle = '#f59e0b';
  ctx.fill();

  // Head
  drawEllipse(ctx, 6.5, -5.5, 8.2, 7.2);
  ctx.fillStyle = '#f59e0b';
  ctx.fill();
  ctx.strokeStyle = outline;
  ctx.lineWidth = 1.2;
  ctx.stroke();

  // Cream Shiba cheeks
  drawEllipse(ctx, 9.2, -3.6, 5.2, 4);
  ctx.fillStyle = '#fffbeb';
  ctx.fill();

  drawCuteEye(ctx, 9.2, -7.2, 1.8, blinking);
  ctx.beginPath();
  ctx.arc(13.8, -5.4, 1.3, 0, Math.PI * 2);
  ctx.fillStyle = '#27272a';
  ctx.fill();
}

function drawFox(
  ctx: CanvasRenderingContext2D,
  c: CritterEntity,
  blinking: boolean,
  outline: string
) {
  const step = Math.sin(c.phase * 1.4);
  const tailSway = Math.sin(c.phase * 1.1) * 0.14;

  // Big white-tipped bushy tail
  ctx.save();
  ctx.translate(-10, 4);
  ctx.rotate(-0.25 + tailSway);
  drawEllipse(ctx, -8, -1, 10, 4.6);
  ctx.fillStyle = '#ea580c';
  ctx.fill();
  ctx.strokeStyle = outline;
  ctx.lineWidth = 1.1;
  ctx.stroke();
  drawEllipse(ctx, -14.5, -1.5, 4.4, 3.6);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.restore();

  // Body
  drawEllipse(ctx, -1, 4.2, 10.6, 6.8);
  ctx.fillStyle = '#ea580c';
  ctx.fill();
  ctx.strokeStyle = outline;
  ctx.lineWidth = 1.2;
  ctx.stroke();

  // Dark socks
  drawEllipse(ctx, -5.5 + step * 2.4, 11.6, 2.5, 1.9);
  ctx.fillStyle = '#27272a';
  ctx.fill();
  drawEllipse(ctx, 5.5 - step * 2.4, 11.6, 2.5, 1.9);
  ctx.fill();

  // Ears
  ctx.beginPath();
  ctx.moveTo(2, -9);
  ctx.lineTo(1, -17);
  ctx.lineTo(7, -11);
  ctx.closePath();
  ctx.fillStyle = '#ea580c';
  ctx.fill();

  // Head
  drawEllipse(ctx, 6.8, -5.2, 8.2, 6.6);
  ctx.fillStyle = '#ea580c';
  ctx.fill();
  ctx.strokeStyle = outline;
  ctx.lineWidth = 1.2;
  ctx.stroke();

  // White cheek fur
  drawEllipse(ctx, 8.8, -3.3, 5.2, 3.2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();

  drawCuteEye(ctx, 9.5, -6.8, 1.8, blinking);
  ctx.beginPath();
  ctx.arc(14.3, -5.2, 1.2, 0, Math.PI * 2);
  ctx.fillStyle = '#18181b';
  ctx.fill();
}

function drawDuckling(
  ctx: CanvasRenderingContext2D,
  c: CritterEntity,
  blinking: boolean,
  outline: string,
  isPond: boolean
) {
  const wingFlap = Math.sin(c.phase * 1.8) * 0.2;
  const waddle = Math.sin(c.phase * 1.4) * 1.8;

  // Plump duck body
  drawEllipse(ctx, -1, 3, 10.5, 7.8);
  ctx.fillStyle = '#fde047';
  ctx.fill();
  ctx.strokeStyle = outline;
  ctx.lineWidth = 1.2;
  ctx.stroke();

  if (!isPond) {
    drawEllipse(ctx, -3 + waddle, 11.5, 3, 1.8);
    ctx.fillStyle = '#f97316';
    ctx.fill();
    drawEllipse(ctx, 4 - waddle, 11.5, 3, 1.8);
    ctx.fill();
  }

  // Head
  ctx.beginPath();
  ctx.arc(6, -6.2, 6.8, 0, Math.PI * 2);
  ctx.fillStyle = '#fde047';
  ctx.fill();
  ctx.strokeStyle = outline;
  ctx.lineWidth = 1.2;
  ctx.stroke();

  // Tiny wing
  ctx.save();
  ctx.translate(-2, 2.5);
  ctx.rotate(wingFlap);
  drawEllipse(ctx, 0, 0, 5.2, 3.2);
  ctx.fillStyle = '#facc15';
  ctx.fill();
  ctx.restore();

  // Orange bill
  drawEllipse(ctx, 13.5, -5.4, 3.6, 2.0);
  ctx.fillStyle = '#f97316';
  ctx.fill();

  drawCuteEye(ctx, 8.2, -7.2, 1.7, blinking);
}

function drawButterfly(ctx: CanvasRenderingContext2D, c: CritterEntity) {
  const wingColors = ['#c084fc', '#38bdf8', '#f472b6'];
  const wingColor = wingColors[c.variant % wingColors.length];
  const flap = 0.28 + 0.72 * Math.abs(Math.cos(c.phase * 1.1));

  ctx.save();
  ctx.rotate(-0.18);

  // Upper wing
  ctx.save();
  ctx.scale(1, flap);
  ctx.beginPath();
  ctx.ellipse(-2, -8, 7.5, 9.5, -0.3, 0, Math.PI * 2);
  ctx.fillStyle = wingColor;
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(-4, 6, 5.2, 6.2, 0.25, 0, Math.PI * 2);
  ctx.fillStyle = wingColor;
  ctx.globalAlpha *= 0.85;
  ctx.fill();
  ctx.restore();

  // Body
  drawEllipse(ctx, 0, 0, 6.5, 1.6);
  ctx.fillStyle = '#334155';
  ctx.fill();
  ctx.restore();
}

function drawKoi(ctx: CanvasRenderingContext2D, c: CritterEntity, outline: string) {
  const swish = Math.sin(c.phase * 1.45) * 4.5;
  const isGold = c.variant === 1;
  const bodyColor = isGold ? '#fbbf24' : '#f8fafc';
  const spotColor = isGold ? '#f97316' : '#ef4444';

  // Flowing tail fin
  ctx.beginPath();
  ctx.moveTo(-12, 0);
  ctx.quadraticCurveTo(-20, -7 + swish * 0.7, -23, -8 + swish);
  ctx.quadraticCurveTo(-18, swish * 0.5, -23, 8 + swish);
  ctx.quadraticCurveTo(-20, 7 + swish * 0.7, -12, 0);
  ctx.fillStyle = spotColor;
  ctx.globalAlpha *= 0.82;
  ctx.fill();
  ctx.globalAlpha /= 0.82;

  // Pectoral fins
  drawEllipse(ctx, 3, -6, 3.5, 5.5, -0.45);
  ctx.fillStyle = bodyColor;
  ctx.fill();
  drawEllipse(ctx, 3, 6, 3.5, 5.5, 0.45);
  ctx.fill();

  // Sinuous koi body
  ctx.beginPath();
  ctx.moveTo(14, 0);
  ctx.quadraticCurveTo(4, -7.5, -13, swish * 0.35);
  ctx.quadraticCurveTo(4, 7.5, 14, 0);
  ctx.closePath();
  ctx.fillStyle = bodyColor;
  ctx.fill();
  ctx.strokeStyle = outline;
  ctx.lineWidth = 1.1;
  ctx.stroke();

  // Calico spots
  ctx.beginPath();
  ctx.arc(5, -1.5, 3.4, 0, Math.PI * 2);
  ctx.arc(-4, 1.2 + swish * 0.15, 2.8, 0, Math.PI * 2);
  ctx.fillStyle = spotColor;
  ctx.fill();

  // Eye
  ctx.beginPath();
  ctx.arc(9.5, -2.1, 1.3, 0, Math.PI * 2);
  ctx.fillStyle = '#18181b';
  ctx.fill();
}

function drawSeaTurtle(
  ctx: CanvasRenderingContext2D,
  c: CritterEntity,
  blinking: boolean,
  outline: string
) {
  const paddle = Math.sin(c.phase * 1.2) * 0.45;

  // Front & back flippers
  ctx.save();
  ctx.translate(4, -7);
  ctx.rotate(-0.4 + paddle);
  drawEllipse(ctx, 0, -5, 3.2, 6.8);
  ctx.fillStyle = '#6ee7b7';
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.translate(4, 7);
  ctx.rotate(0.4 - paddle);
  drawEllipse(ctx, 0, 5, 3.2, 6.8);
  ctx.fillStyle = '#6ee7b7';
  ctx.fill();
  ctx.restore();

  drawEllipse(ctx, -10, -5, 4.2, 2.2, 0.4);
  ctx.fillStyle = '#6ee7b7';
  ctx.fill();
  drawEllipse(ctx, -10, 5, 4.2, 2.2, -0.4);
  ctx.fill();

  // Cute round turtle head
  drawEllipse(ctx, 13, 0, 5.2, 4.4);
  ctx.fillStyle = '#6ee7b7';
  ctx.fill();
  ctx.strokeStyle = outline;
  ctx.lineWidth = 1.1;
  ctx.stroke();

  // Shell
  drawEllipse(ctx, -1, 0, 11.2, 8.6);
  ctx.fillStyle = '#10b981';
  ctx.fill();
  ctx.strokeStyle = outline;
  ctx.lineWidth = 1.2;
  ctx.stroke();

  // Shell scute pattern
  drawEllipse(ctx, -1, 0, 6.5, 4.8);
  ctx.fillStyle = '#059669';
  ctx.fill();

  drawCuteEye(ctx, 14.8, -1.6, 1.4, blinking);
}

function drawAmbientMote(ctx: CanvasRenderingContext2D, m: AmbientMote, isDark: boolean) {
  const progress = m.life / m.maxLife;
  const fade = progress < 0.2 ? progress / 0.2 : Math.max(0, 1 - (progress - 0.2) / 0.8);
  const alpha = fade * (isDark ? 0.65 : 0.55);
  if (alpha <= 0.01) return;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(m.x, m.y);
  ctx.rotate(m.rotation);

  if (m.kind === 'bubble') {
    ctx.beginPath();
    ctx.arc(0, 0, m.size, 0, Math.PI * 2);
    ctx.strokeStyle = m.color;
    ctx.lineWidth = 1.1;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(-m.size * 0.35, -m.size * 0.35, m.size * 0.22, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
  } else if (m.kind === 'ripple') {
    ctx.beginPath();
    ctx.ellipse(0, 0, m.size, m.size * 0.42, 0, 0, Math.PI * 2);
    ctx.strokeStyle = hexToRgba(m.color, 0.5);
    ctx.lineWidth = 1;
    ctx.stroke();
  } else if (m.kind === 'spark') {
    ctx.beginPath();
    const s = m.size;
    ctx.moveTo(0, -s);
    ctx.quadraticCurveTo(0, 0, s, 0);
    ctx.quadraticCurveTo(0, 0, 0, s);
    ctx.quadraticCurveTo(0, 0, -s, 0);
    ctx.quadraticCurveTo(0, 0, 0, -s);
    ctx.fillStyle = m.color;
    ctx.fill();
  } else if (m.kind === 'ember') {
    ctx.beginPath();
    ctx.arc(0, 0, m.size, 0, Math.PI * 2);
    ctx.fillStyle = m.color;
    ctx.fill();
  } else if (m.kind === 'leaf') {
    drawEllipse(ctx, 0, 0, m.size, m.size * 0.5);
    ctx.fillStyle = m.color;
    ctx.fill();
  } else if (m.kind === 'note') {
    ctx.font = `${Math.round(m.size)}px sans-serif`;
    ctx.fillStyle = m.color;
    ctx.fillText('♪', -3, 3);
  } else if (m.kind === 'heart') {
    const s = m.size * 0.55;
    ctx.beginPath();
    ctx.moveTo(0, s);
    ctx.bezierCurveTo(-s * 2, -s * 0.5, -s, -s * 2, 0, -s * 0.7);
    ctx.bezierCurveTo(s, -s * 2, s * 2, -s * 0.5, 0, s);
    ctx.fillStyle = m.color;
    ctx.fill();
  }

  ctx.restore();
}

export function renderCritterScene(
  ctx: CanvasRenderingContext2D,
  scene: CritterScene,
  palette: ThemePalette,
  tSec: number
): void {
  const { width, height, critters, motes, stars } = scene;
  ctx.clearRect(0, 0, width, height);

  // Subtle ambient background glow & twinkling stars
  for (const s of stars) {
    const pulse = 0.25 + 0.35 * (0.5 + 0.5 * Math.sin(tSec * 1.4 + s.phase));
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    ctx.fillStyle = hexToRgba(s.color, palette.isDark ? pulse * 0.65 : pulse * 0.35);
    ctx.fill();
  }

  // Ambient motes behind & around critters
  for (const m of motes) {
    drawAmbientMote(ctx, m, palette.isDark);
  }

  const outline = palette.isDark ? 'rgba(24, 24, 27, 0.78)' : 'rgba(30, 41, 59, 0.58)';

  for (const c of critters) {
    const blinking = c.blinkTimer <= 0;
    const isGround =
      c.species !== 'melonpuff' &&
      c.species !== 'butterfly' &&
      c.species !== 'koi' &&
      c.species !== 'seaturtle' &&
      c.species !== 'pondduck';

    if (isGround) {
      const airOffset = Math.max(0, c.baseY - c.y);
      drawGroundShadow(ctx, c.x, c.baseY, 10 * c.scale, airOffset, palette.isDark);
    }

    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.scale(c.dir * c.scale, c.scale);
    ctx.globalAlpha = palette.isDark ? 0.84 : 0.86;

    // Gentle soft halo in dark / AMOLED modes
    if (palette.isDark) {
      const halo = ctx.createRadialGradient(0, 0, 2, 0, 0, 26);
      halo.addColorStop(0, hexToRgba(palette.primary, 0.14));
      halo.addColorStop(1, 'transparent');
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(0, 0, 26, 0, Math.PI * 2);
      ctx.fill();
    }

    switch (c.species) {
      case 'sparkmouse':
        drawSparkMouse(ctx, c, blinking, outline);
        break;
      case 'flamelizard':
        drawFlameLizard(ctx, c, blinking, outline);
        break;
      case 'bubbleturtle':
        drawBubbleTurtle(ctx, c, blinking, outline);
        break;
      case 'leafbuddy':
        drawLeafBuddy(ctx, c, blinking, outline);
        break;
      case 'melonpuff':
        drawMelonPuff(ctx, c, blinking, outline);
        break;
      case 'fluffkit':
        drawFluffKit(ctx, c, blinking, outline);
        break;
      case 'bunny':
        drawBunny(ctx, c, blinking, outline);
        break;
      case 'kitty':
        drawKitty(ctx, c, blinking, outline);
        break;
      case 'shiba':
        drawShiba(ctx, c, blinking, outline);
        break;
      case 'fox':
        drawFox(ctx, c, blinking, outline);
        break;
      case 'duckling':
        drawDuckling(ctx, c, blinking, outline, false);
        break;
      case 'pondduck':
        drawDuckling(ctx, c, blinking, outline, true);
        break;
      case 'butterfly':
        drawButterfly(ctx, c);
        break;
      case 'koi':
        drawKoi(ctx, c, outline);
        break;
      case 'seaturtle':
        drawSeaTurtle(ctx, c, blinking, outline);
        break;
    }

    ctx.restore();
  }
}
