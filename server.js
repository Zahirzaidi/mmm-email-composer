const express = require("express");
const { Resend } = require("resend");
const { createClient } = require("@supabase/supabase-js");
const dotenv = require("dotenv");
const fs = require("fs");
const path = require("path");
const cors = require("cors");
const { marked } = require("marked");
const crypto = require("crypto");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const ANALYTICS_FILE = path.join(__dirname, "analytics-data.json");
const CAMPAIGN_FILE = path.join(__dirname, "campaign-data.json");
const TRACKING_GIF = Buffer.from(
    "R0lGODlhAQABAPAAAP///wAAACH5BAAAAAAALAAAAAABAAEAAAICRAEAOw==",
    "base64"
);

app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: false }));

app.get("/", (req, res) => {

    res.redirect("/email.html");

});

app.get("/analytics", (req, res) => {

    res.redirect("/analytics.html");

});

app.get("/history", (req, res) => {

    res.redirect("/history.html");

});

app.get("/health", (req, res) => {

    res.json({
        ok: true,
        storage: getSupabaseAdmin() ? "supabase" : "local-json",
        publicAppUrl: Boolean(getRuntimeEnv("PUBLIC_APP_URL") || process.env.RENDER_EXTERNAL_URL),
        resendConfigured: Boolean(getRuntimeEnv("RESEND_API_KEY")),
        authEnabled: authEnabled(),
        time: new Date().toISOString()
    });

});

app.use((req, res, next) => {

    if (
        req.path === "/email.html" ||
        req.path === "/login.html" ||
        req.path === "/wizard.js" ||
        req.path === "/preview.html" ||
        req.path === "/preview.js" ||
        req.path === "/success.html" ||
        req.path === "/analytics.html" ||
        req.path === "/analytics.js" ||
        req.path === "/history.html" ||
        req.path === "/history.js" ||
        req.path === "/style.css" ||
        req.path === "/theme.js" ||
        req.path.startsWith("/api/analytics") ||
        req.path.startsWith("/api/campaigns") ||
        req.path.startsWith("/api/drafts") ||
        req.path.startsWith("/api/scheduled")
    ) {

        res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");

    }

    next();

});

function parseCookies(header = "") {

    return header
        .split(";")
        .map(part => part.trim())
        .filter(Boolean)
        .reduce((cookies, part) => {
            const index = part.indexOf("=");

            if (index >= 0) {

                cookies[part.slice(0, index)] = decodeURIComponent(part.slice(index + 1));

            }

            return cookies;
        }, {});

}

function authSecret() {

    return getRuntimeEnv("ADMIN_PASSWORD") || "";

}

function authEnabled() {

    return Boolean(authSecret());

}

function signAuthToken(value) {

    return crypto
        .createHmac("sha256", authSecret())
        .update(value)
        .digest("hex");

}

function createAuthCookieValue() {

    const value = `admin.${Date.now()}`;
    const signature = signAuthToken(value);

    return `${value}.${signature}`;

}

function verifyAuthCookie(req) {

    if (!authEnabled()) {

        return true;

    }

    const cookies = parseCookies(req.get("cookie") || "");
    const token = cookies.mmm_admin || "";
    const parts = token.split(".");

    if (parts.length !== 3) {

        return false;

    }

    const value = `${parts[0]}.${parts[1]}`;
    const expected = signAuthToken(value);
    const provided = parts[2] || "";

    return expected.length === provided.length &&
        crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(provided));

}

function setAuthCookie(req, res) {

    const secure = req.secure || req.get("x-forwarded-proto") === "https";
    const parts = [
        `mmm_admin=${encodeURIComponent(createAuthCookieValue())}`,
        "Path=/",
        "HttpOnly",
        "SameSite=Lax",
        "Max-Age=43200"
    ];

    if (secure) {

        parts.push("Secure");

    }

    res.set("Set-Cookie", parts.join("; "));

}

function clearAuthCookie(res) {

    res.set("Set-Cookie", "mmm_admin=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0");

}

function isPublicPath(req) {

    return req.path === "/login.html" ||
        req.path === "/login" ||
        req.path === "/logout" ||
        req.path === "/style.css" ||
        req.path === "/theme.js" ||
        req.path === "/favicon.ico" ||
        req.path.startsWith("/images/") ||
        req.path.startsWith("/track/open/") ||
        req.path === "/webhooks/resend";

}

app.post("/login", (req, res) => {

    if (!authEnabled()) {

        return res.redirect("/email.html");

    }

    if (String(req.body.password || "") !== authSecret()) {

        return res.redirect("/login.html?error=1");

    }

    setAuthCookie(req, res);
    res.redirect("/email.html");

});

