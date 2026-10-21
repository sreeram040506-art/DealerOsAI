import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

export interface DealDoc { key: string; title: string; html: string }

const PAGE_W = 612; // US Letter, points
const PAGE_H = 792;
const MARGIN = 28;

async function rasterise(html: string): Promise<HTMLCanvasElement> {
  const frame = document.createElement('iframe');
  frame.style.cssText = 'position:fixed;left:-10000px;top:0;width:850px;height:1200px;border:0;background:#fff';
  document.body.appendChild(frame);
  try {
    const doc = frame.contentDocument!;
    doc.open(); doc.write(html); doc.close();
    await new Promise((r) => setTimeout(r, 150));
    const body = doc.body;
    body.style.margin = '0 auto';
    frame.style.height = `${body.scrollHeight + 40}px`;
    return await html2canvas(body, { scale: 2, backgroundColor: '#ffffff', useCORS: true, windowWidth: 850 });
  } finally {
    frame.remove();
  }
}

/** One PDF with each form starting on a fresh page; a form taller than a page flows onto more. */
export async function buildDealPdf(docs: DealDoc[]): Promise<jsPDF> {
  const pdf = new jsPDF({ unit: 'pt', format: 'letter' });
  const usableW = PAGE_W - MARGIN * 2;
  const usableH = PAGE_H - MARGIN * 2;
  let first = true;

  for (const d of docs) {
    const canvas = await rasterise(d.html);
    const scale = usableW / canvas.width;
    const sliceH = Math.floor(usableH / scale); // source pixels per PDF page
    for (let y = 0; y < canvas.height; y += sliceH) {
      const h = Math.min(sliceH, canvas.height - y);
      const slice = document.createElement('canvas');
      slice.width = canvas.width;
      slice.height = h;
      slice.getContext('2d')!.drawImage(canvas, 0, y, canvas.width, h, 0, 0, canvas.width, h);
      if (!first) pdf.addPage();
      first = false;
      pdf.addImage(slice.toDataURL('image/jpeg', 0.92), 'JPEG', MARGIN, MARGIN, usableW, h * scale);
    }
  }
  return pdf;
}

export async function downloadDealPdf(docs: DealDoc[], fileName: string) {
  (await buildDealPdf(docs)).save(fileName);
}
