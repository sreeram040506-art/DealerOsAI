import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/components/AppLayout', () => ({ default: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock('@/context/auth-hooks', () => ({ useAuth: () => ({ token: 't', logout: vi.fn() }) }));
vi.mock('@/lib/dealPdf', () => ({ downloadDealPdf: vi.fn(async () => {}) }));

const calls: { path: string; method: string; body?: string }[] = [];
const config = {
  forms: [
    { key: 'bill_of_sale', title: 'Motor Vehicle Bill of Sale', fields: ['buyer_name', 'tax_amount'] },
    { key: 'odometer', title: 'Odometer Disclosure Statement', fields: ['odometer_reading'] },
  ],
  fields: [
    { name: 'buyer_name', label: 'Buyer name', group: 'Buyer', type: 'text' },
    { name: 'tax_amount', label: 'Sales tax', group: 'Pricing', type: 'money' },
    { name: 'odometer_reading', label: 'Odometer reading', group: 'Vehicle', type: 'text' },
  ],
  values: { buyer_name: 'Jane Doe', tax_amount: '', odometer_reading: '42,000' },
};
vi.mock('@/lib/api', () => ({
  apiFetch: vi.fn(async (path: string, _t: string, init: RequestInit = {}) => {
    calls.push({ path, method: init.method ?? 'GET', body: init.body as string | undefined });
    const body = path.endsWith('/render')
      ? { documents: config.forms.map((f) => ({ key: f.key, title: f.title, html: `<html><body>${f.title} for ${JSON.parse(init.body as string).values.buyer_name}</body></html>` })) }
      : path.includes('/deal-forms/') && init.method === 'PUT' ? { ok: true } : config;
    return new Response(JSON.stringify(body), { status: 200 });
  }),
  handleApiResponse: async (r: Response) => r.json(),
}));

import SaleDocuments from '@/pages/SaleDocuments';
import { downloadDealPdf } from '@/lib/dealPdf';

function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/sales/abc/documents']}>
        <Routes><Route path="/sales/:saleId/documents" element={<SaleDocuments />} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('SaleDocuments page', () => {
  it('shows prefilled fields, live preview, and generates the PDF with typed details', async () => {
    setup();
    const buyer = await screen.findByLabelText('Buyer name');
    expect((buyer as HTMLInputElement).value).toBe('Jane Doe');

    // Preview comes from the server-rendered form.
    await waitFor(() => expect(document.querySelector('iframe')?.getAttribute('srcdoc')).toContain('Motor Vehicle Bill of Sale for Jane Doe'));

    // Editing a field re-renders the preview with the new value.
    fireEvent.change(buyer, { target: { value: 'John Roe' } });
    await waitFor(() => expect(document.querySelector('iframe')?.getAttribute('srcdoc')).toContain('for John Roe'), { timeout: 2000 });

    // Switching forms shows that form's fields.
    fireEvent.click(screen.getByText(/2\. Odometer Disclosure Statement/));
    expect(await screen.findByLabelText('Odometer reading')).toBeTruthy();

    // Generate: saves first, then builds the PDF from all rendered forms.
    fireEvent.click(screen.getByRole('button', { name: /Generate all 2 as PDF/ }));
    await waitFor(() => expect(downloadDealPdf).toHaveBeenCalled());
    const [docs, name] = (downloadDealPdf as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(docs).toHaveLength(2);
    expect(name).toBe('Sale_Documents.pdf');
    const put = calls.find((c) => c.method === 'PUT');
    expect(JSON.parse(put!.body!).values.buyer_name).toBe('John Roe');
  });
});
