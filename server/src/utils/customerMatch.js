/**
 * Customers aren't linked to sales or viewing notes by id; those records only carry the
 * buyer's name and phone. These helpers match them the same way everywhere (the customer
 * list's counts and the details dialog) so the numbers always agree.
 *
 * A record belongs to a customer when it has the same phone number, the same email, or the
 * same full name. A name match is dropped when the record and the customer both have a phone
 * (or both an email) and they differ, so two different "John Smith"s aren't merged.
 */

export const normalizePhone = (value) => {
  const digits = String(value ?? '').replace(/\D/g, '');
  if (digits.length < 7) return '';
  return digits.length > 10 ? digits.slice(-10) : digits; // ignore a leading country code
};

export const normalizeEmail = (value) => String(value ?? '').trim().toLowerCase();

export const normalizeName = (value) =>
  String(value ?? '').toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();

export const customerKeys = (customer) => ({
  phone: normalizePhone(customer.phone),
  email: normalizeEmail(customer.email),
  name: normalizeName(`${customer.firstName || ''} ${customer.lastName || ''}`),
});

/**
 * Matches records to customers. `accessors` say where a record keeps its name/phone/email.
 * Returns a Map of customer id -> the records that belong to them (each record at most once).
 */
export function matchRecords(customers, records, accessors) {
  const index = { phone: new Map(), email: new Map(), name: new Map() };
  const add = (map, key, entry) => {
    if (!key) return;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(entry);
  };
  for (const record of records) {
    const entry = {
      record,
      phone: normalizePhone(accessors.phone?.(record)),
      email: normalizeEmail(accessors.email?.(record)),
      name: normalizeName(accessors.name?.(record)),
    };
    add(index.phone, entry.phone, entry);
    add(index.email, entry.email, entry);
    add(index.name, entry.name, entry);
  }

  const result = new Map();
  for (const customer of customers) {
    const keys = customerKeys(customer);
    const found = new Set();
    if (keys.phone) for (const entry of index.phone.get(keys.phone) ?? []) found.add(entry);
    if (keys.email) for (const entry of index.email.get(keys.email) ?? []) found.add(entry);
    if (keys.name) {
      for (const entry of index.name.get(keys.name) ?? []) {
        const phoneConflict = keys.phone && entry.phone && keys.phone !== entry.phone;
        const emailConflict = keys.email && entry.email && keys.email !== entry.email;
        if (!phoneConflict && !emailConflict) found.add(entry);
      }
    }
    result.set(customer.id, [...found].map((entry) => entry.record));
  }
  return result;
}

const latest = (dates) => {
  const times = dates.map((d) => new Date(d).getTime()).filter((t) => Number.isFinite(t));
  return times.length ? new Date(Math.max(...times)) : null;
};

/**
 * Cars bought and the last visit for one customer. A "visit" is any of: a visit recorded by
 * hand, a purchase, or a viewing note about a car; the most recent one wins.
 */
export function summarizeCustomer(customer, sales, notes) {
  const lastPurchase = latest(sales.map((s) => s.saleDate));
  const candidates = [
    { at: customer.lastVisitAt ? new Date(customer.lastVisitAt) : null, source: 'visit' },
    { at: lastPurchase, source: 'purchase' },
    { at: latest(notes.map((n) => n.createdAt)), source: 'viewing' },
  ].filter((c) => c.at && Number.isFinite(c.at.getTime()));
  candidates.sort((a, b) => b.at.getTime() - a.at.getTime());
  return {
    carsBought: sales.length,
    lastPurchaseDate: lastPurchase,
    lastVisitDate: candidates[0]?.at ?? null,
    lastVisitSource: candidates[0]?.source ?? null,
  };
}
