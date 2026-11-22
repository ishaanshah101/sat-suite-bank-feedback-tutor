Install the Rulecard Helper app on this Mac for me. Do every step yourself and only stop for the things macOS requires me to click.

1. Check this is an Apple silicon Mac: run `uname -m`. It should print `arm64`. If it prints `x86_64`, stop and tell me this Mac isn't supported.
2. Find the zip in my Downloads folder: `ls -t ~/Downloads/Rulecard-Helper-*-mac-apple-silicon.zip | head -1`. Use the newest one. If none is there, stop and tell me to download it first.
3. Quit any running copy: `osascript -e 'quit app "Rulecard Helper"' 2>/dev/null; sleep 1`.
4. Unzip it into a fresh temporary folder, keeping symlinks:
   `T=$(mktemp -d) && ditto -x -k "<the zip>" "$T"`
5. Replace any old copy and move the new one into Applications:
   `rm -rf "/Applications/Rulecard Helper.app" && mv "$T/Rulecard Helper.app" /Applications/`
6. The app isn't signed with a paid Apple developer account, so sign it for this Mac:
   `xattr -cr "/Applications/Rulecard Helper.app" && codesign --force --deep --sign - "/Applications/Rulecard Helper.app"`
   Then check it: `codesign --verify --deep "/Applications/Rulecard Helper.app" && echo signed-ok`.
7. Open it: `open "/Applications/Rulecard Helper.app"`. A small panel appears in the top-right corner of the screen, with an icon in the menu bar.
8. Clean up: `rm -rf "$T"`. Leave the zip in Downloads.
9. Tell me the two things only I can do:
   - Sign in in the panel with my Rulecard account (the same email and password as the Rulecard extension).
   - Press "Answer the question on my screen". When macOS asks, open System Settings → Privacy & Security → Screen & System Audio Recording and turn on Rulecard Helper. The app then restarts by itself and answers.

Don't change any other settings, and don't install anything else.
