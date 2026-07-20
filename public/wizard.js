/* ==========================================
MMM Email Wizard
========================================== */

const db = window.mmmSupabaseClient;

const campaign = {
    recipientType: "individual",
    categoryId: null,
    category: "",
    groupId: null,
    group: "",
    members: [],
    recipientEmail: "",
    subject: "",
    recipientName: "",
    markdown: "",
    buttonText: "",
    buttonLink: "",
    draftId: null,
    scheduledId: null
};

let categories = [];
let groups = [];
let members = [];
let selectedMembers = [];

const MMM_MEMBERS_CATEGORY_ID = "__mmm_members__";
const MMM_MEMBERS_GROUP_ID = "__mmm_members_group__";

const individualRadio = document.querySelector('input[value="individual"]');
const categoryRadio = document.querySelector('input[value="category"]');
const individualBox = document.getElementById("individualBox");
const categoryBox = document.getElementById("categoryBox");
const recipientView = document.getElementById("recipientView");
const composerView = document.getElementById("composerView");
const recipientEmail = document.getElementById("recipientEmail");
const individualRecipientName = document.getElementById("individualRecipientName");
const categoryGrid = document.getElementById("categoryGrid");
const groupSection = document.getElementById("groupSection");
const groupGrid = document.getElementById("groupGrid");
const memberSection = document.getElementById("memberSection");
const memberTable = document.getElementById("memberTable");
const searchMember = document.getElementById("searchMember");
const selectAll = document.getElementById("selectAll");
const selectedCount = document.getElementById("selectedCount");
const nextBtn = document.getElementById("nextBtn");
const changeRecipient = document.getElementById("changeRecipient");
const recipientSummary = document.getElementById("recipientSummary");
const recipientNameBox = document.getElementById("recipientNameBox");
const subjectInput = document.getElementById("subject");
const recipientNameInput = document.getElementById("recipientName");
const markdownInput = document.getElementById("markdown");
const buttonTextInput = document.getElementById("buttonText");
const buttonLinkInput = document.getElementById("buttonLink");
const saveDraftBtn = document.getElementById("saveDraftBtn");
const scheduleAtInput = document.getElementById("scheduleAt");
const scheduleBtn = document.getElementById("scheduleBtn");
const previewBtn = document.getElementById("previewBtn");
const linkModal = document.getElementById("linkModal");
const imageModal = document.getElementById("imageModal");

function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || "").trim());
}

function memberKey(member) {
    return String(member.id || member.email || member.name);
}

function formatSelectedCount(count) {
    return `${count} ${count === 1 ? "Member" : "Members"}`;
}

function setGridMessage(container, message) {
    container.innerHTML = "";

    const div = document.createElement("div");
    div.className = "empty-state";
    div.textContent = message;
    container.appendChild(div);
}

function setMessageRow(message) {
    memberTable.innerHTML = "";

    const row = document.createElement("tr");
    const cell = document.createElement("td");

    cell.colSpan = 4;
    cell.textContent = message;
    row.appendChild(cell);
    memberTable.appendChild(row);
}

function syncSelectedCount() {
    selectedCount.textContent = formatSelectedCount(selectedMembers.length);
}

function getVisibleMembers() {
    const keyword = searchMember.value.trim().toLowerCase();

    return members.filter(member => {
        const name = String(member.name || "").toLowerCase();
        const email = String(member.email || "").toLowerCase();
        const position = String(member.position || "").toLowerCase();

        return !keyword ||
            name.includes(keyword) ||
            email.includes(keyword) ||
            position.includes(keyword);
    });
}

function syncSelectAll() {
    const visibleMembers = getVisibleMembers();
    const selectedKeys = new Set(selectedMembers.map(memberKey));
    const checkedCount = visibleMembers.filter(member => {
        return selectedKeys.has(memberKey(member));
    }).length;

    selectAll.checked = visibleMembers.length > 0 && checkedCount === visibleMembers.length;
    selectAll.indeterminate = checkedCount > 0 && checkedCount < visibleMembers.length;
}

