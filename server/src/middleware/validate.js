import { AppError } from '../lib/errors.js';

export function validate({ body, query, params } = {}) {
  return (req, res, next) => {
    const checks = [
      ['body', body, req.body],
      ['query', query, req.query],
      ['params', params, req.params],
    ];

    const failures = [];
    const parsed = {};

    for (const [name, schema, value] of checks) {
      if (!schema) {
        continue;
      }

      const result = schema.safeParse(value);

      if (!result.success) {
        for (const issue of result.error.issues) {
          failures.push({ name, issue });
        }
        continue;
      }

      parsed[name] = result.data;
    }

    if (failures.length > 0) {
      const message = failures
        .map(({ name, issue }) => {
          const path = issue.path.join('.');
          return path ? `${name}.${path}: ${issue.message}` : `${name}: ${issue.message}`;
        })
        .join(', ');

      next(new AppError('VALIDATION_ERROR', message));
      return;
    }

    if (parsed.body !== undefined) {
      req.body = parsed.body;
    }

    if (parsed.params !== undefined) {
      req.params = parsed.params;
    }

    if (parsed.query !== undefined) {
      Object.defineProperty(req, 'query', {
        value: parsed.query,
        writable: true,
        configurable: true,
        enumerable: true,
      });
    }

    next();
  };
}
