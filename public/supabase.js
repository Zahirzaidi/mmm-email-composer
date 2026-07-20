const SUPABASE_URL = "https://lnoobnilycanwnejgnek.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxub29ibmlseWNhbnduZWpnbmVrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQxNjU4ODgsImV4cCI6MjA5OTc0MTg4OH0.aB32NErC0jLNCEtUwoC8N-mafNavmGhU9wHI0n851Xg";

if (!window.supabase) {
    throw new Error("Supabase SDK failed to load.");
}

window.mmmSupabaseClient = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY
);

console.log("Supabase connected");
