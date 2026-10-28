// A message to show once after the next full page load, e.g. "Account created" after
// registering (which reloads the page). Kept in sessionStorage so it survives the reload.
const FLASH_KEY = 'stockflow.flash';

export function setFlash(message, severity = 'success') {
  try {
    sessionStorage.setItem(FLASH_KEY, JSON.stringify({ message, severity }));
  } catch {
    // storage unavailable - the message is just not shown
  }
}

// Returns the message (or null) and removes it, so it is shown only once.
export function takeFlash() {
  try {
    const raw = sessionStorage.getItem(FLASH_KEY);
    sessionStorage.removeItem(FLASH_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
