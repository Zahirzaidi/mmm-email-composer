const historyCount = document.getElementById("historyCount");
const draftCount = document.getElementById("draftCount");
const scheduledCount = document.getElementById("scheduledCount");
const historyRows = document.getElementById("historyRows");
const draftRows = document.getElementById("draftRows");
const scheduledRows = document.getElementById("scheduledRows");
const refreshHistory = document.getElementById("refreshHistory");
const historyEmailModal = document.getElementById("historyEmailModal");
const closeHistoryEmail = document.getElementById("closeHistoryEmail");
const historyEmailTitle = document.getElementById("historyEmailTitle");
const historyEmailMeta = document.getElementById("historyEmailMeta");
const readerRecipient = document.getElementById("readerRecipient");
const readerStatus = document.getElementById("readerStatus");
const readerSentAt = document.getElementById("readerSentAt");
const historyEmailFrame = document.getElementById("historyEmailFrame");
const historySearch = document.getElementById("historySearch");
const historyRangeButtons = document.querySelectorAll("[data-history-range]");
const tabButtons = document.querySelectorAll(".tab-button");
const panels = {
    history: document.getElementById("historyPanel"),
    drafts: document.getElementById("draftsPanel"),
    scheduled: document.getElementById("scheduledPanel")
};

let allHistoryEmails = [];
let allDrafts = [];
let allScheduled = [];
let activeHistoryRange = "all";

function formatDate(value) {
    if (!value) {
        return "-";
    }

    return new Intl.DateTimeFormat("en-MY", {
        dateStyle: "medium",
        timeStyle: "short"
    }).format(new Date(value));
}

function statusLabel(status) {
    const labels = {
        sending: "Sending",
        scheduled: "Scheduled",
        sent: "Sent",
        delivered: "Delivered",
        opened: "Read",
        bounced: "Bounced",
        failed: "Failed",
        delayed: "Delayed",
        complained: "Complained",
        suppressed: "Suppressed"
    };

    return labels[status] || "Sent";
}

function renderStatus(status) {
    const badge = document.createElement("span");
    badge.className = `status-badge status-${status || "sent"}`;
    badge.textContent = statusLabel(status);
    return badge;
}

function setCell(row, value) {
    const cell = document.createElement("td");

    if (value instanceof HTMLElement) {
        cell.appendChild(value);
    } else {
        cell.textContent = value || "-";
    }

    row.appendChild(cell);
}

function setEmptyRow(container, colspan, message) {
    container.innerHTML = "";

    const row = document.createElement("tr");
    const cell = document.createElement("td");

    cell.colSpan = colspan;
    cell.textContent = message;
    row.appendChild(cell);
    container.appendChild(row);
}

