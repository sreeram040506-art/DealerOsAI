/**
 * Copies only the listed keys from a request body. Update routes spread req.body straight into
 * Prisma before, which let a caller overwrite fields the form never exposes — most importantly
 * dealershipId, moving a record into another tenant. Each route now names what is editable.
 */
export function pickFields(body, allowed) {
  const source = body && typeof body === 'object' ? body : {};
  const picked = {};
  for (const key of allowed) {
    if (Object.prototype.hasOwnProperty.call(source, key)) picked[key] = source[key];
  }
  return picked;
}
