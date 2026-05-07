export const UX_LAB_FLAG_KEY = "wtf:ux-lab-enabled";

function hasWindow() {
  return typeof window !== "undefined";
}

export function isUxLabEnabled(): boolean {
  if (!hasWindow()) return false;
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get("uxlab") === "1") {
      window.localStorage.setItem(UX_LAB_FLAG_KEY, "1");
      return true;
    }
    return window.localStorage.getItem(UX_LAB_FLAG_KEY) === "1";
  } catch {
    return false;
  }
}

export function enableUxLab() {
  if (!hasWindow()) return;
  try {
    window.localStorage.setItem(UX_LAB_FLAG_KEY, "1");
  } catch {
    // ignore
  }
}

export function disableUxLab() {
  if (!hasWindow()) return;
  try {
    window.localStorage.removeItem(UX_LAB_FLAG_KEY);
  } catch {
    // ignore
  }
}
