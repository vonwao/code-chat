import { URL } from 'url';

export function normalizeAuthConfig(config) {
  const auth = config?.auth ?? {};
  const enabled = auth.enabled === true;
  const keys = Array.isArray(auth.keys)
    ? auth.keys.filter((key) => typeof key === 'string' && key.trim().length > 0)
    : [];

  return { enabled, keys };
}

export function isValidKey(authConfig, key) {
  if (!authConfig.enabled) return true;
  if (typeof key !== 'string' || key.trim().length === 0) return false;
  return authConfig.keys.includes(key);
}

export function getKeyFromHttpRequest(req) {
  const headerKey = req?.headers?.['x-api-key'];
  if (typeof headerKey === 'string' && headerKey.trim().length > 0) {
    return headerKey.trim();
  }

  const queryKey = req?.query?.key;
  if (typeof queryKey === 'string' && queryKey.trim().length > 0) {
    return queryKey.trim();
  }

  return null;
}

export function getKeyFromWebSocketRequest(req) {
  if (!req?.url) return null;

  const base = `http://${req.headers.host || 'localhost'}`;
  const parsed = new URL(req.url, base);
  const key = parsed.searchParams.get('key');
  if (typeof key === 'string' && key.trim().length > 0) {
    return key.trim();
  }

  return null;
}
