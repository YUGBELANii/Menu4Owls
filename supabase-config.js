// ─────────────────────────────────────────────────────────
// SUPABASE CONFIG — fill these in from your Supabase project
// Project Settings → API → Project URL / anon public key
// ─────────────────────────────────────────────────────────
const SUPABASE_URL = "https://esssqvqvdxeqbnoirskz.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVzc3NxdnF2ZHhlcWJub2lyc2t6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMzNTU1NTcsImV4cCI6MjA5ODkzMTU1N30.DtM7jV6iI-rozVh3yOvBsFyyWlhflstpt9fqcC4F_SU";

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);