function renderMemberTable() {
    const visibleMembers = getVisibleMembers();
    const selectedKeys = new Set(selectedMembers.map(memberKey));

    if (!campaign.groupId) {
        setMessageRow("Please select a group.");
        syncSelectedCount();
        syncSelectAll();
        return;
    }

    if (!visibleMembers.length) {
        setMessageRow("No members found.");
        syncSelectedCount();
        syncSelectAll();
        return;
    }

    memberTable.innerHTML = "";

    visibleMembers.forEach(member => {
        const row = document.createElement("tr");
        const checkCell = document.createElement("td");
        const nameCell = document.createElement("td");
        const emailCell = document.createElement("td");
        const positionCell = document.createElement("td");
        const checkbox = document.createElement("input");

        checkbox.type = "checkbox";
        checkbox.checked = selectedKeys.has(memberKey(member));

        checkbox.addEventListener("change", () => {
            const key = memberKey(member);

            if (checkbox.checked) {
                selectedMembers = [
                    ...selectedMembers.filter(item => memberKey(item) !== key),
                    member
                ];
            } else {
                selectedMembers = selectedMembers.filter(item => memberKey(item) !== key);
            }

            syncSelectedCount();
            syncSelectAll();
        });

        checkCell.appendChild(checkbox);
        nameCell.textContent = member.name || "-";
        emailCell.textContent = member.email || "-";
        positionCell.textContent = member.position || "-";

        row.appendChild(checkCell);
        row.appendChild(nameCell);
        row.appendChild(emailCell);
        row.appendChild(positionCell);

        memberTable.appendChild(row);
    });

    syncSelectedCount();
    syncSelectAll();
}

function resetMembers() {
    members = [];
    selectedMembers = [];
    campaign.members = [];
    searchMember.value = "";
    selectAll.checked = false;
    selectAll.indeterminate = false;
    syncSelectedCount();
}

function resetGroups() {
    groups = [];
    campaign.groupId = null;
    campaign.group = "";
    groupGrid.innerHTML = "";
    groupSection.style.display = "none";
    memberSection.style.display = "none";
    resetMembers();
}

function resetCategorySelection() {
    campaign.categoryId = null;
    campaign.category = "";
    resetGroups();

    document.querySelectorAll(".category-card").forEach(card => {
        card.classList.remove("active");
    });
}

function renderCategories() {
    if (!categories.some(category => String(category.name || "").toLowerCase() === "mmm members")) {
        categories = [
            ...categories,
            {
                id: MMM_MEMBERS_CATEGORY_ID,
                name: "MMM Members",
                virtual: true
            }
        ];
    }

    if (!categories.length) {
        setGridMessage(categoryGrid, "No categories found.");
        return;
    }

    categoryGrid.innerHTML = "";

    categories.forEach(category => {
        const card = document.createElement("div");
        const title = document.createElement("h4");

        card.className = "category-card";
        card.dataset.id = category.id;
        title.textContent = category.name;
        card.appendChild(title);

        card.addEventListener("click", () => {
            document.querySelectorAll(".category-card").forEach(item => {
                item.classList.remove("active");
            });

            card.classList.add("active");
            campaign.categoryId = category.id;
            campaign.category = category.name;
            loadGroups(category.id);
        });

        categoryGrid.appendChild(card);
    });
}

async function loadCategories() {
    if (!db) {
        setGridMessage(categoryGrid, "Supabase is not connected.");
        return;
    }

    setGridMessage(categoryGrid, "Loading categories...");

    const { data, error } = await db
        .from("categories")
        .select("id,name")
        .order("id", { ascending: true });

    if (error) {
        console.error(error);
        setGridMessage(categoryGrid, error.message);
        return;
    }

    categories = data || [];
    renderCategories();
}

function renderGroups() {
    if (!groups.length) {
        setGridMessage(groupGrid, "No groups found.");
        return;
    }

    groupGrid.innerHTML = "";

    groups.forEach(group => {
        const card = document.createElement("div");
        const title = document.createElement("h4");

        card.className = "group-card";
        card.dataset.id = group.id;
        title.textContent = group.name;
        card.appendChild(title);

        card.addEventListener("click", () => {
            document.querySelectorAll(".group-card").forEach(item => {
                item.classList.remove("active");
            });

            card.classList.add("active");
            campaign.groupId = group.id;
            campaign.group = group.name;
            loadMembers(group.id);
        });

        groupGrid.appendChild(card);
    });
}

async function loadGroups(categoryId) {
    resetGroups();
    groupSection.style.display = "block";

    if (categoryId === MMM_MEMBERS_CATEGORY_ID) {
        groups = [
            {
                id: MMM_MEMBERS_GROUP_ID,
                category_id: MMM_MEMBERS_CATEGORY_ID,
                name: "MMM Members",
                virtual: true
            }
        ];

        renderGroups();
        return;
    }

    setGridMessage(groupGrid, "Loading groups...");

    const { data, error } = await db
        .from("groups")
        .select("id,category_id,name")
        .eq("category_id", categoryId)
        .order("id", { ascending: true });

    if (error) {
        console.error(error);
        setGridMessage(groupGrid, error.message);
        return;
    }

    groups = data || [];
    renderGroups();
}

