/** Read the text out of a quote PDF on the user's device. The PDF library loads only when someone uploads a file. */
export async function readPdfText(file: File, maxPages = 12): Promise<string> {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = '/pdfjs/pdf.worker.min.mjs';
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  const doc = await task.promise;
  const pages: string[] = [];
  try {
    for (let i = 1; i <= Math.min(doc.numPages, maxPages); i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      let line = '';
      const lines: string[] = [];
      for (const item of content.items) {
        if (!('str' in item)) continue;
        line += item.str;
        if (item.hasEOL) { lines.push(line); line = ''; } else line += ' ';
      }
      if (line.trim()) lines.push(line);
      pages.push(lines.join('\n'));
    }
  } finally {
    await task.destroy();
  }
  return pages.join('\n');
}

/** Plain text and CSV files are read directly. */
export async function readFileText(file: File): Promise<string> {
  if (/pdf$/i.test(file.type) || /\.pdf$/i.test(file.name)) return readPdfText(file);
  if (/^text\//.test(file.type) || /\.(txt|csv|md)$/i.test(file.name)) return file.text();
  throw new Error('unsupported');
}
