# Publishing Rulecard 0.8.2: your checklist

Everything else is done: the web app is live at https://rulecard.vercel.app, the server uses only the free
Vercel AI Gateway, and every file below is in this `store/` folder.

## 1. The old Anthropic key: done (disconnected, not deleted)

Rulecard cannot use it: the value stored in Vercel was wiped, `AI_DISABLED_PROVIDERS=openai,anthropic`
blocks paid providers even if a value were set, and no copy exists in the repo. The key stays alive at
Anthropic for your other projects. If you ever want it fully revoked: https://console.anthropic.com →
Settings → API Keys → Delete.

## 2. Upload the extension: 0.8.2 is the one to upload (store id `lhkjgpalkmpbpholdakoejpkhghplidi`)

0.8.2 is the one-button version: Home is a single **Capture this tab** button (the first press asks Chrome's one-time Allow, then captures; no toolbar icon needed), with wrong answers in a calm blue. It screenshots the question on
screen (a Question Bank PDF or a practice-test question), and the card is the answer plus 2 or 3 rule bullets,
then an optional "Which did you pick?" that says why that choice is wrong. The PDF picker is gone, and today's
plan sits quietly at the bottom of Home. If 0.7.x is still "pending review", cancel that review when the dashboard asks, then
upload this package. The permissions changed (an optional all-sites grant and a keyboard shortcut), so paste the
new permission justifications from `LISTING.md` (Privacy practices tab) before you submit, and replace the five
screenshots and both promo tiles with the new ones in this folder.

Material: `rulecard-extension-0.8.2.zip`

1. Go to https://chrome.google.com/webstore/devconsole and sign in with your Google account.
   - First time only: accept the developer agreement and pay the one-time $5 registration fee.
2. **If Rulecard is already listed (any status):** click **Rulecard → Package → Upload new package**, choose
   `rulecard-extension-0.8.2.zip`, and confirm. The version must read 0.8.2.
3. **If this is the first upload:** click **+ New item**, choose `rulecard-extension-0.8.2.zip`, then fill the
   tabs in steps 3 to 5.

## 3. Store listing tab

Material: `LISTING.md` (copy each field from its "Store listing tab" section) and the graphics:

| Field | File |
|---|---|
| Store icon (128x128) | `store-icon-128.png` |
| Screenshot 1 | `screenshot-1-capture.png` |
| Screenshot 2 | `screenshot-2-reading-and-writing.png` |
| Screenshot 3 | `screenshot-3-math.png` |
| Screenshot 4 | `screenshot-4-grid-ins.png` |
| Screenshot 5 | `screenshot-5-study-plan.png` |
| Small promo tile (440x280) | `small-promo-tile-440x280.png` |
| Marquee promo tile (1400x560) | `marquee-promo-tile-1400x560.png` |

- Name, Summary, Category (Education), Language (English) and Description: paste from `LISTING.md`.
- Updating an existing listing: delete the old screenshots and upload the five above in order, and paste the
  new Summary and Description (they now describe the Capture button). Everything else stays the same.
- Homepage URL: https://rulecard.vercel.app · Support URL: https://github.com/ishaanshah101/sat-suite-bank-feedback-tutor/issues

## 4. Privacy practices tab

Paste each answer from the "Privacy practices tab" section of `LISTING.md`: single purpose, one justification
per permission, remote code = No, the data-usage boxes, the three certifications, and the privacy policy URL
https://rulecard.vercel.app/privacy.

## 5. Distribution tab

Visibility **Unlisted** first (share by link while you check it) or **Public**; all regions; free.

## 6. Submit

Click **Submit for review** (top right). Reviews usually take 1 to 3 days; Google emails you the result.
After approval, Chrome updates installed copies automatically within a few hours.

## 7. Before going Public: done

You checked College Board's Question Bank terms on 2026-11-03 and capturing is allowed, so Public is fine.

## Optional

- Try a build before Google approves it: unzip it, open `chrome://extensions`, turn on **Developer mode**,
  click **Load unpacked**, pick the unzipped folder. An unpacked copy has a different id, so add that id to
  `EXTENSION_IDS` in Vercel (comma separated) and redeploy, or the browser will refuse its API calls.
- Claim your pre-accounts history: create your account with the old passcode (the `APP_PASSCODE` value in
  Vercel → rulecard → Settings → Environment Variables) in the "Used Rulecard with a passcode before?" box.
