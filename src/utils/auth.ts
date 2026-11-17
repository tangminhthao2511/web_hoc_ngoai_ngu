import type { Language } from '../types';
import { apiRequest } from '../services/api';

export interface AuthUserSession {
  userId: string;
  name: string;
  email: string;
  preferredLanguage: Language;
  isGuest?: boolean;
  loggedInAt: string;
}
interface AuthResponse { user: { id: string; name: string; email: string; preferredLanguage?: string } }
const GUEST_KEY = 'manabi_guest_session_v2';

function toSession(data: AuthResponse): AuthUserSession {
  return { userId: data.user.id, name: data.user.name, email: data.user.email,
    preferredLanguage: data.user.preferredLanguage === 'jp' ? 'jp' : 'en', isGuest: false, loggedInAt: new Date().toISOString() };
}

export async function getAuthSession(): Promise<AuthUserSession | null> {
  // Legacy local sessions and plaintext accounts have no authority on the server.
  localStorage.removeItem('manabi_accounts_v1');
  localStorage.removeItem('manabi_auth_session_v1');
  sessionStorage.removeItem('manabi_auth_session_v1');
  const result = await apiRequest<AuthResponse | null>('/api/auth/get-session');
  if (result?.user) return toSession(result);
  try {
    const guest = JSON.parse(sessionStorage.getItem(GUEST_KEY) || 'null');
    return guest?.isGuest && guest.userId === 'guest-local' ? guest : null;
  } catch { return null; }
}

export async function loginWithEmail(params: { email: string; password: string; remember: boolean }) {
  try {
    const data = await apiRequest<AuthResponse>('/api/auth/sign-in/email', { method: 'POST', body: JSON.stringify({
      email: params.email.trim(), password: params.password, rememberMe: params.remember,
    }) });
    sessionStorage.removeItem(GUEST_KEY);
    return { ok: true as const, session: toSession(data) };
  } catch (error) { return { ok: false as const, error: error instanceof Error ? error.message : 'Không đăng nhập được.' }; }
}

export async function registerAccount(params: { name: string; email: string; password: string; preferredLanguage: Language }) {
  try {
    const data = await apiRequest<AuthResponse>('/api/auth/sign-up/email', { method: 'POST', body: JSON.stringify({
      ...params, name: params.name.trim(), email: params.email.trim(),
    }) });
    sessionStorage.removeItem(GUEST_KEY);
    return { ok: true as const, session: toSession(data) };
  } catch (error) { return { ok: false as const, error: error instanceof Error ? error.message : 'Không đăng ký được.' }; }
}

export function loginAsGuest(preferredLanguage: Language): AuthUserSession {
  const session = { userId: 'guest-local', name: 'Học viên Khách', email: 'guest@local', preferredLanguage, isGuest: true, loggedInAt: new Date().toISOString() };
  sessionStorage.setItem(GUEST_KEY, JSON.stringify(session));
  return session;
}

export async function logoutAuthSession(isGuest = false): Promise<void> {
  if (!isGuest) await apiRequest('/api/auth/sign-out', { method: 'POST', body: '{}' });
  sessionStorage.removeItem(GUEST_KEY);
}

export async function loginWithGoogle() {
  const data = await apiRequest<{ url: string }>('/api/auth/sign-in/social', { method: 'POST', body: JSON.stringify({ provider: 'google', callbackURL: window.location.origin, disableRedirect: true }) });
  window.location.assign(data.url);
}
