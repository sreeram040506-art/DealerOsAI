/**
 * Simple in-memory cache with TTL (Time To Live)
 */
class Cache {
  constructor(defaultTtl = 300000) { // Default 5 minutes
    this.cache = new Map();
    this.defaultTtl = defaultTtl;
  }

  set(key, value, ttl = this.defaultTtl) {
    const expires = Date.now() + ttl;
    this.cache.set(key, { value, expires });
  }

  get(key) {
    const cached = this.cache.get(key);
    if (!cached) return null;

    if (Date.now() > cached.expires) {
      this.cache.delete(key);
      return null;
    }

    return cached.value;
  }

  delete(key) {
    this.cache.delete(key);
  }

  clear() {
    this.cache.clear();
  }
}

export const vehicleCache = new Cache(600000); // 10 minutes default for vehicles
export const salesCache = new Cache(300000); // 5 minutes
export const expenseCache = new Cache(300000); // 5 minutes
export const adsCache = new Cache(300000); // 5 minutes
export default Cache;