async function loadMembers(groupId) {
    resetMembers();
    memberSection.style.display = "block";
    setMessageRow("Loading members...");

    if (groupId === MMM_MEMBERS_GROUP_ID) {
        members = [];
        setMessageRow("MMM Members category is separate. Add it in Supabase first, then add members under the MMM Members group.");
        syncSelectedCount();
        syncSelectAll();
        return;
    }

    const { data, error } = await db
        .from("members")
        .select("id,group_id,name,email,position,phone")
        .eq("group_id", groupId)
        .order("name", { ascending: true });

    if (error) {
        console.error(error);
        setMessageRow(error.message);
        return;
    }

    members = data || [];
    renderMemberTable();
}

function showRecipientType(type) {
    campaign.recipientType = type;

    individualBox.style.display = type === "individual" ? "block" : "none";
    categoryBox.style.display = type === "category" ? "block" : "none";

    if (type === "individual") {
        resetCategorySelection();
    } else if (!categories.length) {
        loadCategories();
    }
}

function appendSummaryLine(text, strong = false) {
    const element = document.createElement(strong ? "strong" : "div");
    element.textContent = text;
    recipientSummary.appendChild(element);
}

function renderRecipientSummary() {
    recipientSummary.innerHTML = "";

    if (campaign.recipientType === "individual") {
        appendSummaryLine("Individual", true);
        appendSummaryLine(campaign.recipientName);
        appendSummaryLine(campaign.recipientEmail);
        return;
    }

    appendSummaryLine(campaign.group, true);

    campaign.members.forEach(member => {
        const details = [member.name, member.email, member.position]
            .filter(Boolean)
            .join(" | ");

        appendSummaryLine(details);
    });
}

function goToComposer() {
    if (campaign.recipientType === "individual") {
        const email = recipientEmail.value.trim();
        const name = individualRecipientName.value.trim();

        if (!isValidEmail(email)) {
            alert("Please enter a valid recipient email.");
            recipientEmail.focus();
            return;
        }

        if (!name) {
            alert("Please enter the recipient name.");
            individualRecipientName.focus();
            return;
        }

        campaign.recipientEmail = email;
        campaign.recipientName = name;
        campaign.members = [];
        recipientNameInput.value = name;
        recipientNameBox.style.display = "block";
    } else {
        campaign.members = selectedMembers;

        if (!campaign.categoryId) {
            alert("Please select a category.");
            return;
        }

        if (!campaign.groupId) {
            alert("Please select a group.");
            return;
        }

        if (!campaign.members.length) {
            alert("Please select at least one member.");
            return;
        }

        if (campaign.members.some(member => !member.email)) {
            alert("One or more selected members do not have an email address.");
            return;
        }

        campaign.recipientName = campaign.members.length === 1
            ? campaign.members[0].name
            : "Members";

        recipientNameInput.value = campaign.recipientName;
        recipientNameBox.style.display = "none";
    }

    renderRecipientSummary();
    recipientView.style.display = "none";
    composerView.style.display = "block";
}

function collectComposerData() {
    campaign.subject = subjectInput.value.trim();
    campaign.markdown = markdownInput.value.trim();
    campaign.buttonText = buttonTextInput.value.trim();
    campaign.buttonLink = buttonLinkInput.value.trim();

    if (campaign.recipientType === "individual") {
        campaign.recipientEmail = recipientEmail.value.trim();
        campaign.recipientName = recipientNameInput.value.trim();
        individualRecipientName.value = campaign.recipientName;
    } else {
        campaign.members = selectedMembers;
        campaign.recipientName = campaign.members.length === 1
            ? campaign.members[0].name
            : "Members";
    }
}

function validateComposerData() {
    if (!campaign.subject) {
        alert("Please enter an email subject.");
        subjectInput.focus();
        return false;
    }

    if (campaign.recipientType === "individual" && !campaign.recipientName) {
        alert("Please enter the recipient name.");
        recipientNameInput.focus();
        return false;
    }

    if (!campaign.markdown) {
        alert("Please write the email content.");
        markdownInput.focus();
        return false;
    }

    if ((campaign.buttonText && !campaign.buttonLink) || (!campaign.buttonText && campaign.buttonLink)) {
        alert("Please fill both button text and button link, or leave both empty.");
        return false;
    }

    return true;
}

async function postJson(url, payload) {
    const response = await fetch(url, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        throw new Error(await response.text());
    }

    return response.json();
}

