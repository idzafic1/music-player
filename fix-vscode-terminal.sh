#!/usr/bin/env bash
#
# fix-vscode-terminal.sh
# Makes VS Code's integrated terminal on Fedora behave like your normal bash terminal.
#
# What it does:
#   1. Finds your VS Code User settings.json (works for VS Code, Insiders, and VSCodium)
#   2. Sets bash as the default Linux terminal profile (non-login, no -l flag)
#   3. Ensures ~/.bash_profile sources ~/.bashrc (so PS1/prompt settings load)
#   4. Warns you if ~/.bashrc doesn't actually set PS1 anywhere
#
# Safe to re-run — it won't duplicate settings or lines it already added.

set -euo pipefail

echo "=== VS Code Terminal Fixer for Fedora ==="
echo

# --- Step 1: locate settings.json ---
CANDIDATES=(
    "$HOME/.config/Code/User/settings.json"
    "$HOME/.config/Code - Insiders/User/settings.json"
    "$HOME/.config/VSCodium/User/settings.json"
)

SETTINGS_FILE=""
for path in "${CANDIDATES[@]}"; do
    if [[ -f "$path" ]]; then
        SETTINGS_FILE="$path"
        break
    fi
done

if [[ -z "$SETTINGS_FILE" ]]; then
    echo "Could not find a VS Code settings.json automatically."
    echo "Checked:"
    printf '  %s\n' "${CANDIDATES[@]}"
    echo "Open VS Code, run 'Preferences: Open User Settings (JSON)', and note the file path,"
    echo "then re-run this script with: SETTINGS_FILE=/path/to/settings.json $0"
    exit 1
fi

echo "Found settings file: $SETTINGS_FILE"

# --- Step 2: back it up before touching it ---
BACKUP="${SETTINGS_FILE}.bak.$(date +%Y%m%d%H%M%S)"
cp "$SETTINGS_FILE" "$BACKUP"
echo "Backup saved to: $BACKUP"

# --- Step 3: patch settings.json using python3 (handles JSON safely, preserves other keys) ---
if ! command -v python3 &>/dev/null; then
    echo "python3 is required to safely edit JSON but wasn't found. Install it with:"
    echo "  sudo dnf install python3"
    exit 1
fi

python3 - "$SETTINGS_FILE" <<'PYEOF'
import json, sys, io

path = sys.argv[1]

with open(path, "r", encoding="utf-8") as f:
    raw = f.read()

# settings.json technically allows comments/trailing commas in some editors,
# but if that ever breaks this parser, edit the file manually instead.
try:
    data = json.loads(raw) if raw.strip() else {}
except json.JSONDecodeError:
    print("Could not parse settings.json as plain JSON (it may contain comments).")
    print("Skipping automatic edit — please add the bash profile manually.")
    sys.exit(0)

profiles = data.setdefault("terminal.integrated.profiles.linux", {})
profiles["bash"] = {
    "path": "/usr/bin/bash",
    "icon": "terminal-bash"
}
data["terminal.integrated.defaultProfile.linux"] = "bash"

with open(path, "w", encoding="utf-8") as f:
    json.dump(data, f, indent=4)
    f.write("\n")

print("Updated terminal.integrated.profiles.linux and defaultProfile.linux")
PYEOF

echo

# --- Step 4: ensure ~/.bash_profile sources ~/.bashrc ---
BASH_PROFILE="$HOME/.bash_profile"
SOURCE_LINE='[[ -f ~/.bashrc ]] && . ~/.bashrc'

if [[ ! -f "$BASH_PROFILE" ]]; then
    echo "No ~/.bash_profile found — creating one."
    echo "$SOURCE_LINE" > "$BASH_PROFILE"
    echo "Created $BASH_PROFILE and added the source line."
elif grep -qF '.bashrc' "$BASH_PROFILE"; then
    echo "~/.bash_profile already sources .bashrc — no change needed."
else
    echo "" >> "$BASH_PROFILE"
    echo "$SOURCE_LINE" >> "$BASH_PROFILE"
    echo "Appended source line to $BASH_PROFILE"
fi

# --- Step 5: check PS1 is actually set somewhere in .bashrc ---
echo
if grep -q "PS1=" "$HOME/.bashrc" 2>/dev/null; then
    echo "~/.bashrc sets PS1 — your prompt should load correctly."
else
    echo "WARNING: No PS1 assignment found in ~/.bashrc."
    echo "Your prompt style may be defined in /etc/bashrc or /etc/profile.d/ instead."
    echo "If your VS Code prompt still looks plain after this fix, check those files."
fi

echo
echo "=== Done ==="
echo "Fully close any open VS Code integrated terminal tabs and open a new one to see the change."
