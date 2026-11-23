Install or update the Rulecard Helper app on this Mac to the newest version (1.2.0 or later: the small black-and-white pill). Do every step yourself. Only stop for things macOS requires me to click, and tell me exactly what to click.

1. Check this is an Apple silicon Mac: run `uname -m`. It must print `arm64`. If it prints `x86_64`, stop and tell me this Mac isn't supported.
2. Quit any running copy: `osascript -e 'quit app "Rulecard Helper"' 2>/dev/null; pkill -x "Rulecard Helper" 2>/dev/null; sleep 1`.
3. Get the app. Use path A if it works, otherwise path B.

   A. From the zip in Downloads: `Z=$(ls -t ~/Downloads/Rulecard-Helper-*-mac-apple-silicon.zip 2>/dev/null | head -1); echo "$Z"`.
      Use it only if the file name has version 1.2.0 or higher. Unzip it into a fresh temp folder, keeping symlinks:
      `T=$(mktemp -d) && ditto -x -k "$Z" "$T" && APP="$T/Rulecard Helper.app"`

   B. Build it from my GitHub repo (if there's no new enough zip):
      - Make sure `git` and Node.js 20 or newer are available (`node -v`). If Node is missing, install it with Homebrew (`brew install node`), installing Homebrew first only if needed.
      - Clone or update the repo: `D=~/Developer/sat-suite-bank-feedback-tutor; [ -d "$D" ] && git -C "$D" pull --ff-only origin main || git clone https://github.com/ishaanshah101/sat-suite-bank-feedback-tutor.git "$D"`. If the clone asks for a login, use my GitHub account (the `gh` CLI or a browser sign-in), not a pasted password.
      - Build: `cd "$D/desktop" && npm ci && node package-mac.mjs`.
      - Use the built app: `APP="$D/desktop/release/mac-arm64/Rulecard Helper.app"`.
4. Replace the old copy: `rm -rf "/Applications/Rulecard Helper.app" && ditto "$APP" "/Applications/Rulecard Helper.app"`.
5. The app isn't signed with a paid Apple developer account, so sign it for this Mac and check it:
   `xattr -cr "/Applications/Rulecard Helper.app" && codesign --force --deep --sign - "/Applications/Rulecard Helper.app" && codesign --verify --deep "/Applications/Rulecard Helper.app" && echo signed-ok`
6. Confirm the version: `defaults read "/Applications/Rulecard Helper.app/Contents/Info" CFBundleShortVersionString` (it should say 1.2.0 or higher).
7. Open it: `open "/Applications/Rulecard Helper.app"`. A small black pill appears in the top-right corner of the screen, with an icon in the menu bar.
8. Clean up any temp folder you made (`rm -rf "$T"` for path A). Leave the zip and the repo where they are.
9. Then tell me, in two short lines, the only things I have to do myself:
   - If the pill shows a sign-in card: sign in with my Rulecard account (same email and password as the Rulecard extension). An update usually keeps me signed in.
   - Press the pill's white button. If macOS asks for Screen & System Audio Recording, turn on Rulecard Helper in System Settings → Privacy & Security. Because the app was re-signed, macOS may ask again even if it was on before; if Rulecard Helper is already listed, switch it off and on. The app restarts by itself and shows the answer.

Don't change any other settings, and don't install anything except what step 3B needs.
