export type Theme = "auto" | "light" | "dark";
const KEY = "easyrouter.theme";

export function getTheme(): Theme {
  try {
    const t = localStorage.getItem(KEY);
    if (t === "light" || t === "dark" || t === "auto") return t;
  } catch { /* sin storage */ }
  return "auto";
}

export function applyTheme(theme: Theme): void {
  const el = document.documentElement;
  if (theme === "auto") el.removeAttribute("data-theme");
  else el.setAttribute("data-theme", theme);
  try { localStorage.setItem(KEY, theme); } catch { /* sin storage */ }
}
