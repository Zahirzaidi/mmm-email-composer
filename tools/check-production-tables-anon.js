const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

const src = fs.readFileSync(path.join(__dirname, "..", "public", "supabase.js"), "utf8");
const url = (src.match(/SUPABASE_URL\s*=\s*"([^"]+)"/) || [])[1];
const key = (src.match(/SUPABASE_ANON_KEY\s*=\s*"([^"]+)"/) || [])[1];
const db = createClient(url, key);

const tables = [
    "email_records",
    "campaign_drafts",
    "scheduled_campaigns",
    "processed_webhook_ids",
    "webhook_events"
];

async function main() {
    for (const table of tables) {
        const { error } = await db
            .from(table)
            .select("*")
            .limit(1);

        console.log(JSON.stringify({
            table,
            ok: !error,
            message: error ? error.message : "reachable"
        }));
    }
}

main().catch(err => {
    console.error(err.message);
    process.exit(1);
});
