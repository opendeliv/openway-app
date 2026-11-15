import { Platform } from 'react-native';
import { createMMKV } from 'react-native-mmkv';

const storage = createMMKV();
const KEY = 'device_id';

function randomId() {
  const part = () => Math.random().toString(36).slice(2, 10);
  return `${Date.now().toString(36)}-${part()}-${part()}-${part()}`;
}

export async function getDeviceId(): Promise<string> {
  let id = storage.getString(KEY);
  if (!id) {
    id = randomId();
    storage.set(KEY, id);
  }
  return id;
}

export function getDeviceName(): string {
  return `${Platform.OS} ${Platform.Version}`;
}