function hasDraftContent() {
    return Boolean(
        campaign.subject ||
        campaign.markdown ||
        campaign.buttonText ||
        campaign.buttonLink
    );
}

function getScheduleIsoValue() {
    const value = scheduleAtInput.value;
    const scheduledAt = new Date(value);

    if (!value || Number.isNaN(scheduledAt.getTime())) {
        alert("Please choose a schedule date and time.");
        scheduleAtInput.focus();
        return null;
    }

    if (scheduledAt <= new Date()) {
        alert("Please choose a future date and time.");
        scheduleAtInput.focus();
        return null;
    }

    return scheduledAt.toISOString();
}

async function saveDraft() {
    collectComposerData();

    if (!hasDraftContent()) {
        alert("Please enter a subject or email content before saving a draft.");
        subjectInput.focus();
        return;
    }

    saveDraftBtn.disabled = true;
    saveDraftBtn.textContent = "Saving...";

    try {
        const data = await postJson("/api/drafts", {
            id: campaign.draftId,
            campaign
        });

        campaign.draftId = data.draft.id;
        alert("Draft saved.");
    } catch (err) {
        alert(err.message || "Failed to save draft.");
    } finally {
        saveDraftBtn.disabled = false;
        saveDraftBtn.textContent = "Save Draft";
    }
}

async function scheduleEmail() {
    collectComposerData();

    if (!validateComposerData()) {
        return;
    }

    const scheduledAt = getScheduleIsoValue();

    if (!scheduledAt) {
        return;
    }

    scheduleBtn.disabled = true;
    scheduleBtn.textContent = "Scheduling...";

    try {
        const data = await postJson("/api/scheduled", {
            id: campaign.scheduledId,
            campaign,
            scheduledAt
        });

        campaign.scheduledId = data.scheduled.id;

        if (campaign.draftId) {
            await fetch(`/api/drafts/${encodeURIComponent(campaign.draftId)}`, {
                method: "DELETE"
            });
        }

        sessionStorage.setItem("historyTab", "scheduled");
        window.location.href = "history.html";
    } catch (err) {
        alert(err.message || "Failed to schedule email.");
        scheduleBtn.disabled = false;
        scheduleBtn.textContent = "Schedule Email";
    }
}

function replaceSelection(prefix, suffix, placeholder) {
    const start = markdownInput.selectionStart;
    const end = markdownInput.selectionEnd;
    const selected = markdownInput.value.slice(start, end) || placeholder;
    const replacement = `${prefix}${selected}${suffix}`;

    markdownInput.setRangeText(replacement, start, end, "select");
    markdownInput.focus();
}

function insertMarkdown(markdown) {
    const start = markdownInput.selectionStart;
    const end = markdownInput.selectionEnd;

    markdownInput.setRangeText(markdown, start, end, "end");
    markdownInput.focus();
}

function prefixSelectedLines(prefix, placeholder) {
    const start = markdownInput.selectionStart;
    const end = markdownInput.selectionEnd;
    const selected = markdownInput.value.slice(start, end) || placeholder;
    const replacement = selected
        .split("\n")
        .map(line => `${prefix}${line}`)
        .join("\n");

    markdownInput.setRangeText(replacement, start, end, "select");
    markdownInput.focus();
}

function showModal(modal) {
    modal.classList.add("show");
}

function hideModal(modal) {
    modal.classList.remove("show");
}

