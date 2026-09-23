const TOKEN_KEY = 'checkly:token'

/**
 * Where the per-user session lives (token, user, open board).
 *
 * On the mock backend it is the TAB's sessionStorage, so two tabs can be two
 * different people on the same browser — the only way to try sharing a board
 * without a server. With a real backend it is localStorage, so a login
 * survives closing the browser. (The mock database itself is always shared.)
 */
export function sessionArea(): Storage {
  return import.meta.env.VITE_API_URL ? localStorage : sessionStorage
}

// A bearer token in web storage is the simplest thing that works for a
// static SPA; the backend brief lists httpOnly cookies as the hardened option.
export function getToken(): string | null {
  try {
    return sessionArea().getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function setToken(token: string | null): void {
  try {
    if (token) sessionArea().setItem(TOKEN_KEY, token)
    else sessionArea().removeItem(TOKEN_KEY)
  } catch {
    // storage blocked — the session simply won't survive a reload
  }
}

let onUnauthorized: (() => void) | null = null

/** The user store registers itself here so a 401 anywhere logs the user out. */
export function setUnauthorizedHandler(handler: (() => void) | null): void {
  onUnauthorized = handler
}

export function notifyUnauthorized(): void {
  onUnauthorized?.()
}

let onSessionStart: (() => Promise<void>) | null = null

/**
 * The app registers "load the board" here. A login only counts once it has
 * run, so the board never opens empty and then fills in.
 */
export function setSessionStartHandler(handler: (() => Promise<void>) | null): void {
  onSessionStart = handler
}

export async function runSessionStart(): Promise<void> {
  await onSessionStart?.()
}
