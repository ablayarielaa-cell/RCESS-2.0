// Simple client-side auth (static site): localStorage-backed.
// This is NOT secure; it's a prototype flow for UI behavior.

export type Role = "guest" | "viewer" | "admin" | "staff" | "sports";

const LS_KEY = "rcess.session.v1";

export type Session = {
  role: Role;
  email?: string;
};

export function getSession(): Session {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return { role: "guest" };
    const parsed = JSON.parse(raw) as Session;

    const role = parsed?.role;
    if (role === "admin" || role === "staff" || role === "sports" || role === "viewer") {
      return parsed;
    }

    // "guest" can be an authenticated demo account (limited tabs)
    if (role === "guest" && typeof parsed?.email === "string" && parsed.email.trim()) {
      return parsed;
    }

    return { role: "guest" };
  } catch {
    return { role: "guest" };
  }
}

export function setSession(session: Session) {
  localStorage.setItem(LS_KEY, JSON.stringify(session));
}

export function clearSession() {
  localStorage.removeItem(LS_KEY);
}

// Credentials (prototype)
// - admin/admin → full admin
// - staff/staff → can be granted Settings edits via permission toggles
// - sports/sports → can be granted Brackets edits via permission toggles
export const ADMIN_EMAIL = "admin";
export const ADMIN_PASSWORD = "admin";
export const STAFF_EMAIL = "staff";
export const STAFF_PASSWORD = "staff";
export const SPORTS_EMAIL = "sports";
export const SPORTS_PASSWORD = "sports";
export const VIEWER_EMAIL = "viewer";
export const VIEWER_PASSWORD = "viewer";

export function continueAsGuest(): Session {
  const s: Session = { role: "guest", email: "guest" };
  setSession(s);
  return s;
}

export function login(email: string, password: string): Session {
  const normalized = email.trim();
  const pass = password;

  if (normalized === ADMIN_EMAIL && pass === ADMIN_PASSWORD) {
    const s: Session = { role: "admin", email: normalized };
    setSession(s);
    return s;
  }

  if (normalized === STAFF_EMAIL && pass === STAFF_PASSWORD) {
    const s: Session = { role: "staff", email: normalized };
    setSession(s);
    return s;
  }

  if (normalized === SPORTS_EMAIL && pass === SPORTS_PASSWORD) {
    const s: Session = { role: "sports", email: normalized };
    setSession(s);
    return s;
  }

  if (normalized === VIEWER_EMAIL && pass === VIEWER_PASSWORD) {
    const s: Session = { role: "viewer", email: normalized };
    setSession(s);
    return s;
  }

  // Invalid credentials: keep as unauthenticated guest
  return { role: "guest" };
}
