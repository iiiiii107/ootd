import { db } from './schema';

/** Typed get/set over the `meta` key-value store (spec §4.3). */
export async function getMeta<T>(key: string): Promise<T | undefined> {
  const entry = await db.meta.get(key);
  return entry?.value as T | undefined;
}

export async function setMeta<T>(key: string, value: T): Promise<void> {
  await db.meta.put({ key, value });
}
