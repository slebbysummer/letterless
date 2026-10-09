import { sampleServerTime } from './clock.ts';
import { SUPABASE_KEY, SUPABASE_URL, supabase } from './supabase.ts';

export class ApiError extends Error {}

/** Calls the referee edge function. Throws ApiError with a player-friendly message. */
export async function referee<T = Record<string, unknown>>(action: string, body: Record<string, unknown> = {}): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new ApiError('Your session has expired. Reload the page.');
  const sentAt = Date.now();
  let res: Response;
  try {
    res = await fetch(`${SUPABASE_URL}/functions/v1/referee`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: SUPABASE_KEY, Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action, ...body }),
    });
  } catch {
    throw new ApiError('Connection lost. Check your signal and try again.');
  }
  const json = await res.json().catch(() => ({}));
  if (typeof json.now === 'number') sampleServerTime(json.now, sentAt, Date.now());
  if (!res.ok) throw new ApiError(json.error ?? 'Something went wrong. Try again.');
  return json as T;
}
