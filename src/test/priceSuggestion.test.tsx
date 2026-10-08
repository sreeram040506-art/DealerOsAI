import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import PriceSuggestionCard from '@/components/PriceSuggestionCard';

let role = 'ADMIN';
vi.mock('@/context/auth-hooks', () => ({ useAuth: () => ({ token: 't', logout: vi.fn(), user: { role } }) }));

const json = (s: number, b: unknown) => Promise.resolve(new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } }));
const pending = {
  id: 's1', vehicleId: 'v1', status: 'PENDING', daysOnLot: 25, currentPrice: 12000, suggestedPrice: 10000, marketMedian: 10000, belowCost: true,
  reason: 'Your price of $12,000 is 20% above the market median of $10,000.', createdAt: '2026-10-01T00:00:00Z',
  comparables: [{ title: 'a', price: 9800, mileage: 80000, url: 'https://www.cars.com/1', source: 'cars.com' }, { title: 'b', price: 10200, url: 'javascript:alert(1)', source: 'evil' }],
};
const renderCard = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><PriceSuggestionCard vehicleId="v1" /></QueryClientProvider>);

describe('PriceSuggestionCard', () => {
  const calls: [string, string | undefined][] = [];
  beforeEach(() => { role = 'ADMIN'; calls.length = 0; });

  it('shows the suggestion, warns below cost, and applies it', async () => {
    vi.stubGlobal('fetch', vi.fn((url: string, init?: RequestInit) => {
      calls.push([url, init?.method]);
      if (init?.method === 'POST') return json(200, { ok: true });
      return json(200, [pending]);
    }));
    renderCard();
    expect(await screen.findByText(/20% above the market median/)).toBeInTheDocument();
    expect(screen.getByText(/below what you have invested/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /cars\.com/ })).toHaveAttribute('href', 'https://www.cars.com/1');
    expect(screen.getByText(/evil/).closest('a')).not.toHaveAttribute('href'); // unsafe scheme is not linked
    fireEvent.click(screen.getByRole('button', { name: /Apply \$10,000/ }));
    await waitFor(() => expect(calls.some(([u, m]) => u.endsWith('/price-suggestions/s1/apply') && m === 'POST')).toBe(true));
    vi.unstubAllGlobals();
  });

  it('dismisses', async () => {
    vi.stubGlobal('fetch', vi.fn((url: string, init?: RequestInit) => { calls.push([url, init?.method]); return init?.method === 'POST' ? json(200, { ok: true }) : json(200, [pending]); }));
    renderCard();
    fireEvent.click(await screen.findByRole('button', { name: 'Dismiss' }));
    await waitFor(() => expect(calls.some(([u]) => u.endsWith('/s1/dismiss'))).toBe(true));
    vi.unstubAllGlobals();
  });

  it('with nothing waiting offers a market check', async () => {
    vi.stubGlobal('fetch', vi.fn((url: string, init?: RequestInit) => { calls.push([url, init?.method]); return init?.method === 'POST' ? json(200, { ...pending, status: 'IN_LINE' }) : json(200, [{ ...pending, status: 'IN_LINE' }]); }));
    renderCard();
    expect(await screen.findByText(/in line with the market/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Check market now/ }));
    await waitFor(() => expect(calls.some(([u, m]) => u.endsWith('/vehicle/v1/check') && m === 'POST')).toBe(true));
    vi.unstubAllGlobals();
  });

  it('is hidden from staff and makes no request', () => {
    role = 'STAFF';
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { container } = renderCard();
    expect(container).toBeEmptyDOMElement();
    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
