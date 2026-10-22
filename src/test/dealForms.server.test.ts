// @vitest-environment node
import { describe, expect, it, vi, beforeAll, afterAll } from 'vitest';
import type { Server } from 'http';

const SALE_ID = 'a'.repeat(24);
const sale = {
  id: SALE_ID, dealershipId: 'd1', customerName: 'Jane <Doe>', phone: '555-0100', address: '1 Main St',
  driverLicense: 'D123', saleDate: new Date('2026-10-01T00:00:00Z'), salePrice: 15000, paymentMethod: 'Cash',
  dealFormData: null as null | Record<string, string>,
  vehicle: { id: 'v1', vin: '1HGBH41JXMN109186', year: 2018, make: 'Honda', model: 'Civic', color: 'Blue', mileage: 42000, stockNumber: '2610001' },
};

const update = vi.fn(async ({ data }: { data: { dealFormData: Record<string, string> } }) => { sale.dealFormData = data.dealFormData; return sale; });
vi.mock('../../server/src/db/prisma.js', () => ({
  default: {
    sale: {
      findFirst: vi.fn(async ({ where }: { where: { id?: unknown } }) => (where.id === SALE_ID ? sale : where.id ? null : null)),
      update: (args: never) => update(args),
    },
    dealership: { findUnique: vi.fn(async () => ({ name: 'ACME Auto', address: '9 Lot Rd', phone: '555-1111', email: 'a@acme.test' })) },
  },
}));
vi.mock('../../server/src/services/vinDecoder.js', () => ({
  decodeVin: vi.fn(async () => ({ trim: 'EX', bodyClass: 'Sedan', driveType: 'FWD', fuelType: 'Gasoline', transmissionStyle: 'CVT', displacementL: '2.0', engineCylinders: '4' })),
}));

let server: Server;
let base = '';

beforeAll(async () => {
  const express = (await import('../../server/node_modules/express/index.js')).default;
  const { default: router } = await import('../../server/src/routes/dealFormRoutes.js');
  const app = express();
  app.use(express.json());
  app.use((req: any, _res: unknown, next: () => void) => { req.dealershipId = 'd1'; next(); });
  app.use('/api/deal-forms', router);
  await new Promise<void>((r) => { server = app.listen(0, r); });
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/deal-forms`;
});
afterAll(() => { server?.close(); });

const post = (path: string, body: unknown) => fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

describe('deal forms API', () => {
  it('returns all 9 forms with prefilled values from the sale, vehicle and VIN decode', async () => {
    const res = await fetch(`${base}/${SALE_ID}`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.forms).toHaveLength(9);
    expect(data.values).toMatchObject({
      buyer_name: 'Jane <Doe>', vin: '1HGBH41JXMN109186', vehicle_make: 'Honda', vehicle_trim: 'EX',
      dealer_name: 'ACME Auto', sale_price: '15000.00', odometer_reading: '42,000', payment_method: 'Cash', drivetrain: 'FWD',
    });
  });

  it('404s for an unknown or malformed sale id', async () => {
    expect((await fetch(`${base}/${'b'.repeat(24)}`)).status).toBe(404);
    expect((await fetch(`${base}/not-an-id`)).status).toBe(404);
  });

  it('renders every form with no placeholders left, escaped values, and computed totals', async () => {
    const res = await post(`/${SALE_ID}/render`, { values: { tax_amount: '900', doc_fee: '200' } });
    const { documents } = await res.json();
    expect(documents).toHaveLength(9);
    for (const d of documents) expect(d.html).not.toMatch(/{{/);
    const bos = documents.find((d: { key: string }) => d.key === 'bill_of_sale').html;
    expect(bos).toContain('Jane &lt;Doe&gt;');
    expect(bos).toContain('[X] Cash');
    expect(bos).toContain('16100.00'); // 15000 + 900 + 200
    const contract = documents.find((d: { key: string }) => d.key === 'purchase_contract').html;
    expect(contract).toContain('[X] Used');
    expect(contract).toContain('[X] <strong>AS IS');
    expect(contract).toContain('16100.00'); // total delivered / unpaid balance with no trade or down payment
  });

  it('can render a single form and switches warranty ticks', async () => {
    const res = await post(`/${SALE_ID}/render`, { forms: ['buyers_guide'], values: { warranty_type: 'Dealer warranty', warranty_labor_pct: '50', warranty_parts_pct: '50' } });
    const { documents } = await res.json();
    expect(documents).toHaveLength(1);
    expect(documents[0].html).toContain('[ X ] WARRANTY');
    expect(documents[0].html).toContain('50% OF THE LABOR');
  });

  it('saves typed details and uses them on the next load', async () => {
    const put = await fetch(`${base}/${SALE_ID}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ values: { buyer_dl_number: 'X999', 'bad key!': 'ignored' } }) });
    expect(put.status).toBe(200);
    expect(sale.dealFormData).toEqual({ buyer_dl_number: 'X999' });
    const data = await (await fetch(`${base}/${SALE_ID}`)).json();
    expect(data.values.buyer_dl_number).toBe('X999');
  });
});