function escapeHtml(value) {
    return String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function showModal(modal) {
    modal.classList.add("show");
}

function hideModal(modal) {
    modal.classList.remove("show");
}

function startOfToday() {
    const date = new Date();

    date.setHours(0, 0, 0, 0);

    return date;
}

function startOfWeek() {
    const date = startOfToday();
    const day = date.getDay();
    const diff = day === 0 ? 6 : day - 1;

    date.setDate(date.getDate() - diff);

    return date;
}

function startOfYear() {
    const date = new Date();

    date.setMonth(0, 1);
    date.setHours(0, 0, 0, 0);

    return date;
}

function dateInRange(value, range) {
    if (range === "all") {
        return true;
    }

    if (!value) {
        return false;
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return false;
    }

    if (range === "day") {
        return date >= startOfToday();
    }

    if (range === "week") {
        return date >= startOfWeek();
    }

    if (range === "year") {
        return date >= startOfYear();
    }

    return true;
}

function matchesKeyword(values, keyword) {
    if (!keyword) {
        return true;
    }

    return values.some(value => {
        return String(value || "").toLowerCase().includes(keyword);
    });
}

function matchesEmailSearch(email, keyword) {
    return matchesKeyword([
        email.email,
        email.recipientName,
        email.subject,
        email.category,
        email.group,
        email.recipientType,
        statusLabel(email.status)
    ], keyword);
}

function matchesCampaignSearch(item, keyword) {
    const campaign = item.campaign || {};
    const summary = item.summary || {};

    return matchesKeyword([
        summary.subject,
        summary.category,
        summary.group,
        summary.recipientType,
        recipientText(item),
        campaign.recipientEmail,
        campaign.recipientName,
        campaign.markdown,
        statusLabel(item.status)
    ], keyword);
}

function applyHistoryFilters() {
    const keyword = historySearch.value.trim().toLowerCase();
    const emails = allHistoryEmails.filter(email => {
        return dateInRange(email.sentAt || email.createdAt, activeHistoryRange) &&
            matchesEmailSearch(email, keyword);
    });
    const drafts = allDrafts.filter(draft => {
        return dateInRange(draft.updatedAt || draft.createdAt, activeHistoryRange) &&
            matchesCampaignSearch(draft, keyword);
    });
    const scheduled = allScheduled.filter(item => {
        return dateInRange(item.scheduledAt || item.updatedAt || item.createdAt, activeHistoryRange) &&
            matchesCampaignSearch(item, keyword);
    });

    historyCount.textContent = emails.length;
    draftCount.textContent = drafts.length;
    scheduledCount.textContent = scheduled.filter(item => item.status === "scheduled").length;

    renderHistory(emails);
    renderDrafts(drafts);
    renderScheduled(scheduled);
}

function recipientText(item) {
    const summary = item.summary || {};
    const recipients = summary.recipients || [];
    const count = summary.recipientCount || recipients.length;

    if (!count) {
        return "-";
    }

    if (count === 1) {
        return recipients[0] || "1 recipient";
    }

    return `${count} recipients`;
}

function groupText(item) {
    const summary = item.summary || {};

    return [summary.category, summary.group].filter(Boolean).join(" / ") ||
        summary.recipientType ||
        "-";
}

function actionButton(label, className, handler) {
    const button = document.createElement("button");

    button.type = "button";
    button.className = `table-action ${className || ""}`.trim();
    button.textContent = label;
    button.addEventListener("click", handler);

    return button;
}

function actionGroup(buttons) {
    const group = document.createElement("div");

    group.className = "table-actions";
    buttons.forEach(button => group.appendChild(button));

    return group;
}

function openCampaign(item, kind) {
    const campaign = {
        ...(item.campaign || {})
    };

    if (kind === "draft") {
        campaign.draftId = item.id;
    }

    if (kind === "scheduled") {
        campaign.scheduledId = item.id;
        campaign.scheduledAt = item.scheduledAt;
    }

    sessionStorage.setItem("composeCampaign", JSON.stringify(campaign));
    window.location.href = "email.html";
}

async function deleteRecord(url) {
    const response = await fetch(url, {
        method: "DELETE"
    });

    if (!response.ok) {
        throw new Error(await response.text());
    }
}

async function sendScheduledNow(id) {
    const response = await fetch(`/api/scheduled/${encodeURIComponent(id)}/send-now`, {
        method: "POST"
    });

    if (!response.ok) {
        throw new Error(await response.text());
    }
}

function unreadableEmailMessage(email) {
    return `
        <div style="font-family:Arial,Helvetica,sans-serif;padding:28px;color:#172033;background:#ffffff;">
            <h2 style="margin:0 0 12px;color:#0b2d66;">Content not available</h2>
            <p style="margin:0 0 10px;line-height:1.6;">
                This email was sent before readable history was enabled.
            </p>
            <p style="margin:0;line-height:1.6;color:#344054;">
                Subject: ${escapeHtml(email.subject || "-")}
            </p>
        </div>
    `;
}

async function openSentEmail(email) {
    historyEmailTitle.textContent = email.subject || "(No subject)";
    historyEmailMeta.textContent = [email.category, email.group]
        .filter(Boolean)
        .join(" / ") || email.recipientType || "Email history";
    readerRecipient.textContent = email.email || "-";
    readerStatus.textContent = statusLabel(email.status);
    readerSentAt.textContent = formatDate(email.sentAt || email.createdAt);
    historyEmailFrame.srcdoc = `
        <div style="font-family:Arial,Helvetica,sans-serif;padding:28px;color:#344054;">
            Loading email...
        </div>
    `;

    showModal(historyEmailModal);

    if (email.html) {
        historyEmailFrame.srcdoc = email.html;
        return;
    }

    if (!email.markdown) {
        historyEmailFrame.srcdoc = unreadableEmailMessage(email);
        return;
    }

    try {
        const response = await fetch("/preview", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                subject: email.subject,
                recipientName: email.recipientName || email.email,
                markdown: email.markdown,
                buttonText: email.buttonText || "",
                buttonLink: email.buttonLink || ""
            })
        });

        if (!response.ok) {
            throw new Error(await response.text());
        }

        historyEmailFrame.srcdoc = await response.text();
    } catch (err) {
        historyEmailFrame.srcdoc = `
            <pre style="white-space:pre-wrap;color:#b00020;font-family:Arial,sans-serif;padding:24px;">${escapeHtml(err.message)}</pre>
        `;
    }
}

function renderHistory(emails) {
    if (!emails.length) {
        setEmptyRow(historyRows, 7, "No sent email history yet.");
        return;
    }

    historyRows.innerHTML = "";

    emails.forEach(email => {
        const row = document.createElement("tr");
        const group = [email.category, email.group].filter(Boolean).join(" / ");

        setCell(row, email.email);
        setCell(row, email.subject);
        setCell(row, group || email.recipientType);
        setCell(row, renderStatus(email.status));
        setCell(row, formatDate(email.sentAt || email.createdAt));
        setCell(row, formatDate(email.openedAt));
        setCell(row, actionButton("View", "primary", () => openSentEmail(email)));

        historyRows.appendChild(row);
    });
}

