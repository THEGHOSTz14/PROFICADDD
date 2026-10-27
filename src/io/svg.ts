import { Vec2, BBox } from '../core/vec';
import { Entity, flatten } from '../core/entities';
import { Document, Layer } from '../core/document';

function num(n: number): string {
  const r = Math.round(n * 1e6) / 1e6;
  return Object.is(r, -0) ? '0' : String(r);
}

function styleAttrs(e: Entity, layer: Layer | undefined): string {
  const stroke = e.color ?? layer?.color ?? '#000000';
  const weight = e.lineweight ?? layer?.lineweight ?? 0.25;
  const type = e.linetype ?? layer?.linetype ?? 'continuous';
  const dash = {
    continuous: '',
    dashed: '9,5',
    dotted: '1.5,4',
    dashdot: '12,5,2,5',
    centre: '16,5,3,5',
  }[type];
  return `stroke="${stroke}" stroke-width="${num(weight * 4)}" fill="none" stroke-linecap="round"${
    dash ? ` stroke-dasharray="${dash}"` : ''
  }`;
}

function pathFromChain(chain: Vec2[], closed: boolean): string {
  if (chain.length < 2) return '';
  let d = `M ${num(chain[0].x)} ${num(chain[0].y)}`;
  for (let i = 1; i < chain.length; i++) d += ` L ${num(chain[i].x)} ${num(chain[i].y)}`;
  return d + (closed ? ' Z' : '');
}

/**
 * SVG export. Geometry lives in a group that flips Y so the drawing keeps its
 * CAD orientation; text un-flips itself to stay readable.
 */
export function toSvg(doc: Document): { text: string; box: BBox } {
  const box = doc.extents();
  const margin = Math.max((box.max.x - box.min.x) * 0.02, 2);
  const min = { x: box.min.x - margin, y: box.min.y - margin };
  const max = { x: box.max.x + margin, y: box.max.y + margin };
  const w = Math.max(1, max.x - min.x);
  const h = Math.max(1, max.y - min.y);

  const parts: string[] = [];
  for (const e of doc.visibleEntities()) {
    const layer = doc.layer(e.layerId);
    if (layer && !layer.visible) continue;
    const attrs = styleAttrs(e, layer);
    if (e.kind === 'text') {
      parts.push(
        `<text x="${num(e.position.x)}" y="${num(e.position.y)}" transform="scale(1,-1)" ` +
          `font-family="'Segoe UI', system-ui, sans-serif" font-weight="600" font-size="${num(e.height)}" ` +
          `fill="${e.color ?? layer?.color ?? '#000000'}" text-anchor="${e.halign}" ` +
          `dominant-baseline="${e.valign === 'center' ? 'middle' : e.valign === 'top' ? 'hanging' : 'alphabetic'}">${escapeXml(
            e.text.replace(/\n/g, ' ')
          )}</text>`
      );
      continue;
    }
    if (e.kind === 'circle') {
      parts.push(`<circle cx="${num(e.center.x)}" cy="${num(e.center.y)}" r="${num(e.radius)}" ${attrs}/>`);
      continue;
    }
    if (e.kind === 'arc') {
      const sweepCCW = ((e.end - e.start) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
      const large = sweepCCW > Math.PI ? 1 : 0;
      const x0 = e.center.x + e.radius * Math.cos(e.start);
      const y0 = e.center.y + e.radius * Math.sin(e.start);
      const x1 = e.center.x + e.radius * Math.cos(e.end);
      const y1 = e.center.y + e.radius * Math.sin(e.end);
      parts.push(
        `<path d="M ${num(x0)} ${num(y0)} A ${num(e.radius)} ${num(e.radius)} 0 ${large} 0 ${num(x1)} ${num(y1)}" ${attrs}/>`
      );
      continue;
    }
    const closed = e.kind === 'polyline' ? e.closed : e.kind === 'rect' || e.kind === 'ellipse';
    for (const chain of flatten(e, Math.max(w, h) / 2000)) {
      parts.push(`<path d="${pathFromChain(chain, closed)}" ${attrs}/>`);
    }
  }

  const text =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<svg xmlns="http://www.w3.org/2000/svg" width="${num(w)}" height="${num(h)}" ` +
    `viewBox="${num(min.x)} ${num(-max.y)} ${num(w)} ${num(h)}">\n` +
    `<rect x="${num(min.x)}" y="${num(-max.y)}" width="${num(w)}" height="${num(h)}" fill="#ffffff"/>\n` +
    `<g transform="scale(1,-1)">\n${parts.join('\n')}\n</g>\n</svg>\n`;

  return { text, box };
}

function escapeXml(s: string): string {
  return s.replace(/[<>&'"]/g, (c) =>
    c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '&' ? '&amp;' : c === "'" ? '&apos;' : '&quot;'
  );
}
