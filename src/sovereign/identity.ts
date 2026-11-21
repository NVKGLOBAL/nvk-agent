/**
 * NVK Agent — local identity (Sovereign Infrastructure layer).
 *
 * Identity is local only: a device-generated keypair identifier, no account,
 * no sign-in, no external identity provider. The decentralized-identity
 * roadmap item (CosmJS) is MISSING until it is built — it is not claimed
 * here and not claimed anywhere in the app.
 */
export interface LocalIdentity {
  /** Random local identifier, generated once and stored on-device. */
  deviceId: string;
  displayName: string;
  createdAt: number;
}

const IDENTITY_KEY = 'identity';

export async function getLocalIdentity(
  store: { get<T>(k: string): Promise<T | null>; set(k: string, v: unknown): Promise<void> },
): Promise<LocalIdentity> {
  const existing = await store.get<LocalIdentity>(IDENTITY_KEY);
  if (existing) return existing;
  const identity: LocalIdentity = {
    deviceId: `nvk-${crypto.randomUUID()}`,
    displayName: 'Architect',
    createdAt: Date.now(),
  };
  await store.set(IDENTITY_KEY, identity);
  return identity;
}
