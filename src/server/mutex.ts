import "server-only";
const shared = globalThis as typeof globalThis & { bankMutex?: Promise<void> };
export async function serialized<T>(fn: () => Promise<T> | T): Promise<T> {
  const previous = shared.bankMutex ?? Promise.resolve();
  let release!: () => void;
  shared.bankMutex = new Promise<void>((r) => {
    release = r;
  });
  await previous;
  try {
    return await fn();
  } finally {
    release();
  }
}
