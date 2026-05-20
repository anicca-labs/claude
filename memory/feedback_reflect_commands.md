---
name: feedback-reflect-commands
description: Always run reflect app commands using the scripts in package.json, from the /Users/marianoksairi/workspace/reflect directory
metadata:
  type: feedback
---

Always run commands for the reflect app using the scripts defined in `package.json` (e.g. `yarn build-apk`, `yarn dev-client-android`) and always `cd` to `/Users/marianoksairi/workspace/reflect` first (or use the full path). Never run `yarn expo prebuild`, `yarn expo install`, etc. from a different directory — it will silently run in the wrong project.

**Why:** Running commands like `yarn expo prebuild` from the wrong directory (e.g. `/Users/marianoksairi/workspace/claude`) produces no error but operates on the wrong project, wasting time and causing confusing results.

**How to apply:** Before running any reflect-specific command, ensure the working directory is `/Users/marianoksairi/workspace/reflect`. Use `cd /Users/marianoksairi/workspace/reflect && <command>` pattern.
