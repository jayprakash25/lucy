import "server-only";

import { createClient } from "@supabase/supabase-js";

import { config } from "@/lib/config";

import type { Database } from "./database-types";

let databaseClient: ReturnType<typeof createClient<Database>> | undefined;

export function createDatabaseClient() {
  databaseClient ??= createClient<Database>(config.supabaseUrl, config.supabaseSecretKey, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
  });

  return databaseClient;
}
