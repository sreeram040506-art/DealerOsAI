import { describe, expect, it } from 'vitest';
import { compareImages, type GrayImage } from '@/lib/damageCompare';

const W = 240;
const H = 160;

// Smooth "car panel" gradient with a couple of soft features.
function panel(): GrayImage {
  const data = new Float32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    data[y * W + x] = 120 + 40 * Math.sin(x / 30) + 30 * Math.cos(y / 25) + (x > 100 && x < 110 ? 40 : 0);
  }
  return { width: W, height: H, data };
}

const clone = (g: GrayImage): GrayImage => ({ ...g, data: new Float32Array(g.data) });

describe('compareImages', () => {
  it('finds nothing on identical photos', () => {
    const a = panel();
    const r = compareImages(a, clone(a));
    expect(r.regions).toHaveLength(0);
  });

  it('ignores a global brightness change', () => {
    const a = panel();
    const b = clone(a);
    for (let i = 0; i < b.data.length; i++) b.data[i] = Math.min(255, b.data[i] * 1.2 + 10);
    expect(compareImages(a, b).regions).toHaveLength(0);
  });

  it('ignores a small camera shift', () => {
    const a = panel();
    const b = clone(a);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) b.data[y * W + x] = a.data[y * W + Math.min(W - 1, x + 4)];
    expect(compareImages(a, b).regions).toHaveLength(0);
  });

  it('flags a dent (dark blob with highlight) in the right place', () => {
    const a = panel();
    const b = clone(a);
    for (let y = 60; y < 84; y++) for (let x = 150; x < 190; x++) {
      const d = ((x - 170) / 20) ** 2 + ((y - 72) / 12) ** 2;
      if (d < 1) b.data[y * W + x] += x < 170 ? -70 : 70;
    }
    const r = compareImages(a, b);
    expect(r.regions.length).toBeGreaterThan(0);
    const top = r.regions[0];
    expect(top.x).toBeLessThan(190 / W);
    expect(top.x + top.w).toBeGreaterThan(150 / W);
    expect(top.y).toBeLessThan(84 / H);
    expect(top.y + top.h).toBeGreaterThan(60 / H);
  });

  it('flags a thin scratch', () => {
    const a = panel();
    const b = clone(a);
    for (let x = 60; x < 120; x++) for (let t = 0; t < 2; t++) b.data[(100 + Math.floor((x - 60) / 10) + t) * W + x] = 235;
    expect(compareImages(a, b).regions.length).toBeGreaterThan(0);
  });
});
