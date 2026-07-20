const totalSent = document.getElementById("totalSent");
const totalBounced = document.getElementById("totalBounced");
const totalRead = document.getElementById("totalRead");
const totalUnread = document.getElementById("totalUnread");
const analyticsRows = document.getElementById("analyticsRows");
const refreshAnalytics = document.getElementById("refreshAnalytics");
const analyticsSearch = document.getElementById("analyticsSearch");
const analyticsRangeButtons = document.querySelectorAll("[data-analytics-range]");

let allAnalyticsEmails = [];
let activeAnalyticsRange = "all";

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

function matchesSearch(email, keyword) {
    if (!keyword) {
        return true;
    }

    return [
        email.email,
        email.recipientName,
        email.subject,
        email.category,
        email.group,
        email.recipientType,
        statusLabel(email.status)
    ].some(value => String(value || "").toLowerCase().includes(keyword));
}

function filteredEmails() {
    const keyword = analyticsSearch.value.trim().toLowerCase();

    return allAnalyticsEmails.filter(email => {
        const date = email.sentAt || email.createdAt;

        return dateInRange(date, activeAnalyticsRange) &&
            matchesSearch(email, keyword);
    });
}

function updateTotals(emails) {
    const successful = emails.filter(email => {
        return email.status !== "failed" && email.status !== "sending";
    });
    const bounced = emails.filter(email => email.status === "bounced");
    const read = successful.filter(email => Boolean(email.openedAt));
    const unread = successful.filter(email => !email.openedAt && email.status !== "bounced");

    totalSent.textContent = successful.length;
    totalBounced.textContent = bounced.length;
    totalRead.textContent = read.length;
    totalUnread.textContent = unread.length;
}

function renderRows(emails) {
    analyticsRows.innerHTML = "";

    if (!emails.length) {
        const row = document.createElement("tr");
        const cell = document.createElement("td");

        cell.colSpan = 6;
        cell.textContent = "No email activity for this filter.";
        row.appendChild(cell);
        analyticsRows.appendChild(row);
        return;
    }

    emails.forEach(email => {
        const row = document.createElement("tr");
        const group = [email.category, email.group].filter(Boolean).join(" / ");

        setCell(row, email.email);
        setCell(row, email.subject);
        setCell(row, group || email.recipientType);
        setCell(row, renderStatus(email.status));
        setCell(row, formatDate(email.sentAt || email.createdAt));
        setCell(row, formatDate(email.openedAt));

        analyticsRows.appendChild(row);
    });
}

function applyFilters() {
    const emails = filteredEmails();

    updateTotals(emails);
    renderRows(emails);
}

async function loadAnalytics() {
    refreshAnalytics.disabled = true;
    refreshAnalytics.textContent = "Refreshing...";

    try {
        const response = await fetch(`/api/analytics?t=${Date.now()}`, {
            cache: "no-store"
        });

        if (!response.ok) {
            throw new Error(await response.text());
        }

        const data = await response.json();

        allAnalyticsEmails = data.emails || [];
        applyFilters();
    } catch (err) {
        analyticsRows.innerHTML = "";

        const row = document.createElement("tr");
        const cell = document.createElement("td");

        cell.colSpan = 6;
        cell.textContent = err.message || "Failed to load analytics.";
        row.appendChild(cell);
        analyticsRows.appendChild(row);
    } finally {
        refreshAnalytics.disabled = false;
        refreshAnalytics.textContent = "Refresh";
    }
}

analyticsRangeButtons.forEach(button => {
    button.addEventListener("click", () => {
        activeAnalyticsRange = button.dataset.analyticsRange;

        analyticsRangeButtons.forEach(item => {
            item.classList.toggle("active", item === button);
        });

        applyFilters();
    });
});

analyticsSearch.addEventListener("input", applyFilters);
refreshAnalytics.addEventListener("click", loadAnalytics);
loadAnalytics();

setInterval(loadAnalytics, 15000);
