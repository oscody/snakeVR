import {
  AdditiveBlending,
  CanvasTexture,
  MeshBasicMaterial,
  RepeatWrapping,
  SRGBColorSpace,
} from "@iwsdk/core";

/**
 * holoUi — the shared neon-holographic style for the Immersive Arcade.
 *
 * Pure 2D-canvas + texture helpers used by both the launcher menu
 * (`gameMenu.ts`) and Serpent Grid XR's UI (`snakeGame.ts`), so they render
 * from one consistent visual language: dark navy panels, glowing accent
 * borders, corner brackets, and holographic glow. No game logic here.
 */

export const HOLO = {
  cyan: "#46e0c0", // primary UI accent
  cyanBright: "#7ff5e6",
  purple: "#9b6cff", // secondary accent
  green: "#3fe07a", // Serpent Grid XR
  amber: "#ffb020", // restart / warnings
  red: "#ff6b6b",
  text: "#f5f7ff",
  lavender: "#9aa4d4", // muted body text
  navyTop: "#161d3a",
  navyBottom: "#090c1a",
};

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** `#rrggbb` + alpha → `rgba(r, g, b, a)`. */
export function rgba(hex: string, a: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

export interface HoloPanelOpts {
  accent?: string;
  radius?: number;
  glow?: number; // 0 .. ~1.5
  brackets?: boolean;
  fillTop?: string;
  fillBottom?: string;
}

/**
 * Draw a rounded navy panel with a glowing accent border, a thin inner
 * highlight, and L-shaped corner brackets. Leave a margin of ~26 px inside the
 * canvas so the border glow has room to bloom.
 */
export function drawHoloPanel(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  opts: HoloPanelOpts = {},
) {
  const accent = opts.accent ?? HOLO.cyan;
  const r = opts.radius ?? 26;
  const glow = opts.glow ?? 1;

  ctx.save();

  // navy gradient fill
  const grad = ctx.createLinearGradient(0, y, 0, y + h);
  grad.addColorStop(0, opts.fillTop ?? HOLO.navyTop);
  grad.addColorStop(1, opts.fillBottom ?? HOLO.navyBottom);
  roundRectPath(ctx, x, y, w, h, r);
  ctx.fillStyle = grad;
  ctx.fill();

  // glowing border — a soft wide pass, then a tighter core pass
  ctx.strokeStyle = accent;
  ctx.shadowColor = accent;
  ctx.lineWidth = 3;
  roundRectPath(ctx, x, y, w, h, r);
  ctx.shadowBlur = 30 * glow;
  ctx.stroke();
  ctx.shadowBlur = 12 * glow;
  ctx.stroke();
  ctx.shadowBlur = 0;

  // inner highlight
  roundRectPath(ctx, x + 7, y + 7, w - 14, h - 14, Math.max(3, r - 7));
  ctx.strokeStyle = rgba("#ffffff", 0.07);
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // corner brackets
  if (opts.brackets ?? true) {
    const inset = 14;
    const len = 30;
    ctx.strokeStyle = accent;
    ctx.shadowColor = accent;
    ctx.shadowBlur = 12 * glow;
    ctx.lineWidth = 4;
    const corners: [number, number, number, number][] = [
      [x + inset, y + inset, 1, 1],
      [x + w - inset, y + inset, -1, 1],
      [x + inset, y + h - inset, 1, -1],
      [x + w - inset, y + h - inset, -1, -1],
    ];
    for (const [cx, cy, sx, sy] of corners) {
      ctx.beginPath();
      ctx.moveTo(cx + sx * len, cy);
      ctx.lineTo(cx, cy);
      ctx.lineTo(cx, cy + sy * len);
      ctx.stroke();
    }
    ctx.shadowBlur = 0;
  }

  ctx.restore();
}

export interface HoloTextOpts {
  font: string;
  color?: string;
  glow?: number; // 0 = plain, >0 = neon bloom
  align?: CanvasTextAlign;
  letterSpacing?: number;
}

/** Draw text with an optional neon bloom (bloom pass + sharp core pass). */
export function drawHoloText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  opts: HoloTextOpts,
) {
  const color = opts.color ?? HOLO.cyan;
  const glow = opts.glow ?? 0;
  ctx.save();
  ctx.font = opts.font;
  ctx.textAlign = opts.align ?? "left";
  if (opts.letterSpacing !== undefined) {
    // `letterSpacing` is supported by Chromium canvases but not yet in the
    // TS DOM lib — cast to set it.
    (ctx as unknown as { letterSpacing: string }).letterSpacing =
      `${opts.letterSpacing}px`;
  }
  ctx.fillStyle = color;
  if (glow > 0) {
    ctx.shadowColor = color;
    ctx.shadowBlur = 20 * glow;
    ctx.fillText(text, x, y);
  }
  ctx.shadowBlur = 0;
  ctx.fillText(text, x, y);
  ctx.restore();
}

/** Radial glow texture (opaque centre → transparent edge) for halo planes. */
export function makeGlowTexture(color: string): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const c = canvas.getContext("2d")!;
  const g = c.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, rgba(color, 0.85));
  g.addColorStop(0.45, rgba(color, 0.32));
  g.addColorStop(1, rgba(color, 0));
  c.fillStyle = g;
  c.fillRect(0, 0, 256, 256);
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

/** Additive-blended material for a 3D outer-glow / halo plane. */
export function makeGlowMaterial(color: string): MeshBasicMaterial {
  return new MeshBasicMaterial({
    map: makeGlowTexture(color),
    transparent: true,
    blending: AdditiveBlending,
    depthWrite: false,
  });
}

/** Tiling scanline texture — scroll `tex.offset.y` for a drifting effect. */
export function makeScanlineTexture(): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 8;
  canvas.height = 8;
  const c = canvas.getContext("2d")!;
  c.fillStyle = rgba(HOLO.cyanBright, 0.07);
  c.fillRect(0, 0, 8, 2);
  const tex = new CanvasTexture(canvas);
  tex.wrapS = RepeatWrapping;
  tex.wrapT = RepeatWrapping;
  tex.colorSpace = SRGBColorSpace;
  return tex;
}
