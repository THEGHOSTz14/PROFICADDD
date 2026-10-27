/** Trigger a browser download of generated text contents. */
export function downloadText(filename: string, text: string, mime: string): void {
  downloadBlob(filename, new Blob([text], { type: mime }));
}

export function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke a little later so Safari has time to start the download.
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function readTextFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(reader.error?.message ?? 'Could not read the file'));
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.readAsText(file);
  });
}
