import { Document } from '../core/document';
import { View } from '../core/view';
import { Renderer } from '../core/renderer';

export interface RasterOptions {
  /** Longest side of the image in pixels. */
  maxSide?: number;
}

/**
 * Rasterise the visible drawing by driving the same renderer the app uses, so
 * exported images always match what is on screen.
 */
export function renderToCanvas(doc: Document, options: RasterOptions = {}): HTMLCanvasElement {
  const maxSide = options.maxSide ?? 1600;
  const box = doc.extents();
  const w = Math.max(box.max.x - box.min.x, 1e-6);
  const h = Math.max(box.max.y - box.min.y, 1e-6);
  const scale = Math.min(maxSide / w, maxSide / h);
  const pxW = Math.max(1, Math.round(w * scale));
  const pxH = Math.max(1, Math.round(h * scale));

  const canvas = document.createElement('canvas');
  canvas.width = pxW;
  canvas.height = pxH;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D is not available in this browser');

  const view = new View();
  view.resize(pxW, pxH);
  view.zoom = scale;
  view.pan = { x: -box.min.x * scale, y: box.max.y * scale };

  const renderer = new Renderer(ctx);
  renderer.render({
    view,
    doc,
    showGrid: false,
    gridStep: 1,
    selection: new Set<string>(),
    hoverId: null,
    preview: null,
    snapMark: null,
    marquee: null,
  });
  return canvas;
}

export function toPngBlob(doc: Document, options: RasterOptions = {}): Promise<Blob> {
  const canvas = renderToCanvas(doc, options);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('PNG encoding failed'));
    }, 'image/png');
  });
}
