const themes = {
    light: "dark",
    dark: "light"
}

function switchTheme(target) {
    setTheme(target, themes[getTheme(target)])
}

function setTheme(target, theme) {
    target.setAttribute("data-theme", theme);
}

function getTheme(target) {
    return target.getAttribute("data-theme");
}

window.onload = () => {
    const btn = document.getElementById("theme");
    const target = document.querySelector(btn.getAttribute("data-target"));
    btn.onclick = () => {
        if (target) {
            switchTheme(target);
        }
    }
}
