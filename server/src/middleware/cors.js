import cors from 'cors';

export function parseCorsOrigins(value) {
  return value
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}

export function createCorsMiddleware(allowlist) {
  const allowed = new Set(allowlist);

  return cors({
    credentials: true,
    origin(origin, callback) {
      if (origin && allowed.has(origin)) {
        callback(null, origin);
        return;
      }

      callback(null, false);
    },
  });
}
