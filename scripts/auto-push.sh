#!/bin/bash
# Runs in the background every 15 minutes while the Codespace is awake.
# Commits any uncommitted changes and pushes to origin.
while true; do
  sleep 900
  cd /workspaces/plant-care-system
  if ! git diff --quiet || ! git diff --cached --quiet || [ -n "$(git ls-files --others --exclude-standard)" ]; then
    git add -A
    git commit -m "auto-backup $(date '+%Y-%m-%d %H:%M')"
  fi
  git push 2>/dev/null || true
done
