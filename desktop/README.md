# Rulecard Practice Test Helper (Mac)

A small floating panel in the top-right corner of the Mac screen, like a desktop AI assistant. While you
review a practice test, press **⌥⇧Space** (or the button) and it looks at the screen you are on, finds the
SAT or ACT question there, and answers it carefully: two independent solves, and a third deciding solve if
they disagree. Then you can ask follow-up questions in the chat box.

It answers SAT and ACT questions only. It uses the normal macOS Screen Recording permission and nothing
else: it does not try to run inside, hide from, or get around any locked-down testing app.

## Install (from the zip)

1. Unzip `Rulecard-Helper-<version>-mac-apple-silicon.zip` (M1/M2/M3/M4 Macs) or `...-mac-intel.zip`, and
   drag **Rulecard Helper.app** into **Applications**.
2. The build is not notarized by Apple, so sign it for your own Mac once. Open Terminal and paste:

   ```sh
   xattr -cr "/Applications/Rulecard Helper.app" && codesign --force --deep --sign - "/Applications/Rulecard Helper.app"
   ```

3. Open the app. Sign in with your Rulecard account (the same one as the extension and website).
4. Press **Answer the question on my screen**. macOS asks for **Screen & System Audio Recording**. Turn
   Rulecard Helper on in System Settings → Privacy & Security, then press **Relaunch** in the panel.

## Use

- **⌥Space** shows or hides the panel. **⌥⇧Space** answers the question on the screen under the pointer.
- The menu bar icon has the same actions, plus **Open at login**, **Sign out** and **Quit**.
- "✓ Checked twice" means two separate solves agreed. "Checked 3 times: close call" means they disagreed
  and a third solve decided; read the reasoning on those.

## Build

```sh
cd desktop
ELECTRON_SKIP_BINARY_DOWNLOAD=1 npm ci   # the Mac Electron binary is fetched by electron-builder
node package-mac.mjs                       # builds both zips into desktop/release/
```

`node build.mjs` alone bundles `src/` into `dist/` (main, preload, renderer). The panel talks to the
Rulecard server's `/api/solve` and `/api/solve/chat` with the signed-in session token, which is stored in
the macOS keychain through Electron `safeStorage`.
