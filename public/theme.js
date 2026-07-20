const themeToggleButtons = document.querySelectorAll("[data-theme-toggle]");
const systemDark = window.matchMedia("(prefers-color-scheme: dark)");

function currentTheme() {
    return document.documentElement.dataset.theme ||
        (systemDark.matches ? "dark" : "light");
}

function setTheme(theme, persist = true) {
    document.documentElement.dataset.theme = theme;

    if (persist) {
        localStorage.setItem("mmmTheme", theme);
    }

    themeToggleButtons.forEach(button => {
        const dark = theme === "dark";

        button.textContent = dark ? "Light" : "Dark";
        button.setAttribute("aria-pressed", String(dark));
        button.setAttribute("aria-label", dark ? "Switch to light mode" : "Switch to dark mode");
    });
}

themeToggleButtons.forEach(button => {
    button.addEventListener("click", () => {
        setTheme(currentTheme() === "dark" ? "light" : "dark");
    });
});

systemDark.addEventListener("change", event => {
    if (!localStorage.getItem("mmmTheme")) {
        setTheme(event.matches ? "dark" : "light", false);
    }
});

setTheme(currentTheme(), Boolean(localStorage.getItem("mmmTheme")));
