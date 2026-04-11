import PocketBase from 'pocketbase';

const PB_URL = process.env.NEXT_PUBLIC_PB_URL || 'http://127.0.0.1:8090';

// Singleton for client-side
let _pb: PocketBase | null = null;

export function getPocketBase(): PocketBase {
  if (!_pb) {
    _pb = new PocketBase(PB_URL);
    _pb.autoCancellation(false);
  }
  return _pb;
}

// Server-side instance (no caching)
export function createPocketBase(): PocketBase {
  const pb = new PocketBase(PB_URL);
  pb.autoCancellation(false);
  return pb;
}

export default getPocketBase;
