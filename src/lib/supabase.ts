import { createClient } from '@supabase/supabase-js';

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
export const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY. Copy .env.example to .env.');
}

// Sessions live in sessionStorage, so every browser tab is its own agent
// (handy for testing on one laptop) and a refresh keeps you in your seat.
export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { storage: window.sessionStorage, storageKey: 'letterless-auth', persistSession: true, autoRefreshToken: true },
});

/** Signs this tab in as an anonymous agent if it isn't already. Returns the user id. */
let pending: Promise<string> | null = null;
export function ensureSession(): Promise<string> {
  pending ??= signIn().finally(() => { pending = null; });
  return pending;
}

async function signIn(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  if (data.session) return data.session.user.id;
  const { data: signedIn, error } = await supabase.auth.signInAnonymously();
  if (error?.status === 429) throw new Error('Too many new agents from this network. Wait a minute, then reload.');
  if (error || !signedIn.user) throw new Error('Could not reach the Letterless server. Check your connection and reload.');
  return signedIn.user.id;
}