app.post("/logout", (req, res) => {

    clearAuthCookie(res);
    res.redirect("/login.html");

});

app.use((req, res, next) => {

    if (!authEnabled() || isPublicPath(req) || verifyAuthCookie(req)) {

        return next();

    }

    if (req.path.startsWith("/api/") || req.path === "/send" || req.path === "/preview") {

        return res.status(401).send("Please log in.");

    }

    res.redirect("/login.html");

});

app.use(express.static(path.join(__dirname, "public")));

const resend = new Resend(getRuntimeEnv("RESEND_API_KEY"));

/*
|--------------------------------------------------------------------------
| Generate Email HTML
|--------------------------------------------------------------------------
*/

function escapeHtml(value = "") {

    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");

}

function normalizeRecipients(value) {

    const recipients = Array.isArray(value) ? value : [value];

    return recipients
        .map(email => String(email || "").trim())
        .filter(Boolean);

}

let supabaseAdmin = null;

function getPublicSupabaseUrl() {

    try {

        const config = fs.readFileSync(path.join(__dirname, "public", "supabase.js"), "utf8");
        const match = config.match(/SUPABASE_URL\s*=\s*"([^"]+)"/);

        return match ? match[1] : "";

    } catch (err) {

        return "";

    }

}

function getSupabaseAdmin() {

    if (supabaseAdmin !== null) {

        return supabaseAdmin;

    }

    const url = getRuntimeEnv("SUPABASE_URL") || getPublicSupabaseUrl();
    const serviceKey = getRuntimeEnv("SUPABASE_SERVICE_ROLE_KEY");

    supabaseAdmin = url && serviceKey
        ? createClient(url, serviceKey, {
            auth: {
                persistSession: false
            }
        })
        : false;

    return supabaseAdmin;

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

function fromSnakeEmail(record = {}) {

    return {
        id: record.id,
        providerEmailId: record.provider_email_id || null,
        email: record.email || "",
        subject: record.subject || "",
        recipientName: record.recipient_name || "",
        recipientType: record.recipient_type || "",
        category: record.category || "",
        group: record.group_name || "",
        markdown: record.markdown || "",
        buttonText: record.button_text || "",
        buttonLink: record.button_link || "",
        html: record.html || "",
        status: record.status || "sent",
        sentAt: record.sent_at || null,
        deliveredAt: record.delivered_at || null,
        openedAt: record.opened_at || null,
        bouncedAt: record.bounced_at || null,
        failedAt: record.failed_at || null,
        bounce: record.bounce || null,
        error: record.error || null,
        createdAt: record.created_at || null,
        updatedAt: record.updated_at || null
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

function fromSnakeDraft(draft = {}) {

    return {
        id: draft.id,
        type: "draft",
        campaign: draft.campaign || {},
        summary: draft.summary || {},
        createdAt: draft.created_at || null,
        updatedAt: draft.updated_at || null
    };

}

function toSnakeScheduled(item = {}) {

    return {
        id: item.id,
        status: item.status || "scheduled",
        campaign: item.campaign || {},
        summary: item.summary || {},
        scheduled_at: item.scheduledAt || null,
        sent_at: item.sentAt || null,
        results: item.results || null,
        error: item.error || null,
        created_at: item.createdAt || new Date().toISOString(),
        updated_at: item.updatedAt || new Date().toISOString()
    };

}

function fromSnakeScheduled(item = {}) {

    return {
        id: item.id,
        type: "scheduled",
        status: item.status || "scheduled",
        campaign: item.campaign || {},
        summary: item.summary || {},
        scheduledAt: item.scheduled_at || null,
        sentAt: item.sent_at || null,
        results: item.results || null,
        error: item.error || null,
        createdAt: item.created_at || null,
        updatedAt: item.updated_at || null
    };

}

async function readAnalytics() {

    const db = getSupabaseAdmin();

    if (db) {

        const [
            { data: emailRows, error: emailError },
            { data: webhookRows, error: webhookError },
            { data: processedRows, error: processedError }
        ] = await Promise.all([
            db.from("email_records").select("*").order("created_at", { ascending: true }),
            db.from("webhook_events").select("*").order("received_at", { ascending: true }).limit(500),
            db.from("processed_webhook_ids").select("id").order("created_at", { ascending: true }).limit(500)
        ]);

        if (emailError || webhookError || processedError) {

            throw emailError || webhookError || processedError;

        }

        return {
            emails: (emailRows || []).map(fromSnakeEmail),
            processedWebhookIds: (processedRows || []).map(row => row.id),
            webhookEvents: (webhookRows || []).map(row => ({
                svixId: row.svix_id || null,
                type: row.type || "",
                providerEmailId: row.provider_email_id || null,
                recipients: row.recipients || [],
                subject: row.subject || "",
                receivedAt: row.received_at || null
            }))
        };

    }

    if (!fs.existsSync(ANALYTICS_FILE)) {

        return {
            emails: [],
            processedWebhookIds: [],
            webhookEvents: []
        };

    }

    try {

        const analytics = JSON.parse(fs.readFileSync(ANALYTICS_FILE, "utf8"));

        return {
            emails: Array.isArray(analytics.emails) ? analytics.emails : [],
            processedWebhookIds: Array.isArray(analytics.processedWebhookIds)
                ? analytics.processedWebhookIds
                : [],
            webhookEvents: Array.isArray(analytics.webhookEvents)
                ? analytics.webhookEvents
                : []
        };

    } catch (err) {

        console.log(err);

        return {
            emails: [],
            processedWebhookIds: [],
            webhookEvents: []
        };

    }

}

async function writeAnalytics(analytics) {

    const db = getSupabaseAdmin();

    if (db) {

        const emails = Array.isArray(analytics.emails) ? analytics.emails : [];
        const processedWebhookIds = Array.isArray(analytics.processedWebhookIds)
            ? analytics.processedWebhookIds
            : [];
        const webhookEvents = Array.isArray(analytics.webhookEvents)
            ? analytics.webhookEvents
            : [];

        if (emails.length) {

            const { error } = await db
                .from("email_records")
                .upsert(emails.map(toSnakeEmail), { onConflict: "id" });

            if (error) {

                throw error;

            }

        }

        if (processedWebhookIds.length) {

            await db
                .from("processed_webhook_ids")
                .upsert(processedWebhookIds.map(id => ({ id })), { onConflict: "id" });

        }

        const webhookRows = webhookEvents
            .filter(event => event.svixId)
            .map(event => ({
                svix_id: event.svixId,
                type: event.type || "",
                provider_email_id: event.providerEmailId || null,
                recipients: event.recipients || [],
                subject: event.subject || "",
                received_at: event.receivedAt || new Date().toISOString()
            }));

        if (webhookRows.length) {

            const { error } = await db
                .from("webhook_events")
                .upsert(webhookRows, { onConflict: "svix_id" });

            if (error) {

                throw error;

            }

        }

        return;

    }

    fs.writeFileSync(
        ANALYTICS_FILE,
        JSON.stringify(analytics, null, 2)
    );

}

async function readCampaignStore() {

    const db = getSupabaseAdmin();

    if (db) {

        const [{ data: drafts, error: draftError }, { data: scheduled, error: scheduledError }] = await Promise.all([
            db.from("campaign_drafts").select("*").order("updated_at", { ascending: false }),
            db.from("scheduled_campaigns").select("*").order("scheduled_at", { ascending: true })
        ]);

        if (draftError) {

            throw draftError;

        }

        if (scheduledError) {

            throw scheduledError;

        }

        return {
            drafts: (drafts || []).map(fromSnakeDraft),
            scheduled: (scheduled || []).map(fromSnakeScheduled)
        };

    }

    if (!fs.existsSync(CAMPAIGN_FILE)) {

        return {
            drafts: [],
            scheduled: []
        };

    }

    try {

        const store = JSON.parse(fs.readFileSync(CAMPAIGN_FILE, "utf8"));

        return {
            drafts: Array.isArray(store.drafts) ? store.drafts : [],
            scheduled: Array.isArray(store.scheduled) ? store.scheduled : []
        };

    } catch (err) {

        console.log(err);

        return {
            drafts: [],
            scheduled: []
        };

    }

}

async function writeCampaignStore(store) {

    const db = getSupabaseAdmin();

    if (db) {

        const drafts = Array.isArray(store.drafts) ? store.drafts : [];
        const scheduled = Array.isArray(store.scheduled) ? store.scheduled : [];

        if (drafts.length) {

            const { error } = await db
                .from("campaign_drafts")
                .upsert(drafts.map(toSnakeDraft), { onConflict: "id" });

            if (error) {

                throw error;

            }

        }

        if (scheduled.length) {

            const { error } = await db
                .from("scheduled_campaigns")
                .upsert(scheduled.map(toSnakeScheduled), { onConflict: "id" });

            if (error) {

                throw error;

            }

        }

        return;

    }

    fs.writeFileSync(
        CAMPAIGN_FILE,
        JSON.stringify({
            drafts: Array.isArray(store.drafts) ? store.drafts : [],
            scheduled: Array.isArray(store.scheduled) ? store.scheduled : []
        }, null, 2)
    );

}

function sanitizeMember(member = {}) {

    return {
        id: member.id || null,
        name: String(member.name || ""),
        email: String(member.email || ""),
        position: String(member.position || ""),
        phone: String(member.phone || "")
    };

}

function sanitizeCampaign(value = {}) {

    const recipientType = value.recipientType === "category"
        ? "category"
        : "individual";

    return {
        recipientType,
        categoryId: value.categoryId || null,
        category: String(value.category || ""),
        groupId: value.groupId || null,
        group: String(value.group || ""),
        members: Array.isArray(value.members)
            ? value.members.map(sanitizeMember)
            : [],
        recipientEmail: String(value.recipientEmail || ""),
        subject: String(value.subject || ""),
        recipientName: String(value.recipientName || ""),
        markdown: String(value.markdown || ""),
        buttonText: String(value.buttonText || ""),
        buttonLink: String(value.buttonLink || "")
    };

}

function recipientsFromCampaign(campaign = {}) {

    if (campaign.recipientType === "category") {

        return (campaign.members || [])
            .map(member => member.email)
            .filter(Boolean);

    }

    return [campaign.recipientEmail].filter(Boolean);

}

function campaignSummary(campaign = {}) {

    const recipients = recipientsFromCampaign(campaign);

    return {
        recipientCount: recipients.length,
        recipients: recipients.slice(0, 4),
        subject: campaign.subject || "(No subject)",
        recipientType: campaign.recipientType || "individual",
        category: campaign.category || "",
        group: campaign.group || ""
    };

}

function buildSendPayloadFromCampaign(campaign = {}) {

    return {
        email: recipientsFromCampaign(campaign),
        subject: campaign.subject,
        recipientName: campaign.recipientName,
        recipientType: campaign.recipientType,
        category: campaign.category,
        group: campaign.group,
        markdown: campaign.markdown,
        buttonText: campaign.buttonText,
        buttonLink: campaign.buttonLink
    };

}

async function removeDraftRecord(id) {

    const db = getSupabaseAdmin();

    if (db) {

        await db
            .from("campaign_drafts")
            .delete()
            .eq("id", id);

        return;

    }

    const store = await readCampaignStore();
    const before = store.drafts.length;

    store.drafts = store.drafts.filter(draft => draft.id !== id);

    if (store.drafts.length !== before) {

        await writeCampaignStore(store);

    }

}

async function upsertEmailRecord(record) {

    const db = getSupabaseAdmin();

    if (db) {

        const now = new Date().toISOString();
        const { error } = await db
            .from("email_records")
            .upsert(toSnakeEmail({
                ...record,
                updatedAt: now,
                createdAt: record.createdAt || now
            }), { onConflict: "id" });

        if (error) {

            throw error;

        }

        return;

    }

    const analytics = await readAnalytics();
    const index = analytics.emails.findIndex(email => email.id === record.id);
    const now = new Date().toISOString();

    if (index >= 0) {

        analytics.emails[index] = {
            ...analytics.emails[index],
            ...record,
            updatedAt: now
        };

    } else {

        analytics.emails.push({
            ...record,
            createdAt: record.createdAt || now,
            updatedAt: now
        });

    }

    await writeAnalytics(analytics);

}

function eventStatus(type) {

    const statuses = {
        "email.sent": "sent",
        "email.delivered": "delivered",
        "email.opened": "opened",
        "email.bounced": "bounced",
        "email.failed": "failed",
        "email.complained": "complained",
        "email.delivery_delayed": "delayed",
        "email.suppressed": "suppressed"
    };

    return statuses[type] || "sent";

}

function statusPriority(status) {

    const priorities = {
        sending: 1,
        sent: 2,
        delivered: 3,
        delayed: 4,
        opened: 5,
        bounced: 6,
        complained: 7,
        suppressed: 8,
        failed: 9
    };

    return priorities[status] || 0;

}

function applyEmailEvent(analytics, event, svixId) {

    const type = event.type || "";
    const data = event.data || {};
    const providerEmailId = data.email_id || data.emailId || "";
    const recipients = Array.isArray(data.to) ? data.to : [data.to].filter(Boolean);
    const eventCreatedAt = event.created_at || new Date().toISOString();
    const nextStatus = eventStatus(type);

    const index = analytics.emails.findIndex(email => {
        if (providerEmailId && email.providerEmailId === providerEmailId) {
            return true;
        }

        return recipients.includes(email.email) && email.subject === data.subject;
    });

    if (index >= 0) {

        const current = analytics.emails[index];
        const currentPriority = statusPriority(current.status);
        const nextPriority = statusPriority(nextStatus);

        analytics.emails[index] = {
            ...current,
            status: nextPriority >= currentPriority ? nextStatus : current.status,
            providerEmailId: current.providerEmailId || providerEmailId || null,
            deliveredAt: type === "email.delivered" ? eventCreatedAt : current.deliveredAt,
            openedAt: type === "email.opened" ? eventCreatedAt : current.openedAt,
            bouncedAt: type === "email.bounced" ? eventCreatedAt : current.bouncedAt,
            failedAt: type === "email.failed" ? eventCreatedAt : current.failedAt,
            bounce: type === "email.bounced" ? data.bounce || null : current.bounce,
            updatedAt: new Date().toISOString()
        };

    }

    if (svixId) {

        analytics.processedWebhookIds.push(svixId);
        analytics.processedWebhookIds = analytics.processedWebhookIds.slice(-500);

    }

    analytics.webhookEvents.push({
        svixId: svixId || null,
        type,
        providerEmailId: providerEmailId || null,
        recipients,
        subject: data.subject || "",
        receivedAt: new Date().toISOString()
    });

    analytics.webhookEvents = analytics.webhookEvents.slice(-500);

}

async function getAnalyticsSummary() {

    const analytics = await readAnalytics();
    const emails = analytics.emails
        .slice()
        .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));

    const successful = emails.filter(email => {
        return email.status !== "failed" && email.status !== "sending";
    });

    const bounced = emails.filter(email => email.status === "bounced");
    const read = successful.filter(email => Boolean(email.openedAt));
    const unread = successful.filter(email => !email.openedAt && email.status !== "bounced");

    return {
        totals: {
            sent: successful.length,
            bounced: bounced.length,
            read: read.length,
            unread: unread.length,
            failed: emails.filter(email => email.status === "failed").length
        },
        emails: emails.slice(0, 100)
    };

}

function getRuntimeEnv(name) {

    try {

        const envPath = path.join(__dirname, ".env");
        const envFile = fs.readFileSync(envPath, "utf8");
        const env = dotenv.parse(envFile);

        if (env[name]) {

            return env[name];

        }

        const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const rawMatch = envFile.match(new RegExp(`^\\s*${escapedName}\\s*=\\s*(.*)\\s*$`, "m"));

        if (rawMatch) {

            const rawValue = rawMatch[1].trim();

            if (
                (rawValue.startsWith("\"") && rawValue.endsWith("\"")) ||
                (rawValue.startsWith("'") && rawValue.endsWith("'"))
            ) {

                return rawValue.slice(1, -1);

            }

            return rawValue;

        }

    } catch (err) {

        return process.env[name] || "";

    }

    return process.env[name] || "";

}

function buildTrackingBaseUrl(req = null) {

    const publicBaseUrl = (getRuntimeEnv("PUBLIC_APP_URL") ||
        getRuntimeEnv("APP_BASE_URL") ||
        process.env.RENDER_EXTERNAL_URL ||
        "")
        .replace(/\/+$/, "");

    if (publicBaseUrl) {

        return publicBaseUrl;

    }

    if (req) {

        return `${req.protocol}://${req.get("host")}`;

    }

    return `http://localhost:${PORT}`;

}

function buildTrackingUrlFromBase(baseUrl, trackingId) {

    return `${String(baseUrl || "").replace(/\/+$/, "")}/track/open/${trackingId}.gif`;

}

function buildTrackingUrl(req, trackingId) {

    return buildTrackingUrlFromBase(buildTrackingBaseUrl(req), trackingId);

}

function addTrackingPixel(html, trackingUrl) {

    if (!trackingUrl) {

        return html;

    }

    const pixel = `<img src="${escapeHtml(trackingUrl)}" width="1" height="1" alt="" aria-hidden="true" style="display:block;width:1px!important;height:1px!important;max-width:1px!important;max-height:1px!important;opacity:.01;border:0;margin:0;padding:0;overflow:hidden;">`;

    return html.replace("</body>", `${pixel}</body>`);

}

function generateEmail(data = {}, options = {}) {

    let html = fs.readFileSync(path.join(__dirname, "email.html"), "utf8");

    const htmlContent = marked.parse(data.markdown || "");

    html = html
        .replace("{{ISI SINI EMAIL TITLE}}", escapeHtml(data.subject || ""))
        .replace("{{ISI SINI RECIPIENT NAME}}", escapeHtml(data.recipientName || "there"))
        .replace("{{ISI SINI EMAIL CONTENT}}", htmlContent);

    const buttonText = String(data.buttonText || "").trim();
    const buttonLink = String(data.buttonLink || "").trim();

    if (buttonText && buttonLink) {

        html = html
            .replace("{{ISI BUTTON TEXT}}", escapeHtml(buttonText))
            .replace("{{BUTTON_LINK}}", escapeHtml(buttonLink));

    } else {

        html = html
            .replace(/<p[^>]*class="mmm-button-row"[\s\S]*?<\/p>/, "")
            .replace(/<p style="text-align:center;margin:35px 0;">[\s\S]*?<\/p>/, "");

    }

    return addTrackingPixel(html, options.trackingUrl);

}

async function sendEmailBatch(data = {}, trackingBaseUrl = "") {

    if (!getRuntimeEnv("RESEND_API_KEY")) {

        const err = new Error("RESEND_API_KEY is missing in .env.");
        err.statusCode = 500;
        throw err;

    }

    const recipients = normalizeRecipients(data.email);

    if (!recipients.length) {

        const err = new Error("Recipient email is required.");
        err.statusCode = 400;
        throw err;

    }

    const results = [];

    for (const recipient of recipients) {

        const trackingId = crypto.randomUUID();
        const trackingUrl = buildTrackingUrlFromBase(trackingBaseUrl, trackingId);
        const readableHtml = generateEmail(data);
        const html = addTrackingPixel(readableHtml, trackingUrl);
        const baseRecord = {
                id: trackingId,
                providerEmailId: null,
                email: recipient,
                subject: data.subject || "",
                recipientName: data.recipientName || "",
                recipientType: data.recipientType || "",
                category: data.category || "",
                group: data.group || "",
                markdown: data.markdown || "",
                buttonText: data.buttonText || "",
                buttonLink: data.buttonLink || "",
                html: readableHtml,
                status: "sending",
                sentAt: null,
                deliveredAt: null,
            openedAt: null,
            bouncedAt: null,
            failedAt: null,
            bounce: null,
            error: null
        };

        await upsertEmailRecord(baseRecord);

        const { data: resendData, error } = await resend.emails.send({

            from: getRuntimeEnv("RESEND_FROM_EMAIL") || "onboarding@resend.dev",

            to: recipient,

            subject: data.subject,

            html

        });

        if (error) {

            console.log(error);

            await upsertEmailRecord({
                ...baseRecord,
                status: "failed",
                failedAt: new Date().toISOString(),
                error
            });

            results.push({
                email: recipient,
                sent: false,
                error
            });

            continue;

        }

        await upsertEmailRecord({
            ...baseRecord,
            providerEmailId: resendData && resendData.id ? resendData.id : null,
            status: "sent",
            sentAt: new Date().toISOString()
        });

        results.push({
            email: recipient,
            sent: true,
            id: resendData && resendData.id ? resendData.id : null
        });

    }

    return results;

}

/*
|--------------------------------------------------------------------------
| Preview
|--------------------------------------------------------------------------
*/

app.post("/preview", (req, res) => {

    try {

        const html = generateEmail(req.body);

        res.send(html);

    } catch (err) {

        console.log(err);

        res.status(500).send(err.message);

    }

});

/*
|--------------------------------------------------------------------------
| Analytics
|--------------------------------------------------------------------------
*/

app.get("/api/analytics", async (req, res) => {

    try {

        res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
        res.json(await getAnalyticsSummary());

    } catch (err) {

        console.log(err);

        res.status(500).send(err.message);

    }

});

app.get("/track/open/:id.gif", async (req, res) => {

    try {

        const analytics = await readAnalytics();
        const index = analytics.emails.findIndex(email => email.id === req.params.id);
        const now = new Date().toISOString();

        if (index >= 0) {

            analytics.emails[index] = {
                ...analytics.emails[index],
                status: "opened",
                openedAt: analytics.emails[index].openedAt || now,
                updatedAt: now
            };

            await writeAnalytics(analytics);

        }

    } catch (err) {

        console.log(err);

    }

    res.set("Content-Type", "image/gif");
    res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.set("Pragma", "no-cache");
    res.set("Expires", "0");
    res.set("Content-Length", String(TRACKING_GIF.length));
    res.send(TRACKING_GIF);

});

app.post("/webhooks/resend", async (req, res) => {

    const svixId = req.get("svix-id");
    const analytics = await readAnalytics();

    if (svixId && analytics.processedWebhookIds.includes(svixId)) {

        return res.json({
            received: true,
            duplicate: true
        });

    }

    applyEmailEvent(analytics, req.body || {}, svixId);
    await writeAnalytics(analytics);

    res.json({
        received: true
    });

});

/*
|--------------------------------------------------------------------------
| Drafts and Scheduled Campaigns
|--------------------------------------------------------------------------
*/

app.get("/api/campaigns", async (req, res) => {

    try {

        res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
        res.json(await readCampaignStore());

    } catch (err) {

        console.log(err);

        res.status(500).send(err.message);

    }

});

app.post("/api/drafts", async (req, res) => {

    try {

        const campaign = sanitizeCampaign(req.body.campaign || req.body);

        if (!campaign.subject && !campaign.markdown) {

            return res.status(400).send("Please enter a subject or email content before saving a draft.");

        }

        const store = await readCampaignStore();
        const id = String(req.body.id || req.body.draftId || (req.body.campaign && req.body.campaign.draftId) || crypto.randomUUID());
        const now = new Date().toISOString();
        const index = store.drafts.findIndex(draft => draft.id === id);
        const existing = index >= 0 ? store.drafts[index] : null;
        const draft = {
            id,
            type: "draft",
            campaign,
            summary: campaignSummary(campaign),
            createdAt: existing ? existing.createdAt : now,
            updatedAt: now
        };

        if (index >= 0) {

            store.drafts[index] = draft;

        } else {

            store.drafts.unshift(draft);

        }

        await writeCampaignStore(store);

        res.json({
            draft
        });

    } catch (err) {

        console.log(err);

        res.status(500).send(err.message);

    }

});

app.delete("/api/drafts/:id", async (req, res) => {

    const db = getSupabaseAdmin();

    if (db) {

        const { error } = await db
            .from("campaign_drafts")
            .delete()
            .eq("id", req.params.id);

        if (error) {

            return res.status(500).send(error.message);

        }

        return res.json({
            deleted: true
        });

    }

    const store = await readCampaignStore();
    const before = store.drafts.length;

    store.drafts = store.drafts.filter(draft => draft.id !== req.params.id);
    await writeCampaignStore(store);

    res.json({
        deleted: store.drafts.length !== before
    });

});

app.post("/api/scheduled", async (req, res) => {

    try {

        const campaign = sanitizeCampaign(req.body.campaign || {});
        const recipients = recipientsFromCampaign(campaign);
        const scheduledAt = new Date(req.body.scheduledAt);

        if (!recipients.length) {

            return res.status(400).send("Please select at least one recipient.");

        }

        if (!campaign.subject) {

            return res.status(400).send("Please enter an email subject.");

        }

        if (!campaign.markdown) {

            return res.status(400).send("Please write the email content.");

        }

        if ((campaign.buttonText && !campaign.buttonLink) || (!campaign.buttonText && campaign.buttonLink)) {

            return res.status(400).send("Please fill both button text and button link, or leave both empty.");

        }

        if (Number.isNaN(scheduledAt.getTime()) || scheduledAt <= new Date()) {

            return res.status(400).send("Please choose a future date and time.");

        }

        const store = await readCampaignStore();
        const id = String(req.body.id || req.body.scheduledId || crypto.randomUUID());
        const now = new Date().toISOString();
        const index = store.scheduled.findIndex(item => item.id === id);
        const existing = index >= 0 ? store.scheduled[index] : null;
        const item = {
            id,
            type: "scheduled",
            status: "scheduled",
            campaign,
            summary: campaignSummary(campaign),
            scheduledAt: scheduledAt.toISOString(),
            sentAt: existing ? existing.sentAt || null : null,
            results: existing ? existing.results || null : null,
            error: null,
            createdAt: existing ? existing.createdAt : now,
            updatedAt: now
        };

        if (index >= 0) {

            store.scheduled[index] = item;

        } else {

            store.scheduled.unshift(item);

        }

        await writeCampaignStore(store);

        res.json({
            scheduled: item
        });

    } catch (err) {

        console.log(err);

        res.status(500).send(err.message);

    }

});

app.delete("/api/scheduled/:id", async (req, res) => {

    const store = await readCampaignStore();
    const index = store.scheduled.findIndex(item => item.id === req.params.id);

    if (index < 0) {

        return res.json({
            deleted: false
        });

    }

    const item = store.scheduled[index];

    if (item.status === "sending") {

        return res.status(409).send("This email is already sending.");

    }

    const db = getSupabaseAdmin();

    if (db) {

        const { error } = await db
            .from("scheduled_campaigns")
            .delete()
            .eq("id", req.params.id);

        if (error) {

            return res.status(500).send(error.message);

        }

    } else {

        store.scheduled.splice(index, 1);
        await writeCampaignStore(store);

    }

    res.json({
        deleted: true
    });

});

async function sendScheduledRecord(id, trackingBaseUrl) {

    const store = await readCampaignStore();
    const index = store.scheduled.findIndex(item => item.id === id);

    if (index < 0) {

        const err = new Error("Scheduled email not found.");
        err.statusCode = 404;
        throw err;

    }

    const item = store.scheduled[index];

    if (item.status === "sending") {

        const err = new Error("This email is already sending.");
        err.statusCode = 409;
        throw err;

    }

    if (item.status === "sent") {

        return item;

    }

    store.scheduled[index] = {
        ...item,
        status: "sending",
        updatedAt: new Date().toISOString()
    };
    await writeCampaignStore(store);

    try {

        const payload = buildSendPayloadFromCampaign(item.campaign);
        const results = await sendEmailBatch(payload, trackingBaseUrl);
        const sentCount = results.filter(result => result.sent).length;
        const nextStore = await readCampaignStore();
        const nextIndex = nextStore.scheduled.findIndex(record => record.id === id);

        if (nextIndex >= 0) {

            nextStore.scheduled[nextIndex] = {
                ...nextStore.scheduled[nextIndex],
                status: sentCount ? "sent" : "failed",
                sentAt: new Date().toISOString(),
                results,
                error: sentCount ? null : "No emails were sent.",
                updatedAt: new Date().toISOString()
            };

            await writeCampaignStore(nextStore);

            return nextStore.scheduled[nextIndex];

        }

        return {
            ...item,
            status: sentCount ? "sent" : "failed",
            sentAt: new Date().toISOString(),
            results
        };

    } catch (err) {

        const failedStore = await readCampaignStore();
        const failedIndex = failedStore.scheduled.findIndex(record => record.id === id);

        if (failedIndex >= 0) {

            failedStore.scheduled[failedIndex] = {
                ...failedStore.scheduled[failedIndex],
                status: "failed",
                error: err.message,
                updatedAt: new Date().toISOString()
            };

            await writeCampaignStore(failedStore);

        }

        throw err;

    }

}

app.post("/api/scheduled/:id/send-now", async (req, res) => {

    try {

        const scheduled = await sendScheduledRecord(req.params.id, buildTrackingBaseUrl(req));

        res.json({
            scheduled
        });

    } catch (err) {

        console.log(err);

        res.status(err.statusCode || 500).send(err.message);

    }

});

/*
|--------------------------------------------------------------------------
| Send Email
|--------------------------------------------------------------------------
*/

app.post("/send", async (req, res) => {

    try {

        const results = await sendEmailBatch(req.body, buildTrackingBaseUrl(req));

        console.log("Email Sent");
        console.log(results);

        const sentCount = results.filter(result => result.sent).length;
        const statusCode = sentCount ? 200 : 500;

        if (sentCount && req.body.draftId) {

            await removeDraftRecord(String(req.body.draftId));

        }

        res.status(statusCode).json({
            message: "Email sent successfully.",
            results
        });

    } catch (err) {

        console.log(err);

        res.status(err.statusCode || 500).send(err.message);

    }

});

let scheduledRunnerActive = false;

async function processDueScheduledCampaigns() {

    if (scheduledRunnerActive) {

        return;

    }

    scheduledRunnerActive = true;

    try {

        const store = await readCampaignStore();
        const now = Date.now();
        const due = store.scheduled.filter(item => {
            return item.status === "scheduled" &&
                new Date(item.scheduledAt).getTime() <= now;
        });

        for (const item of due) {

            await sendScheduledRecord(item.id, buildTrackingBaseUrl());

        }

    } catch (err) {

        console.log(err);

    } finally {

        scheduledRunnerActive = false;

    }

}

setInterval(() => {

    processDueScheduledCampaigns();

}, 30000);

/*
|--------------------------------------------------------------------------
| Start Server
|--------------------------------------------------------------------------
*/

app.listen(PORT, () => {

    console.log("--------------------------------");
    console.log("MMM Email Composer");
    console.log(`http://localhost:${PORT}`);
    console.log("--------------------------------");
    processDueScheduledCampaigns();

});
