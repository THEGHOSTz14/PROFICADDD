import type { Units } from './document';
import { BBox, Vec2 } from './vec';

/**
 * World space is right-handed with +Y up. Screen space is canvas pixels with
 * +Y down and the origin at the top-left of the drawing surface.
 */
export class View {
  /** Pixels per world unit. */
  zoom = 1;
  /** Screen position of world origin. */
  pan: Vec2 = { x: 0, y: 0 };
  width = 1;
  height = 1;

  resize(width: number, height: number): void {
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
  }

  toScreen(p: Vec2): Vec2 {
    return { x: this.pan.x + p.x * this.zoom, y: this.pan.y - p.y * this.zoom };
  }

  toWorld(p: Vec2): Vec2 {
    return { x: (p.x - this.pan.x) / this.zoom, y: (this.pan.y - p.y) / this.zoom };
  }

  /** A world length expressed in screen pixels. */
  worldToPixels(d: number): number {
    return d * this.zoom;
  }

  /** A screen tolerance expressed in world units. */
  pixelsToWorld(d: number): number {
    return d / this.zoom;
  }

  panByPixels(delta: Vec2): void {
    this.pan = { x: this.pan.x + delta.x, y: this.pan.y + delta.y };
  }

  zoomAt(factor: number, anchorScreen: Vec2): void {
    const before = this.toWorld(anchorScreen);
    const next = clampZoom(this.zoom * factor);
    if (next === this.zoom) return;
    this.zoom = next;
    const after = this.toScreen(before);
    this.pan = { x: this.pan.x + (anchorScreen.x - after.x), y: this.pan.y + (anchorScreen.y - after.y) };
  }

  setZoomAt(zoom: number, anchorScreen: Vec2): void {
    this.zoomAt(zoom / this.zoom, anchorScreen);
  }

  /** Centre the view on a world point. */
  centerOn(p: Vec2): void {
    this.pan = { x: this.width / 2 - p.x * this.zoom, y: this.height / 2 + p.y * this.zoom };
  }

  fitBox(box: BBox, paddingPx = 40): void {
    const w = Math.max(box.max.x - box.min.x, 1e-6);
    const h = Math.max(box.max.y - box.min.y, 1e-6);
    const usableW = Math.max(1, this.width - paddingPx * 2);
    const usableH = Math.max(1, this.height - paddingPx * 2);
    this.zoom = clampZoom(Math.min(usableW / w, usableH / h));
    const center = { x: (box.min.x + box.max.x) / 2, y: (box.min.y + box.max.y) / 2 };
    this.centerOn(center);
  }

  visibleWorldBox(): BBox {
    const a = this.toWorld({ x: 0, y: 0 });
    const b = this.toWorld({ x: this.width, y: this.height });
    return {
      min: { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y) },
      max: { x: Math.max(a.x, b.x), y: Math.max(a.y, b.y) },
    };
  }
}

export const MIN_ZOOM = 1e-4;
export const MAX_ZOOM = 1e6;

/** World space is millimetres, so every document unit is a multiple of one. */
const MM_PER_UNIT: Record<Units, number> = { mm: 1, cm: 10, m: 1000, in: 25.4 };

/**
 * A box is kept at one document unit down to 3 device-ish pixels wide; below
 * that the lines merge into grey. Above MAX the unit is subdivided so the grid
 * still repeats across the view.
 */
const GRID_MIN_PX = 3;
const GRID_MAX_PX = 160;

const UNIT_MULTIPLES = [2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000];
const UNIT_DIVISIONS = [0.5, 0.2, 0.1, 0.05, 0.02, 0.01];

/**
 * Device pixels per CSS pixel used when painting. Plain 1x screens get a
 * 1.5x backbuffer so diagonals and curves anti-alias instead of stair-stepping.
 */
export function renderScale(dpr: number): number {
  return Math.min(2, Math.max(dpr, 1.5));
}

function clampZoom(z: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));
}

/**
 * Grid spacing in world millimetres. One box is exactly one document unit, and
 * only stops being one when the lines would blur into a solid wash (zoomed far
 * out) or would not repeat on screen at all (zoomed far in).
 */
export function unitGridStep(units: Units, zoom: number, divisions = 1): number {
  const mm = MM_PER_UNIT[units] ?? 1;
  const base = mm * Math.max(1, Math.round(divisions) || 1);
  const k = Math.max(zoom, 1e-9);
  if (base * k < GRID_MIN_PX) {
    for (const m of UNIT_MULTIPLES) if (base * m * k >= GRID_MIN_PX) return base * m;
    return base * UNIT_MULTIPLES[UNIT_MULTIPLES.length - 1];
  }
  if (base * k > GRID_MAX_PX) {
    for (const m of UNIT_DIVISIONS) if (base * m * k <= GRID_MAX_PX) return base * m;
    return base * UNIT_DIVISIONS[UNIT_DIVISIONS.length - 1];
  }
  return base;
}

/** Length of one document unit measured in world millimetres. */
export function unitLength(units: Units): number {
  return MM_PER_UNIT[units] ?? 1;
}
