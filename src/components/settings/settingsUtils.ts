import { useState } from 'react';

/** Splits a comma/newline separated list into trimmed, non-empty entries. */
export function parseList(text: string) {
  return text.split(/[\n,]/).map((s) => s.trim()).filter(Boolean);
}

export function useCredentialDrafts() {
  const [drafts, setDrafts] = useState<Record<string, string | null | undefined>>({});
  const set = (name: string) => (value: string | null | undefined) => setDrafts((prev) => ({ ...prev, [name]: value }));
  // Only fields the admin touched are sent; an empty "Add" box means no change.
  const changes = Object.fromEntries(
    Object.entries(drafts).filter(([, v]) => v === null || (typeof v === 'string' && v.trim() !== '')),
  );
  return { drafts, set, changes, reset: () => setDrafts({}) };
}
