const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");
const { createClient } = require("@supabase/supabase-js");

dotenv.config({ path: path.join(__dirname, "..", ".env") });

function readPublicSupabaseUrl() {
    const config = fs.readFileSync(path.join(__dirname, "..", "public", "supabase.js"), "utf8");
    const match = config.match(/SUPABASE_URL\s*=\s*"([^"]+)"/);

    return match ? match[1] : "";
}

const SUPABASE_URL = process.env.SUPABASE_URL || readPublicSupabaseUrl();
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
    process.exit(1);
}

const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
        persistSession: false
    }
});

function readJson(filename, fallback) {
    const file = path.join(__dirname, "..", filename);

    if (!fs.existsSync(file)) {
        return fallback;
    }

    return JSON.parse(fs.readFileSync(file, "utf8"));
}

function toSnakeEmail(record = {}) {
    return {
        id: record.id,
        provider_email_id: record.providerEmailId || null,
        email: record.email || "",
        subject: record.subject || "",
        recipient_name: record.recipientName || "",
        recipient_type: record.recipientType || "",
        category: record.category || "",
        group_name: record.group || "",
        markdown: record.markdown || "",
        button_text: record.buttonText || "",
        button_link: record.buttonLink || "",
        html: record.html || "",
        status: record.status || "sent",
        sent_at: record.sentAt || null,
        delivered_at: record.deliveredAt || null,
        opened_at: record.openedAt || null,
        bounced_at: record.bouncedAt || null,
        failed_at: record.failedAt || null,
        bounce: record.bounce || null,
        error: record.error || null,
        created_at: record.createdAt || new Date().toISOString(),
        updated_at: record.updatedAt || new Date().toISOString()
    };
}

function toSnakeDraft(draft = {}) {
    return {
        id: draft.id,
        campaign: draft.campaign || {},
        summary: draft.summary || {},
        created_at: draft.createdAt || new Date().toISOString(),
        updated_at: draft.updatedAt || new Date().toISOString()
    };
}

function toSnakeScheduled(item = {}) {
    return {
        id: item.id,
        status: item.status || "scheduled",
        campaign: item.campaign || {},
        summary: item.summary || {},
        scheduled_at: item.scheduledAt || new Date().toISOString(),
        sent_at: item.sentAt || null,
        results: item.results || null,
        error: item.error || null,
        created_at: item.createdAt || new Date().toISOString(),
        updated_at: item.updatedAt || new Date().toISOString()
    };
}

async function upsert(table, rows, onConflict) {
    if (!rows.length) {
        return 0;
    }

    const { error } = await db
        .from(table)
        .upsert(rows, { onConflict });

    if (error) {
        throw error;
    }

    return rows.length;
}

async function main() {
    const analytics = readJson("analytics-data.json", {
        emails: [],
        processedWebhookIds: [],
        webhookEvents: []
    });
    const campaigns = readJson("campaign-data.json", {
        drafts: [],
        scheduled: []
    });

    const emailCount = await upsert(
        "email_records",
        (analytics.emails || []).map(toSnakeEmail),
        "id"
    );
    const processedCount = await upsert(
        "processed_webhook_ids",
        (analytics.processedWebhookIds || []).map(id => ({ id })),
        "id"
    );
    const webhookRows = (analytics.webhookEvents || [])
        .filter(event => event.svixId)
        .map(event => ({
            svix_id: event.svixId,
            type: event.type || "",
            provider_email_id: event.providerEmailId || null,
            recipients: event.recipients || [],
            subject: event.subject || "",
            received_at: event.receivedAt || new Date().toISOString()
        }));
    const webhookCount = await upsert("webhook_events", webhookRows, "svix_id");
    const draftCount = await upsert(
        "campaign_drafts",
        (campaigns.drafts || []).map(toSnakeDraft),
        "id"
    );
    const scheduledCount = await upsert(
        "scheduled_campaigns",
        (campaigns.scheduled || []).map(toSnakeScheduled),
        "id"
    );

    console.log(JSON.stringify({
        emailRecords: emailCount,
        processedWebhookIds: processedCount,
        webhookEvents: webhookCount,
        drafts: draftCount,
        scheduled: scheduledCount
    }, null, 2));
}

main().catch(err => {
    console.error(err.message);
    process.exit(1);
});
