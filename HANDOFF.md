# Marble Formula (`@MarbleFormula`) — New Machine Handoff Guide

This repository contains the complete 3D engine, YouTube automation, web portal (`https://marbleformula.com`), and `.agents/rules/marbleformula-context.md` rule file so any new Antigravity conversation on a new Mac automatically inherits the full context of our previous sessions.

---

## 1. Quick Start on the New Mac

```bash
git clone https://github.com/AEliasS99/marbleformula.git
cd marbleformula
zsh scripts/setup-new-mac.sh
```

What `zsh scripts/setup-new-mac.sh` does automatically:
1. Checks/installs **Homebrew**, **Node.js**, and **FFmpeg**.
2. Runs `npm install` (Rapier 3D physics, Three.js, React Three Fiber, Remotion).
3. Restores `.youtube-client.json` and `.youtube-token.json` automatically from `$HOME/GoogleCloud/.youtube-auth/` (if `GoogleCloud` is mounted).
4. Generates initial telemetry in `src/gp/races/`.

---

## 2. How to Pick Up the Conversation in Antigravity on the New Mac

Because Antigravity stores raw chat SQLite databases locally in `~/.gemini/antigravity/`, we have committed **[`.agents/rules/marbleformula-context.md`](.agents/rules/marbleformula-context.md)** directly into this Git repository:
- **Automatic Context Injection**: As soon as you open this repository folder in Antigravity on the new Mac and start a chat, Antigravity automatically loads `.agents/rules/marbleformula-context.md` into the agent's system prompt.
- You can simply say: *"Continue from `HANDOFF.md` — check `$HOME/GoogleCloud` and resume the 4K TCR renders/uploads"* and the agent will immediately know all rules, video paths, and YouTube upload commands.
- *(Optional)* If you also want the literal chat history list in the sidebar on the new Mac, you can copy `~/.gemini/antigravity/` from the old Mac via Google Cloud:
  ```bash
  # On old Mac (if needed):
  rsync -av ~/.gemini/antigravity/conversations/ ~/GoogleCloud/.antigravity-backup/conversations/
  rsync -av ~/.gemini/antigravity/brain/ ~/GoogleCloud/.antigravity-backup/brain/
  ```

---

## 3. Core Commands

- **Render & Upload 4K60 TCR Car Tournaments (Swiss Alps + Tokyo) to `$HOME/GoogleCloud` & YouTube**:
  ```bash
  caffeinate -dimsu zsh scripts/render-tcr-overnight.sh
  ```
- **Upload a Specific Video from `$HOME/GoogleCloud` to `@MarbleFormula`**:
  ```bash
  NODE_OPTIONS="--dns-result-order=ipv4first" node scripts/upload-youtube.mjs --file "$HOME/GoogleCloud/<video>.mp4" --round <round-id> --force
  ```
- **Deploy `site/` to `https://marbleformula.com` (Cloudflare Pages)**:
  ```bash
  CI=1 NODE_OPTIONS="--dns-result-order=ipv4first" npx wrangler pages deploy site --project-name=marble-formula --branch=main --commit-dirty=true
  ```
