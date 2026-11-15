import { createBrowserClient } from "@careos/supabase-client";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "https://vbckrirksziluvwqpamx.supabase.co";
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || "placeholder-anon-key";

export const supabase = createBrowserClient(supabaseUrl, supabaseAnonKey);
