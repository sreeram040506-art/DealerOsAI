// @vitest-environment node
import { describe, expect, it, vi, beforeAll, afterAll } from 'vitest';
import type { Server } from 'http';

const vehicles = [{ id: 'v1', dealershipId: 'd1', status: 'Available' }, { id: 'v2', dealershipId: 'd1', status: 'Sold' }, { id: 'v3', dealershipId: 'other', status: 'Available' }];
const leases: any[] = [];
const photos: any[] = [];
let seq = 0;
const id = () => String(++seq).padStart(24, '0');
const match = (row: any, where: any) => Object.entries(where).every(([k, v]) => row[k] === v);

vi.mock('../../server/src/db/prisma.js', () => ({
  default: {
    vehicle: { findFirst: async ({ where }: any) => vehicles.find((v) => match(v, where)) ?? null },
    lease: {
      findFirst: async ({ where, include }: any) => { const l = leases.find((x) => match(x, where)); return l ? { ...l, ...(include ? { vehicle: { id: l.vehicleId } } : {}) } : null; },
      findMany: async ({ where }: any) => leases.filter((x) => match(x, where)),
      create: async ({ data }: any) => { const l = { id: id(), status: 'ACTIVE', ...data }; leases.push(l); return l; },
      update: async ({ where, data }: any) => Object.assign(leases.find((x) => x.id === where.id), data),
    },
    leasePhoto: {
      findMany: async ({ where }: any) => photos.filter((p) => match(p, where)),
      deleteMany: async ({ where }: any) => { for (let i = photos.length - 1; i >= 0; i--) if (match(photos[i], where)) photos.splice(i, 1); },
      upsert: async ({ where, create, update }: any) => {
        const k = where.leaseId_phase_angle;
        const existing = photos.find((p) => p.leaseId === k.leaseId && p.phase === k.phase && p.angle === k.angle);
        if (existing) return Object.assign(existing, update);
        const p = { id: id(), ...create }; photos.push(p); return p;
      },
    },
  },
}));

let server: Server;
let base = '';
beforeAll(async () => {
  const express = (await import('../../server/node_modules/express/index.js')).default;
  const { default: router } = await import('../../server/src/routes/leaseRoutes.js');
  const app = express();
  app.use(express.json({ limit: '10mb' }));
  app.use((req: any, _r: unknown, next: () => void) => { req.dealershipId = 'd1'; next(); });
  app.use('/api/leases', router);
  await new Promise<void>((r) => { server = app.listen(0, r); });
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/leases`;
});
afterAll(() => { server?.close(); });

const send = (path: string, method: string, body?: unknown) =>
  fetch(base + path, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
const PNG = 'data:image/png;base64,iVBORw0KGgo=';

describe('lease API', () => {
  it('validates, blocks sold / foreign vehicles and double leases', async () => {
    expect((await send('', 'POST', { vehicleId: 'v1' })).status).toBe(400);
    expect((await send('', 'POST', { vehicleId: 'v2', customerName: 'A' })).status).toBe(400);
    expect((await send('', 'POST', { vehicleId: 'v3', customerName: 'A' })).status).toBe(404);
    const ok = await send('', 'POST', { vehicleId: 'v1', customerName: ' Sam ' });
    expect(ok.status).toBe(201);
    expect((await ok.json()).customerName).toBe('Sam');
    expect((await send('', 'POST', { vehicleId: 'v1', customerName: 'B' })).status).toBe(409);
  });

  it('stores, replaces and removes photos per phase/angle; rejects bad input', async () => {
    const lease = leases[0];
    expect((await send(`/${lease.id}/photos`, 'PUT', { phase: 'NOPE', angle: 'front', dataUrl: PNG })).status).toBe(400);
    expect((await send(`/${lease.id}/photos`, 'PUT', { phase: 'PICKUP', angle: 'front', dataUrl: 'not-an-image' })).status).toBe(400);
    expect((await send(`/${lease.id}/photos`, 'PUT', { phase: 'PICKUP', angle: 'front', dataUrl: PNG })).status).toBe(200);
    expect((await send(`/${lease.id}/photos`, 'PUT', { phase: 'PICKUP', angle: 'front', dataUrl: 'data:image/jpeg;base64,/9j/4AAQ' })).status).toBe(200);
    expect((await send(`/${lease.id}/photos`, 'PUT', { phase: 'RETURN', angle: 'front', dataUrl: PNG })).status).toBe(200);
    const list = await (await fetch(`${base}/${lease.id}/photos`)).json();
    expect(list).toHaveLength(2); // pickup front replaced, not duplicated
    expect(list.find((p: any) => p.phase === 'PICKUP').dataUrl).toBe('data:image/jpeg;base64,/9j/4AAQ');
    const only = await (await fetch(`${base}/${lease.id}/photos?phase=RETURN`)).json();
    expect(only).toHaveLength(1);
    await send(`/${lease.id}/photos/${only[0].id}`, 'DELETE');
    expect(photos.filter((p) => p.phase === 'RETURN')).toHaveLength(0);
  });

  it('marks returned once, then locks pickup photos', async () => {
    const lease = leases[0];
    expect((await send(`/${lease.id}/return`, 'POST')).status).toBe(200);
    expect((await send(`/${lease.id}/return`, 'POST')).status).toBe(400);
    expect((await send(`/${lease.id}/photos`, 'PUT', { phase: 'PICKUP', angle: 'back', dataUrl: PNG })).status).toBe(400);
    expect((await send(`/${lease.id}/photos`, 'PUT', { phase: 'RETURN', angle: 'back', dataUrl: PNG })).status).toBe(200);
    expect((await send('', 'POST', { vehicleId: 'v1', customerName: 'Next' })).status).toBe(201); // free to lease again
  });
});
