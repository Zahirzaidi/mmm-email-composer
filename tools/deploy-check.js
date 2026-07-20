const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");
const { createClient } = require("@supabase/supabase-js");

dotenv.config({ path: path.join(__dirname, "..", ".env") });

const root = path.join(__dirname, "..");

function readRuntimeEnv(name) {
    const fileValue = readEnvFileValue(name);

    return fileValue || process.env[name] || "";
}

function readEnvFileValue(name) {
    try {
        const envFile = fs.readFileSync(path.join(root, ".env"), "utf8");
        const parsed = dotenv.parse(envFile);

        if (parsed[name]) {
            return parsed[name];
        }

        const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const match = envFile.match(new RegExp(`^\\s*${escapedName}\\s*=\\s*(.*)\\s*$`, "m"));

        if (!match) {
            return "";
        }

        const rawValue = match[1].trim();

        if (
            (rawValue.startsWith("\"") && rawValue.endsWith("\"")) ||
            (rawValue.startsWith("'") && rawValue.endsWith("'"))
        ) {
            return rawValue.slice(1, -1);
        }

        return rawValue;
    } catch (err) {
        return "";
    }
}

function exists(relativePath) {
    return fs.existsSync(path.join(root, relativePath));
}

function readPublicSupabaseUrl() {
    try {
        const src = fs.readFileSync(path.join(root, "public", "supabase.js"), "utf8");
        const match = src.match(/SUPABASE_URL\s*=\s*"([^"]+)"/);

        return match ? match[1] : "";
    } catch (err) {
        return "";
    }
}

function status(ok, label, detail = "") {
    const marker = ok ? "OK" : "WARN";

    console.log(`${marker}  ${label}${detail ? ` - ${detail}` : ""}`);
}

async function checkSupabaseTables() {
    const url = readRuntimeEnv("SUPABASE_URL") || readPublicSupabaseUrl();
    const key = readRuntimeEnv("SUPABASE_SERVICE_ROLE_KEY");

    if (!url || !key) {
        status(false, "Supabase service role", "SUPABASE_SERVICE_ROLE_KEY not set, production storage cannot be tested");
        return;
    }

    const db = createClient(url, key, {
        auth: {
            persistSession: false
        }
    });

    const tables = [
        "email_records",
        "campaign_drafts",
        "scheduled_campaigns",
        "processed_webhook_ids",
        "webhook_events"
    ];

    for (const table of tables) {
        const { error } = await db
            .from(table)
            .select("*")
            .limit(1);

        status(!error, `Supabase table ${table}`, error ? error.message : "reachable");
    }
}

async function main() {
    const publicAppUrl = readRuntimeEnv("PUBLIC_APP_URL") || process.env.RENDER_EXTERNAL_URL || "";
    const resendFrom = readRuntimeEnv("RESEND_FROM_EMAIL");
    const adminPassword = readRuntimeEnv("ADMIN_PASSWORD");

    status(Boolean(readRuntimeEnv("RESEND_API_KEY")), "RESEND_API_KEY");
    status(Boolean(publicAppUrl), "PUBLIC_APP_URL or RENDER_EXTERNAL_URL");
    status(/^https:\/\//.test(publicAppUrl), "public tracking URL uses HTTPS", publicAppUrl || "not set");
    status(Boolean(resendFrom), "RESEND_FROM_EMAIL", resendFrom || "falls back to onboarding@resend.dev");
    status(Boolean(adminPassword), "ADMIN_PASSWORD", adminPassword ? "admin login enabled" : "admin login disabled");
    status(exists("supabase-schema.sql"), "supabase-schema.sql");
    status(exists("add-mmm-members-category.sql"), "add-mmm-members-category.sql");
    status(exists("supabase-production-schema.sql"), "supabase-production-schema.sql");
    status(exists("render.yaml"), "render.yaml");
    status(exists("DEPLOYMENT.md"), "DEPLOYMENT.md");

    await checkSupabaseTables();
}

main().catch(err => {
    console.error(err.message);
    process.exit(1);
});
