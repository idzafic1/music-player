#!/usr/bin/env bash
#
# fix-vscode-prompt.sh
# Diagnoses why VS Code's integrated terminal shows a plain "bash-5.3$" prompt
# instead of your normal user@host:~/path$ prompt, then fixes it.
#
# Safe to re-run — it won't duplicate lines it already added.

set -uo pipefail

echo "=== VS Code Prompt Diagnostics ==="
echo

echo "--- Is this shell interactive? ---"
case "$-" in
    *i*) echo "Yes, '\$-' contains 'i' (interactive)." ;;
    *)   echo "No, '\$-' does NOT contain 'i' — this shell thinks it's non-interactive." ;;
esac
echo

echo "--- Does /etc/bashrc set PS1? ---"
if [[ -f /etc/bashrc ]]; then
    if grep -q "PS1=" /etc/bashrc; then
        echo "Yes, found in /etc/bashrc:"
        grep -n "PS1=" /etc/bashrc
    else
        echo "No PS1 assignment found in /etc/bashrc."
    fi
else
    echo "/etc/bashrc does not exist on this system."
fi
echo

echo "--- Does /etc/profile.d/ have anything setting PS1? ---"
if ls /etc/profile.d/*.sh &>/dev/null; then
    if grep -l "PS1=" /etc/profile.d/*.sh 2>/dev/null; then
        :
    else
        echo "No matches in /etc/profile.d/*.sh"
    fi
else
    echo "No scripts in /etc/profile.d/"
fi
echo

echo "--- Does ~/.bashrc source /etc/bashrc? ---"
if [[ -f "$HOME/.bashrc" ]] && grep -q "/etc/bashrc" "$HOME/.bashrc"; then
    echo "Yes:"
    grep -n "/etc/bashrc" "$HOME/.bashrc"
else
    echo "No — ~/.bashrc does NOT source /etc/bashrc. This is likely why PS1 never gets set."
fi
echo

# --- The actual fix: set PS1 explicitly in ~/.bashrc ---
# This guarantees a consistent prompt no matter what /etc/bashrc or profile.d do.
BASHRC="$HOME/.bashrc"
MARKER="# Custom prompt (added by fix-vscode-prompt.sh)"
STANDARD_PS1='PS1='"'"'\[\033[01;32m\]\u@\h\[\033[00m\]:\[\033[01;34m\]\w\[\033[00m\]\$ '"'"

if grep -qF "$MARKER" "$BASHRC" 2>/dev/null; then
    echo "Custom PS1 already added to ~/.bashrc previously — skipping."
else
    {
        echo ""
        echo "$MARKER"
        echo "$STANDARD_PS1"
    } >> "$BASHRC"
    echo "Added explicit PS1 to ~/.bashrc:"
    echo "  $STANDARD_PS1"
fi

echo
echo "=== Done ==="
echo "Fully close any open VS Code integrated terminal tabs, open a new one, and your prompt"
echo "should now show user@host:~/path\$ consistently — independent of /etc/bashrc."
