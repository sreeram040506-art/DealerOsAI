import type { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { SoldItem } from './financeReport';
import { formatSafeDate } from './dateUtils';
import { money, vehicleLabel } from './reportFormat';

const finalY = (doc: jsPDF) => (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;

/**
 * Adds the complete list of vehicles sold to a landscape report PDF: every vehicle (no row
 * limit), a totals row, and a repeating header when it runs onto more pages. Returns the y
 * position below the table.
 */
export function addSoldVehiclesTable(doc: jsPDF, items: SoldItem[], startY: number): number {
  doc.setFontSize(13);
  doc.text(`Vehicles sold (${items.length})`, 14, startY);

  const totals = items.reduce(
    (t, i) => ({ price: t.price + i.price, cost: t.cost + i.cost, repairs: t.repairs + i.repairs, gross: t.gross + i.gross }),
    { price: 0, cost: 0, repairs: 0, gross: 0 },
  );

  autoTable(doc, {
    startY: startY + 4,
    head: [['Date', 'Stock #', 'Vehicle', 'VIN', 'Customer', 'Price', 'Cost', 'Repairs', 'Gross profit']],
    body: items.map((i) => [
      formatSafeDate(i.sale.saleDate),
      i.vehicle?.stockNumber ?? '',
      vehicleLabel(i.vehicle),
      i.vehicle?.vin ?? '',
      i.sale.customerName ?? '',
      money(i.price),
      `${money(i.cost)}${i.flag ? ' *' : ''}`,
      money(i.repairs),
      money(i.gross),
    ]),
    foot: items.length ? [['', '', `Total (${items.length})`, '', '', money(totals.price), money(totals.cost), money(totals.repairs), money(totals.gross)]] : undefined,
    theme: 'striped',
    headStyles: { fillColor: [40, 40, 45] },
    footStyles: { fillColor: [235, 235, 238], textColor: 20, fontStyle: 'bold' },
    showHead: 'everyPage',
    styles: { fontSize: 8 },
  });

  let endY = finalY(doc);
  if (items.some((i) => i.flag)) {
    doc.setFontSize(9);
    doc.text('* Purchase price still to be confirmed; profit for these vehicles may change.', 14, endY + 7);
    endY += 7;
  }
  return endY;
}
