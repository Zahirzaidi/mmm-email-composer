const campaign = JSON.parse(sessionStorage.getItem("campaign") || "null");
const previewRecipients = document.getElementById("previewRecipients");
const previewSubject = document.getElementById("previewSubject");
const previewFrame = document.getElementById("previewFrame");
const backBtn = document.getElementById("backBtn");
const sendBtn = document.getElementById("sendBtn");

function setTextList(container, lines) {
    container.innerHTML = "";

    lines.forEach((line, index) => {
        const element = document.createElement(index === 0 ? "strong" : "div");
        element.textContent = line;
        container.appendChild(element);
    });
}

function appendMemberList(container, members) {
    members.forEach(member => {
        const row = document.createElement("div");
        const details = [member.name, member.email, member.position]
            .filter(Boolean)
            .join(" | ");

        row.textContent = details;
        container.appendChild(row);
    });
}

function escapeHtml(value) {
    return String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function getRecipients() {
    if (campaign.recipientType === "individual") {
        return [campaign.recipientEmail];
    }

    return (campaign.members || [])
        .map(member => member.email)
        .filter(Boolean);
}

function renderSummary() {
    if (campaign.recipientType === "individual") {
        setTextList(previewRecipients, [
            "Individual",
            campaign.recipientEmail
        ]);
    } else {
        setTextList(previewRecipients, [
            campaign.group || campaign.category
        ]);

        appendMemberList(previewRecipients, campaign.members || []);
    }

    previewSubject.textContent = campaign.subject;
}

async function loadPreview() {
    const response = await fetch("/preview", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            subject: campaign.subject,
            recipientName: campaign.recipientName,
            markdown: campaign.markdown,
            buttonText: campaign.buttonText,
            buttonLink: campaign.buttonLink
        })
    });

    if (!response.ok) {
        throw new Error(await response.text());
    }

    previewFrame.srcdoc = await response.text();
}

async function sendEmail() {
    sendBtn.disabled = true;
    sendBtn.textContent = "Sending...";

    try {
        const response = await fetch("/send", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                email: getRecipients(),
                subject: campaign.subject,
                recipientName: campaign.recipientName,
                recipientType: campaign.recipientType,
                category: campaign.category,
                group: campaign.group,
                markdown: campaign.markdown,
                buttonText: campaign.buttonText,
                buttonLink: campaign.buttonLink,
                draftId: campaign.draftId || null
            })
        });

        if (!response.ok) {
            throw new Error(await response.text());
        }

        sessionStorage.removeItem("campaign");
        window.location.href = "success.html";
    } catch (err) {
        alert(err.message || "Failed to send email.");
        sendBtn.disabled = false;
        sendBtn.textContent = "Send Email";
    }
}

if (!campaign) {
    alert("No campaign found.");
    window.location.href = "email.html";
} else {
    renderSummary();

    loadPreview().catch(err => {
        previewFrame.srcdoc = `<pre style="white-space:pre-wrap;color:#b00020;font-family:Arial,sans-serif;">${escapeHtml(err.message)}</pre>`;
    });

    backBtn.addEventListener("click", () => {
        history.back();
    });

    sendBtn.addEventListener("click", sendEmail);
}
