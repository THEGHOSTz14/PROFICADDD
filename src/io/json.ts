import { DocJson, Document } from '../core/document';
import { downloadText, readTextFile } from './files';

export const FILE_EXTENSION = '.oddr';

export function documentFileName(doc: Document): string {
  const safe = (doc.name || 'drawing').replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').trim() || 'drawing';
  return `${safe}${FILE_EXTENSION}`;
}

export function saveDocument(doc: Document): void {
  downloadText(documentFileName(doc), JSON.stringify(doc.toJSON(), null, 2), 'application/json');
}

/** Parse and validate a drawing file, then load it into the document. */
export async function loadDocument(file: File, doc: Document): Promise<DocJson> {
  const text = await readTextFile(file);
  const parsed = JSON.parse(text) as DocJson;
  doc.loadJSON(parsed);
  return parsed;
}
