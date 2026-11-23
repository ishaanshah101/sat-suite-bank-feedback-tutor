# Rulecard Practice Test Helper (Mac)

A small black pill in the top-right corner of the Mac screen, black and white only. While you review a
practice test, press its button (or **⌥⇧Space**) and it looks at the screen you are on, finds the SAT or ACT
question there, and shows just the answer (a letter, or the number for a grid-in). No explanation, no chat.
The answer is still solved carefully: two independent solves, and a third deciding solve if they disagree.
It shows grey while the second solve is still checking, and turns white when it is final.

It answers SAT and ACT questions only. It uses the normal macOS Screen Recording permission and nothing
else: it does not try to run inside, hide from, or get around any locked-down testing app.

## Install (from the zip)

1. Unzip `Rulecard-Helper-<version>-mac-apple-silicon.zip` (Apple silicon Macs: M1 and later; Intel Macs are not supported), and
   drag **Rulecard Helper.app** into **Applications**.
2. The build is not notarized by Apple, so sign it for your own Mac once. Open Terminal and paste:

   ```sh
   xattr -cr "/Applications/Rulecard Helper.app" && codesign --force --deep --sign - "/Applications/Rulecard Helper.app"
   ```

3. Open the app. Sign in with your Rulecard account (the same one as the extension and website).
4. Press the pill's button. macOS asks for **Screen & System Audio Recording**. Turn Rulecard Helper on in
   System Settings → Privacy & Security. It restarts by itself and answers.

## Use

- **⌥Space** shows or hides the pill. **⌥⇧Space** (or the pill's button) answers the question on the screen
  under the pointer. Drag the pill anywhere; **×** hides it.
- The menu bar icon has the same actions, plus **Open at login**, **Sign out** and **Quit**.
- Hover over the answer to see how it was checked ("Checked twice", or "Close call: checked 3 times").

## Build

```sh
cd desktop
ELECTRON_SKIP_BINARY_DOWNLOAD=1 npm ci   # the Mac Electron binary is fetched by electron-builder
node package-mac.mjs                       # builds the Apple silicon zip into desktop/release/
```

`node build.mjs` alone bundles `src/` into `dist/` (main, preload, renderer). The pill talks to the
Rulecard server's `/api/solve` with the signed-in session token, which is stored in the macOS keychain
through Electron `safeStorage`. The window sizes itself to what it shows (`helper:resize`).
