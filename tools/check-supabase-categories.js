const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

const src = fs.readFileSync(path.join(__dirname, "..", "public", "supabase.js"), "utf8");
const url = (src.match(/SUPABASE_URL\s*=\s*"([^"]+)"/) || [])[1];
const key = (src.match(/SUPABASE_ANON_KEY\s*=\s*"([^"]+)"/) || [])[1];
const db = createClient(url, key);

async function main() {
    const { data, error } = await db
        .from("categories")
        .select("id,name")
        .order("id", { ascending: true });

    if (error) {
        throw error;
    }

    console.log(JSON.stringify(data, null, 2));
}

main().catch(err => {
    console.error(err.message);
    process.exit(1);
});
