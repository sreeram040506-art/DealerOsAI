import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import VehicleLeadsTab from '@/components/VehicleLeadsTab';

vi.mock('@/context/auth-hooks', () => ({ useAuth: () => ({ token: 't', logout: vi.fn() }) }));
vi.mock('@/hooks/useCustomers', () => ({ useCustomers: () => ({ customers: [{ id: 'c1', firstName: 'Jane', lastName: 'Buyer', phone: '617-555-0100', email: 'jane@example.com' }] }) }));

const json = (s: number, b: unknown) => Promise.resolve(new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } }));
const lead = (id: string, name: string, amount: number | null, status = 'Interested') => ({ id, vehicleId: 'v1', customerName: name, phone: '1', offerAmount: amount, status, createdAt: '2026-10-01T00:00:00Z' });

describe('VehicleLeadsTab', () => {
  it('lists leads best offer first, shows the best offer, and adds a lead with the picked customer details', async () => {
    const posts: unknown[] = [];
    vi.stubGlobal('fetch', vi.fn((_url: string, init?: RequestInit) => {
      if (init?.method === 'POST') { posts.push(JSON.parse(init.body as string)); return json(201, lead('n', 'Jane Buyer', 9000)); }
      return json(200, [lead('1', 'Low Larry', 7000), lead('2', 'High Hannah', 9500), lead('3', 'Lost Lou', 12000, 'Lost'), lead('4', 'No Amount', null)]);
    }));
    render(<QueryClientProvider client={new QueryClient()}><VehicleLeadsTab vehicleId="v1" /></QueryClientProvider>);

    await screen.findByText('High Hannah');
    const names = screen.getAllByText(/Larry|Hannah|Lou|No Amount/).map((n) => n.textContent);
    expect(names).toEqual(['High Hannah', 'Low Larry', 'No Amount', 'Lost Lou']); // open by offer, then lost last
    // A lost lead's $12,000 is not the best offer.
    expect(screen.getByText(/Best offer/).textContent).toContain('9,500');
    expect(screen.getByText(/open/).textContent).toContain('3');

    fireEvent.change(screen.getByLabelText(/Customer name/), { target: { value: 'jane buyer' } });
    expect((screen.getByLabelText('Phone') as HTMLInputElement).value).toBe('617-555-0100');
    expect((screen.getByLabelText('Email') as HTMLInputElement).value).toBe('jane@example.com');
    fireEvent.change(screen.getByLabelText(/Offer/), { target: { value: '9000' } });
    fireEvent.click(screen.getByRole('button', { name: /Add lead/ }));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]).toMatchObject({ vehicleId: 'v1', customerName: 'jane buyer', offerAmount: '9000', phone: '617-555-0100' });
    vi.unstubAllGlobals();
  });
});
