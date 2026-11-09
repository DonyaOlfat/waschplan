import pino from 'pino';
import pinoHttp from 'pino-http';

export function createRequestLogger(nodeEnv, destination) {
  const options = {
    // The standard serializers copy the raw header objects, so a redact path
    // still logs the cookie. These serializers choose the logged fields.
    wrapSerializers: false,
    serializers: {
      req: serializeRequest,
      res: serializeResponse,
    },
  };

  if (nodeEnv === 'test') {
    options.logger = pino({ enabled: false });
    options.autoLogging = false;
  }

  return destination ? pinoHttp(options, destination) : pinoHttp(options);
}

export function serializeRequest(req) {
  const connection = req.info || req.socket;
  const serialized = {
    id: requestId(req),
    method: req.method,
    url: requestUrl(req),
    headers: headersWithout(req.headers, 'cookie', 'Cookie'),
    remoteAddress: own(req, 'remoteAddress', connection && connection.remoteAddress),
    remotePort: own(req, 'remotePort', connection && connection.remotePort),
  };

  if (req.query) {
    serialized.query = withoutSecrets(req.query);
  }

  if (req.params) {
    serialized.params = withoutSecrets(req.params);
  }

  return serialized;
}

export function serializeResponse(res) {
  const source = typeof res.getHeaders === 'function' ? res.getHeaders() : res.headers;

  return {
    statusCode: res.headersSent ? res.statusCode : null,
    headers: headersWithout(source, 'set-cookie', 'Set-Cookie'),
  };
}

function requestId(req) {
  if (typeof req.id === 'function') {
    return req.id();
  }

  if (req.id != null && req.id !== '') {
    return req.id;
  }

  return req.info ? req.info.id : undefined;
}

function requestUrl(req) {
  if (req.originalUrl) {
    return req.originalUrl;
  }

  if (typeof req.path === 'string') {
    return req.path;
  }

  if (!req.url) {
    return undefined;
  }

  return req.url.path || req.url;
}

function own(req, name, fallback) {
  return Object.hasOwn(req, name) ? req[name] : fallback;
}

function headersWithout(source, ...names) {
  const headers = { ...(source ?? {}) };

  for (const name of names) {
    delete headers[name];
  }

  return headers;
}

function withoutSecrets(value) {
  if (!value || typeof value !== 'object') {
    return value;
  }

  const copy = { ...value };
  delete copy.password;
  delete copy.passwordHash;
  return copy;
}
