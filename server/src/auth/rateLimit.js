import { rateLimit } from 'express-rate-limit';

// Limits are per IP address and kept in memory, which is fine for a single server.
// Answers 429 with a message the client shows like any other error.
const limiter = (options) => rateLimit({
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  ...options,
  handler: (req, res, next, opts) => res.status(opts.statusCode).json({ message: options.message }),
});

// Every API route: generous enough for the grids (one request per page of rows).
export const apiLimiter = limiter({
  windowMs: 60 * 1000,
  limit: 300,
  message: 'Too many requests, please slow down and try again in a minute',
});

// Login and register: only failed attempts count, so password guessing is slowed
// down while a user who signs in normally is never blocked.
export const authLimiter = limiter({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  message: 'Too many attempts. Please wait 15 minutes and try again.',
});
