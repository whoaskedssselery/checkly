/**
 * Origins allowed to call the API from a browser: `CORS_ORIGIN`, comma
 * separated. Unset = allow any (local development only). Read on every call
 * so it works no matter when the environment was loaded.
 */
export function allowedOrigins(): string[] | true {
  const raw = process.env.CORS_ORIGIN;
  if (!raw) return true;
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/** For socket.io: requests without an Origin (non-browser clients) are allowed. */
export function isOriginAllowed(origin: string | undefined): boolean {
  const allowed = allowedOrigins();
  if (allowed === true || !origin) return true;
  return allowed.includes(origin);
}
