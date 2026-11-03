// The per-site permission ask only ever names a real web origin.
import { test } from "vitest";
import assert from "node:assert/strict";
import { siteHost, sitePattern } from "../../extension/src/site";

test("web pages map to an origin pattern", () => {
  assert.equal(sitePattern("https://www.khanacademy.org/test-prep/sat?x=1#y"), "https://www.khanacademy.org/*");
  assert.equal(sitePattern("http://localhost:3100/review/abc"), "http://localhost:3100/*");
  assert.equal(sitePattern("https://satsuitequestionbank.collegeboard.org/digital/results"), "https://satsuitequestionbank.collegeboard.org/*");
});

test("pages Chrome never grants give null", () => {
  for (const url of ["chrome://extensions", "chrome-extension://abc/sidepanel.html", "file:///tmp/x.pdf", "about:blank", "https://chromewebstore.google.com/detail/x", "https://chrome.google.com/webstore/x", "", undefined, null, "not a url"]) {
    assert.equal(sitePattern(url), null, String(url));
  }
});

test("siteHost strips the scheme and wildcard", () => {
  assert.equal(siteHost("https://www.khanacademy.org/*"), "www.khanacademy.org");
  assert.equal(siteHost("http://localhost:3100/*"), "localhost:3100");
});
