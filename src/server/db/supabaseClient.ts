import { createClient, SupabaseClient } from '@supabase/supabase-js';

export interface SupabaseStatus {
  urlConfigured: boolean;
  anonKeyConfigured: boolean;
  serviceRoleConfigured: boolean;
  reachable: boolean;
  schemaReady: boolean;
  activePersistenceMode: 'local_sqlite_with_supabase_staged' | 'local_sqlite_only';
  note: string;
}

let anonClient: SupabaseClient | null = null;
let serviceClient: SupabaseClient | null = null;

export function getSupabaseAnonClient(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_ANON_KEY?.trim();
  if (!url || !key) return null;
  if (!anonClient) {
    anonClient = createClient(url, key, { auth: { persistSession: false } });
  }
  return anonClient;
}

export function getSupabaseServiceClient(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceKey) return null;
  if (!serviceClient) {
    serviceClient = createClient(url, serviceKey, { auth: { persistSession: false } });
  }
  return serviceClient;
}

export async function checkSupabaseStatus(): Promise<SupabaseStatus> {
  const url = process.env.SUPABASE_URL?.trim();
  const anonKey = process.env.SUPABASE_ANON_KEY?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  const urlConfigured = Boolean(url && url.startsWith('https://'));
  const anonKeyConfigured = Boolean(anonKey && anonKey.length > 12);
  const serviceRoleConfigured = Boolean(serviceKey && serviceKey.length > 12);

  if (!urlConfigured || !anonKeyConfigured) {
    return {
      urlConfigured,
      anonKeyConfigured,
      serviceRoleConfigured,
      reachable: false,
      schemaReady: false,
      activePersistenceMode: 'local_sqlite_only',
      note: 'Supabase URL or Anon Key not configured; running on local SQLite.',
    };
  }

  let reachable = false;
  let schemaReady = false;

  try {
    const client = getSupabaseServiceClient() || getSupabaseAnonClient();
    if (client) {
      const { error } = await client.from('organisations').select('id').limit(1);
      reachable = true;
      if (!error) {
        schemaReady = true;
      }
    }
  } catch {
    reachable = false;
  }

  let note = 'Supabase URL and Anon Key configured.';
  if (!serviceRoleConfigured) {
    note = 'Supabase URL & Anon Key configured; awaiting SUPABASE_SERVICE_ROLE_KEY and SQL schema migration (active persistence: local SQLite).';
  } else if (!schemaReady) {
    note = 'Supabase keys configured; run migrations/postgres_supabase_reference.sql in Supabase SQL Editor to create tables.';
  } else {
    note = 'Supabase project reachable and schema tables verified.';
  }

  return {
    urlConfigured,
    anonKeyConfigured,
    serviceRoleConfigured,
    reachable,
    schemaReady,
    activePersistenceMode: 'local_sqlite_with_supabase_staged',
    note,
  };
}