function renderDrafts(drafts) {
    if (!drafts.length) {
        setEmptyRow(draftRows, 4, "No drafts saved.");
        return;
    }

    draftRows.innerHTML = "";

    drafts.forEach(draft => {
        const row = document.createElement("tr");

        setCell(row, draft.summary && draft.summary.subject);
        setCell(row, recipientText(draft));
        setCell(row, formatDate(draft.updatedAt));
        setCell(row, actionGroup([
            actionButton("Continue", "primary", () => openCampaign(draft, "draft")),
            actionButton("Delete", "danger", async () => {
                if (!confirm("Delete this draft?")) {
                    return;
                }

                try {
                    await deleteRecord(`/api/drafts/${encodeURIComponent(draft.id)}`);
                    loadHistory("drafts");
                } catch (err) {
                    alert(err.message || "Failed to delete draft.");
                }
            })
        ]));

        draftRows.appendChild(row);
    });
}

function renderScheduled(items) {
    if (!items.length) {
        setEmptyRow(scheduledRows, 5, "No scheduled emails.");
        return;
    }

    scheduledRows.innerHTML = "";

    items.forEach(item => {
        const row = document.createElement("tr");
        const buttons = [];

        if (item.status !== "sent" && item.status !== "sending") {
            buttons.push(actionButton("Edit", "primary", () => openCampaign(item, "scheduled")));
            buttons.push(actionButton("Send Now", "", async () => {
                if (!confirm("Send this scheduled email now?")) {
                    return;
                }

                try {
                    await sendScheduledNow(item.id);
                    loadHistory("scheduled");
                } catch (err) {
                    alert(err.message || "Failed to send scheduled email.");
                }
            }));
        }

        if (item.status !== "sending") {
            buttons.push(actionButton(item.status === "scheduled" ? "Cancel" : "Remove", "danger", async () => {
                const message = item.status === "scheduled"
                    ? "Cancel this scheduled email?"
                    : "Remove this record from scheduled list?";

                if (!confirm(message)) {
                    return;
                }

                try {
                    await deleteRecord(`/api/scheduled/${encodeURIComponent(item.id)}`);
                    loadHistory("scheduled");
                } catch (err) {
                    alert(err.message || "Failed to update scheduled email.");
                }
            }));
        }

        setCell(row, item.summary && item.summary.subject);
        setCell(row, recipientText(item));
        setCell(row, formatDate(item.scheduledAt));
        setCell(row, renderStatus(item.status));
        setCell(row, buttons.length ? actionGroup(buttons) : "Processing...");

        scheduledRows.appendChild(row);
    });
}

function setActiveTab(tab) {
    const target = panels[tab] ? tab : "history";

    tabButtons.forEach(button => {
        button.classList.toggle("active", button.dataset.tab === target);
    });

    Object.keys(panels).forEach(key => {
        panels[key].classList.toggle("active", key === target);
    });

    sessionStorage.setItem("historyTab", target);
}

async function fetchJson(url) {
    const response = await fetch(`${url}?t=${Date.now()}`, {
        cache: "no-store"
    });

    if (!response.ok) {
        throw new Error(await response.text());
    }

    return response.json();
}

async function loadHistory(activeTab) {
    refreshHistory.disabled = true;
    refreshHistory.textContent = "Refreshing...";

    try {
        const [analytics, campaigns] = await Promise.all([
            fetchJson("/api/analytics"),
            fetchJson("/api/campaigns")
        ]);

        allHistoryEmails = analytics.emails || [];
        allDrafts = campaigns.drafts || [];
        allScheduled = campaigns.scheduled || [];

        applyHistoryFilters();
        setActiveTab(activeTab || sessionStorage.getItem("historyTab") || "history");
    } catch (err) {
        setEmptyRow(historyRows, 7, err.message || "Failed to load history.");
        setEmptyRow(draftRows, 4, err.message || "Failed to load drafts.");
        setEmptyRow(scheduledRows, 5, err.message || "Failed to load scheduled emails.");
    } finally {
        refreshHistory.disabled = false;
        refreshHistory.textContent = "Refresh";
    }
}

tabButtons.forEach(button => {
    button.addEventListener("click", () => setActiveTab(button.dataset.tab));
});

historyRangeButtons.forEach(button => {
    button.addEventListener("click", () => {
        activeHistoryRange = button.dataset.historyRange;

        historyRangeButtons.forEach(item => {
            item.classList.toggle("active", item === button);
        });

        applyHistoryFilters();
    });
});

historySearch.addEventListener("input", applyHistoryFilters);
refreshHistory.addEventListener("click", () => loadHistory());

closeHistoryEmail.addEventListener("click", () => {
    hideModal(historyEmailModal);
});

historyEmailModal.addEventListener("click", event => {
    if (event.target === historyEmailModal) {
        hideModal(historyEmailModal);
    }
});

document.addEventListener("keydown", event => {
    if (event.key === "Escape") {
        hideModal(historyEmailModal);
    }
});

loadHistory();

setInterval(() => {
    if (!historyEmailModal.classList.contains("show")) {
        loadHistory();
    }
}, 15000);
