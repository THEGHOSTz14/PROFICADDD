import { Document } from '../core/document';
import { renderToCanvas } from './png';

/** Convert a Blob to a base64 string. */
async function blobToBase64(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  let binary = '';
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

/**
 * Build a minimal single-page PDF containing the drawing as a raster image.
 * Page size follows doc.pageSize (A4, A3, etc.) or fits to geometry.
 */
export async function toPdfBlob(doc: Document): Promise<Blob> {
  // Render at high resolution for print quality.
  const canvas = renderToCanvas(doc, { maxSide: 2400 });
  const jpegBlob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('JPEG encoding failed'))),
      'image/jpeg',
      0.92
    );
  });

  const jpegBase64 = await blobToBase64(jpegBlob);
  const imgW = canvas.width;
  const imgH = canvas.height;

  // Determine page dimensions in PDF points (1 pt = 1/72 inch).
  const mmToPt = 72 / 25.4;
  const PAPER_SIZES_MM: Record<string, [number, number]> = {
    A4: [210, 297],
    A3: [297, 420],
    A2: [420, 594],
    A1: [594, 841],
    A0: [841, 1189],
    Letter: [215.9, 279.4],
    Legal: [215.9, 355.6],
    Tabloid: [279.4, 431.8],
  };

  let pageW: number;
  let pageH: number;

  if (doc.pageSize && PAPER_SIZES_MM[doc.pageSize]) {
    const dims = PAPER_SIZES_MM[doc.pageSize];
    pageW = dims[0] * mmToPt;
    pageH = dims[1] * mmToPt;
  } else {
    // Fit to image with 20pt margin.
    const margin = 20;
    // Scale image to fit within reasonable bounds.
    const scale = Math.min(1, 600 / Math.max(imgW, imgH));
    pageW = imgW * scale + margin * 2;
    pageH = imgH * scale + margin * 2;
  }

  // Build PDF objects. Each object is stored separately so we can compute offsets.
  const parts: { id: number; content: string }[] = [];
  let nextId = 1;

  function addObj(content: string): number {
    const id = nextId++;
    parts.push({ id, content });
    return id;
  }

  // Object 1: Catalog
  const catalogId = addObj('<< /Type /Catalog /Pages 2 0 R >>');

  // Object 2: Pages
  addObj('<< /Type /Pages /Kids [3 0 R] /Count 1 >>');

  // Object 3: Page
  addObj(
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW.toFixed(2)} ${pageH.toFixed(2)}] /Contents 4 0 R /Resources << /XObject << /Im1 5 0 R >> >> >>`
  );

  // Object 4: Content stream — draw the image scaled to fill the page.
  const contentStream = `q ${pageW.toFixed(2)} 0 0 ${pageH.toFixed(2)} 0 0 cm /Im1 Do Q`;
  addObj(`<< /Length ${contentStream.length} >>\nstream\n${contentStream}\nendstream`);

  // Object 5: Image XObject (DCTDecode = JPEG).
  addObj(
    `<< /Type /XObject /Subtype /Image /Width ${imgW} /Height ${imgH} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegBase64.length * 3 / 4} >>\nstream\n${atob(jpegBase64)}\nendstream`
  );

  // Assemble the PDF body.
  let body = '%PDF-1.4\n%âãÏÓ\n';
  const offsets: number[] = [];

  for (const part of parts) {
    offsets.push(body.length);
    body += `${part.id} 0 obj\n${part.content}\nendobj\n`;
  }

  // xref table.
  const xrefStart = body.length;
  body += `xref\n0 ${nextId}\n0000000000 65535 f \n`;
  for (const off of offsets) {
    body += `${String(off).padStart(10, '0')} 00000 n \n`;
  }

  // Trailer.
  body += `trailer\n<< /Size ${nextId} /Root ${catalogId} 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;

  return new Blob([body], { type: 'application/pdf' });
}
