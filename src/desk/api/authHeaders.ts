import { getSupabaseClient, isSupabaseConfigured } from "../../services/supabaseClient";

/** The signed-in user's bearer header for the app's own API, or {} when signed out. */
export async function authHeaders(): Promise<Record<string, string>> {
  if (!isSupabaseConfigured()) return {};
  const { data } = await getSupabaseClient().auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}
