import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

const DEVICE_ID = 'gs_device_id';
let cached: string | null = null;

/** A random id generated once per install. Sent with login and sync so the server can tell devices apart. */
export async function getDeviceId(): Promise<string> {
  if (cached) return cached;
  let id = await SecureStore.getItemAsync(DEVICE_ID);
  if (!id) {
    id = Crypto.randomUUID();
    await SecureStore.setItemAsync(DEVICE_ID, id);
  }
  cached = id;
  return id;
}