function toDatetimeLocalValue(value) {
    if (!value) {
        return "";
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return "";
    }

    const offset = date.getTimezoneOffset() * 60000;

    return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function getSelectedText() {
    return markdownInput.value.slice(
        markdownInput.selectionStart,
        markdownInput.selectionEnd
    );
}

individualRadio.addEventListener("change", () => showRecipientType("individual"));
categoryRadio.addEventListener("change", () => showRecipientType("category"));
searchMember.addEventListener("input", renderMemberTable);

selectAll.addEventListener("change", () => {
    const visibleMembers = getVisibleMembers();
    const visibleKeys = new Set(visibleMembers.map(memberKey));

    if (selectAll.checked) {
        const selectedKeys = new Set(selectedMembers.map(memberKey));

        visibleMembers.forEach(member => {
            if (!selectedKeys.has(memberKey(member))) {
                selectedMembers.push(member);
            }
        });
    } else {
        selectedMembers = selectedMembers.filter(member => {
            return !visibleKeys.has(memberKey(member));
        });
    }

    renderMemberTable();
});

nextBtn.addEventListener("click", goToComposer);

changeRecipient.addEventListener("click", () => {
    composerView.style.display = "none";
    recipientView.style.display = "block";
});

saveDraftBtn.addEventListener("click", saveDraft);
scheduleBtn.addEventListener("click", scheduleEmail);

previewBtn.addEventListener("click", () => {
    collectComposerData();

    if (!validateComposerData()) {
        return;
    }

    sessionStorage.setItem("campaign", JSON.stringify(campaign));
    window.location.href = "preview.html";
});

document.getElementById("h1Btn").addEventListener("click", () => {
    prefixSelectedLines("# ", "Heading 1");
});

document.getElementById("h2Btn").addEventListener("click", () => {
    prefixSelectedLines("## ", "Heading 2");
});

document.getElementById("h3Btn").addEventListener("click", () => {
    prefixSelectedLines("### ", "Heading 3");
});

document.getElementById("boldBtn").addEventListener("click", () => {
    replaceSelection("**", "**", "bold text");
});

document.getElementById("italicBtn").addEventListener("click", () => {
    replaceSelection("_", "_", "italic text");
});

document.getElementById("listBtn").addEventListener("click", () => {
    prefixSelectedLines("- ", "List item");
});

document.getElementById("numberBtn").addEventListener("click", () => {
    prefixSelectedLines("1. ", "List item");
});

document.getElementById("quoteBtn").addEventListener("click", () => {
    prefixSelectedLines("> ", "Quote");
});

document.getElementById("codeBtn").addEventListener("click", () => {
    insertMarkdown("```\ncode block\n```");
});

document.getElementById("tableBtn").addEventListener("click", () => {
    insertMarkdown("| Column 1 | Column 2 |\n| --- | --- |\n| Value 1 | Value 2 |");
});

document.getElementById("linkBtn").addEventListener("click", () => {
    document.getElementById("linkText").value = getSelectedText();
    document.getElementById("linkUrl").value = "";
    showModal(linkModal);
});

document.getElementById("imageBtn").addEventListener("click", () => {
    document.getElementById("imageAlt").value = getSelectedText();
    document.getElementById("imageUrl").value = "";
    showModal(imageModal);
});

document.getElementById("cancelLink").addEventListener("click", () => {
    hideModal(linkModal);
});

document.getElementById("cancelImage").addEventListener("click", () => {
    hideModal(imageModal);
});

document.getElementById("insertLink").addEventListener("click", () => {
    const text = document.getElementById("linkText").value.trim() || "Open link";
    const url = document.getElementById("linkUrl").value.trim();

    if (!url) {
        alert("Please enter a link URL.");
        return;
    }

    insertMarkdown(`[${text}](${url})`);
    hideModal(linkModal);
});

document.getElementById("insertImage").addEventListener("click", () => {
    const alt = document.getElementById("imageAlt").value.trim() || "Image";
    const url = document.getElementById("imageUrl").value.trim();

    if (!url) {
        alert("Please enter an image URL.");
        return;
    }

    insertMarkdown(`![${alt}](${url})`);
    hideModal(imageModal);
});

[linkModal, imageModal].forEach(modal => {
    modal.addEventListener("click", event => {
        if (event.target === modal) {
            hideModal(modal);
        }
    });
});

function hydrateCampaign(savedCampaign) {
    Object.assign(campaign, savedCampaign || {});

    campaign.members = Array.isArray(campaign.members) ? campaign.members : [];
    selectedMembers = campaign.members;

    if (campaign.recipientType === "category") {
        categoryRadio.checked = true;
        showRecipientType("category");
    } else {
        individualRadio.checked = true;
        showRecipientType("individual");
        recipientEmail.value = campaign.recipientEmail || "";
        individualRecipientName.value = campaign.recipientName || "";
    }

    recipientNameInput.value = campaign.recipientName || "";
    subjectInput.value = campaign.subject || "";
    markdownInput.value = campaign.markdown || "";
    buttonTextInput.value = campaign.buttonText || "";
    buttonLinkInput.value = campaign.buttonLink || "";
    scheduleAtInput.value = toDatetimeLocalValue(campaign.scheduledAt);
    recipientNameBox.style.display = campaign.recipientType === "individual" ? "block" : "none";

    renderRecipientSummary();
    recipientView.style.display = "none";
    composerView.style.display = "block";
}

function initComposer() {
    const savedCampaign = JSON.parse(sessionStorage.getItem("composeCampaign") || "null");

    if (savedCampaign) {
        sessionStorage.removeItem("composeCampaign");
        hydrateCampaign(savedCampaign);
        loadCategories();
        return;
    }

    showRecipientType("individual");
    loadCategories();
}

initComposer();
