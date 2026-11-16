import { rateLimit } from 'express-rate-limit';

// Limits are per IP address and kept in memory, which is fine for a single server.
// Answers 429 with a message the client shows like any other error.
const limiter = (options) => rateLimit({
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  ...options,
  handler: (req, res, next, opts) => res.status(opts.statusCode).json({ message: options.message }),
});

// Every API route: generous enough for the grids (one request per page of rows). The browser
// tests raise it, because a whole test run comes from one address.
export const apiLimiter = limiter({
  windowMs: 60 * 1000,
  limit: Number(process.env.API_RATE_LIMIT) || 300,
  message: 'Too many requests, please slow down and try again in a minute',
});

// The assistant, per user rather than per address: questions will cost money once an AI model
// answers them, and shared demo logins mean many people can sit behind one address.
const perUser = (req) => `user-${req.user.id}`;
export const chatLimiter = limiter({
  windowMs: 60 * 1000,
  limit: 10,
  keyGenerator: perUser,
  message: 'Too many questions, please wait a minute',
});
export const chatDailyLimiter = limiter({
  windowMs: 24 * 60 * 60 * 1000,
  limit: 100,
  keyGenerator: perUser,
  message: "You've reached today's limit for the assistant. Please try again tomorrow.",
});

// Login and register: only failed attempts count, so password guessing is slowed
// down while a user who signs in normally is never blocked.
export const authLimiter = limiter({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  message: 'Too many attempts. Please wait 15 minutes and try again.',
});
