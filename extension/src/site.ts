/** Which site a tab is on, as the match pattern chrome.permissions.request wants: "https://host/*". */
export function sitePattern(url: string | null | undefined): string | null {
  if (!url) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  // Only web pages can be granted; chrome://, file://, the Web Store and extension pages never can.
  if ((parsed.protocol !== "https:" && parsed.protocol !== "http:") || !parsed.host) return null;
  if (/(^|\.)chromewebstore\.google\.com$|(^|\.)chrome\.google\.com$/i.test(parsed.hostname)) return null;
  return `${parsed.protocol}//${parsed.host}/*`;
}

/** The host a pattern from sitePattern() covers, for a button label. */
export function siteHost(pattern: string): string {
  return pattern.replace(/^https?:\/\//, "").replace(/\/\*$/, "");
}
