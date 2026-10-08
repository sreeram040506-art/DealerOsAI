import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import PublicForm from '@/pages/PublicForm';

const definition = {
  state: 'PENDING',
  form: {
    title: 'Motor Vehicle Purchase Contract', audience: 'customer', intro: 'Please fill in your details.', needsSignature: true,
    consent: 'I agree to the terms.',
    sections: [{ title: 'Buyer', fields: [
      { key: 'buyerName', label: 'Full legal name', type: 'text', required: true },
      { key: 'paymentMethod', label: 'How will you pay?', type: 'radio', required: true, options: ['Cash', 'Card'] },
      { key: 'cashDown', label: 'Cash down payment ($)', type: 'number' },
    ] }],
  },
  recipientName: 'Jane',
  terms: { cashPrice: 9500, docFee: 499 },
  dealership: { name: 'Broadway Motors' },
  vehicle: { year: 2014, make: 'Honda', model: 'Accord', vin: '1HGCM82633A004352', mileage: 90210 },
  expiresAt: '2026-12-31T00:00:00.000Z',
};

const json = (status: number, body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));
const renderPage = () => render(<MemoryRouter initialEntries={['/f/abc']}><Routes><Route path="/f/:token" element={<PublicForm />} /></Routes></MemoryRouter>);

describe('public form page', () => {
  const fetchMock = vi.fn();
  beforeEach(() => { fetchMock.mockReset(); vi.stubGlobal('fetch', fetchMock); });
  afterEach(() => vi.unstubAllGlobals());

  it('shows the vehicle and price, blocks an incomplete submit, then sends once complete', async () => {
    fetchMock.mockImplementationOnce(() => json(200, definition));
    const user = {
      click: async (el: Element) => { fireEvent.click(el); },
      type: async (el: Element, text: string) => { fireEvent.change(el, { target: { value: text } }); },
    };
    renderPage();
    expect(await screen.findByText('2014 Honda Accord')).toBeInTheDocument();
    expect(screen.getByText(/Price \(set by the dealership\)/)).toBeInTheDocument();
    expect(screen.getAllByText(/9,999/).length).toBeGreaterThan(0);

    await user.click(screen.getByRole('button', { name: 'Submit' }));
    expect(await screen.findByText('Full legal name is required.')).toBeInTheDocument();
    expect(screen.getByText('Type your full name to sign.')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1); // nothing was sent

    await user.type(screen.getByLabelText(/Full legal name/), 'Jane Buyer');
    await user.click(screen.getByLabelText('Cash'));
    await user.type(screen.getByLabelText(/Cash down/), '1000');
    await user.type(screen.getByLabelText(/Type your full name to sign/), 'Jane Buyer');
    await user.click(screen.getByRole('checkbox'));

    fetchMock.mockImplementationOnce(() => json(201, { ok: true }));
    await user.click(screen.getByRole('button', { name: 'Submit' }));
    expect(await screen.findByText('Thank you!')).toBeInTheDocument();
    const [, init] = fetchMock.mock.calls[1];
    const sent = JSON.parse(init.body);
    expect(sent).toMatchObject({ buyerName: 'Jane Buyer', paymentMethod: 'Cash', cashDown: '1000', signature: 'Jane Buyer', consent: true });
  });

  it('shows server-side field errors', async () => {
    fetchMock.mockImplementationOnce(() => json(200, definition));
    const user = {
      click: async (el: Element) => { fireEvent.click(el); },
      type: async (el: Element, text: string) => { fireEvent.change(el, { target: { value: text } }); },
    };
    renderPage();
    await screen.findByText('2014 Honda Accord');
    await user.type(screen.getByLabelText(/Full legal name/), 'J');
    await user.click(screen.getByLabelText('Card'));
    await user.type(screen.getByLabelText(/Type your full name to sign/), 'J');
    await user.click(screen.getByRole('checkbox'));
    fetchMock.mockImplementationOnce(() => json(400, { message: 'Please fix the highlighted fields.', errors: { buyerName: 'Name looks too short.' } }));
    await user.click(screen.getByRole('button', { name: 'Submit' }));
    expect(await screen.findByText('Name looks too short.')).toBeInTheDocument();
  });

  it.each([
    [409, 'This form has already been submitted. Thank you!', 'Thank you!'],
    [410, 'This link is no longer active.', 'Form unavailable'],
    [404, 'x', 'Form unavailable'],
  ])('handles a %i link', async (status, message, heading) => {
    fetchMock.mockImplementationOnce(() => json(status, { message }));
    renderPage();
    await waitFor(() => expect(screen.getByText(heading)).toBeInTheDocument());
  });
});
