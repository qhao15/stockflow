// A business-rule failure (not found, wrong status, not enough stock...) with the HTTP
// status the route should answer with. details are sent along with the message.
export class AppError extends Error {
  constructor(message, status = 409, details = {}) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

// Express error helper for routes: AppErrors become their status + message, anything
// else goes to the generic 500 handler.
export function sendAppError(res, err, next) {
  if (err instanceof AppError) return res.status(err.status).json({ message: err.message, ...err.details });
  next(err);
}
