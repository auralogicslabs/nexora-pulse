# Nexora Pulse — WordPress.org SVN Release Guide

How to publish/update Nexora Pulse on the WordPress.org plugin directory.
First publish was **revision 3588689** on 2026-06-28.

---

## ⚠️ THE WORKFLOW — always edit SOURCE first, never the SVN copy directly

```
1. EDIT in SOURCE:   C:\project\nexora\products\nexora-pulse\   (git-tracked, the canonical truth)
2. COMMIT + PUSH:    git add . && git commit -m "..." && git push origin main   (keeps public GitHub repo current)
3. BUILD/COPY to RELEASE:  C:\project\nexora\release\nexora-pulse\nexora-pulse\   (the shippable files)
4. COPY release → SVN working copy:  trunk\  (+ tags\<ver>\ for a new release, + assets\ for images)
5. svn ci   → publishes to wordpress.org
```

NEVER edit `nexora-pulse-svn\` directly and call it done — the source + GitHub would silently drift from
what's live. If you ever do edit the SVN copy by accident, copy that file BACK to source + release so all
copies stay byte-identical, then commit source to git.

Git identity for the public repo MUST be `Auralogics Labs <hello@auralogicslabs.com>` (never a personal name,
never an AI co-author trailer).

## Key facts (read once)

- **SVN is a RELEASE system, not Git.** You only push finished, ready-to-use versions.
- **Public page:** https://wordpress.org/plugins/nexora-pulse
- **SVN repo:** https://plugins.svn.wordpress.org/nexora-pulse
- **SVN username:** `auralogics` (case-sensitive — exactly this)
- **SVN password:** SEPARATE from the wp.org login password. Get/reset it at
  https://profiles.wordpress.org/me/profile/edit/group/3/?screen=svn-password
- **Client:** SlikSVN (command-line `svn`), installed and on PATH.
- **Working copy on this PC:** `C:\project\nexora\release\nexora-pulse-svn\`
  (Has `.svn/` — this is the live link to wp.org. Do NOT delete it.)

## Repo layout (what each folder is for)

```
nexora-pulse-svn/
├── trunk/         ← the CURRENT plugin code (the development/latest version)
├── tags/
│   └── 1.0.0/     ← a FROZEN snapshot of each released version (copy of trunk at release time)
└── assets/        ← wp.org LISTING images only (screenshots, banners, icons) — NOT shipped in the plugin
```

- `readme.txt` line **`Stable tag: X.Y.Z`** decides which `tags/X.Y.Z/` the public page serves.
  The public page reads `tags/<stable tag>/readme.txt`, so the stable tag MUST point to a real tag folder.
- `assets/` filenames are fixed by wp.org convention:
  `screenshot-1.png … screenshot-9.png` (order matches the readme `== Screenshots ==` captions),
  `banner-1544x500.png`, `banner-772x250.png`, `icon-128x128.png`, `icon-256x256.png`.

---

## A) First-time publish (already done — for reference)

```powershell
cd C:\project\nexora\release
svn co https://plugins.svn.wordpress.org/nexora-pulse nexora-pulse-svn
cd nexora-pulse-svn

# Copy the plugin file CONTENTS (not a wrapping folder, not the zip) into trunk:
Copy-Item "C:\project\nexora\release\nexora-pulse\nexora-pulse\*" -Destination "trunk\" -Recurse -Force
# Freeze the release tag (identical to trunk):
Copy-Item "trunk\*" -Destination "tags\1.0.0\" -Recurse -Force
# Listing images:
Copy-Item "C:\project\nexora\wporg-assets\nexora-pulse\*" -Destination "assets\" -Recurse -Force

svn add trunk tags assets --force
svn ci -m "Nexora Pulse 1.0.0" --username auralogics    # prompts for SVN password
```

GOTCHAS seen the first time (avoid these):
- When copying into `tags/1.0.0`, copy the PLUGIN ROOT (app/, nexora-pulse.php, readme.txt, …),
  NOT the inside of `app/`. tags/1.0.0 must look identical to trunk.
- Don't forget `assets/` — it's easy to leave empty. Verify it has all 13 images before commit.

---

## B) Releasing a NEW version (e.g. 1.0.1) — the normal flow

1. Build the new plugin zip as usual (your build-zip.ps1), so
   `C:\project\nexora\release\nexora-pulse\nexora-pulse\` holds the new files.

2. Bump the version in BOTH places (must match):
   - `nexora-pulse.php` header `Version: 1.0.1`
   - `readme.txt` `Stable tag: 1.0.1`
   - Add a `== Changelog ==` entry for 1.0.1.

3. Refresh trunk, then make the new tag:
   ```powershell
   cd C:\project\nexora\release\nexora-pulse-svn
   svn up                                   # sync first

   # Update trunk to the new files:
   Copy-Item "C:\project\nexora\release\nexora-pulse\nexora-pulse\*" -Destination "trunk\" -Recurse -Force

   # Stage trunk changes (adds new files, marks changed ones):
   svn add trunk --force

   # Create the version tag as a server-side copy of trunk (cleanest):
   svn cp trunk tags/1.0.1

   svn status                               # review what will be committed
   svn ci -m "Nexora Pulse 1.0.1" --username auralogics
   ```
   - If you DELETED files between versions, run `svn rm` on them in trunk before commit
     (or use `svn status` to spot missing `!` entries and `svn rm` them).

4. Updating ONLY listing images / screenshots (no code change):
   ```powershell
   Copy-Item "C:\project\nexora\wporg-assets\nexora-pulse\*" -Destination "assets\" -Recurse -Force
   svn add assets --force
   svn ci -m "Update listing assets" --username auralogics
   ```
   Asset changes go live almost immediately and do NOT require a version bump.

5. Updating ONLY the readme/description (no code change):
   Edit `trunk/readme.txt`, then `svn ci -m "readme update" --username auralogics`.
   (Keep the Stable tag pointing at the current released tag.)

---

## C) Handy commands

```powershell
svn status            # what's changed/added/missing in the working copy
svn diff              # see the exact line changes before committing
svn up                # pull the latest from the server (do before editing)
svn info              # repo URL + current revision
svn revert -R .       # undo all local changes (careful)
```

## D) After any commit

- Code/version changes: the public page updates within minutes; search + profile can lag up to 72h.
- The page always reflects `tags/<Stable tag>/`. If a release looks wrong, first check the Stable tag
  value in `trunk/readme.txt` actually matches an existing `tags/` folder.

## E) Rules to stay listed

- Only push working, ready-to-use versions (no half-finished commits).
- Keep guideline compliance (Plugin Check / PHPCS+WPCS clean of errors).
- Commit identity for any PUBLIC git repo: "Auralogics Labs <hello@auralogicslabs.com>" — never personal
  names, never AI co-author trailers. (SVN commits just use the auralogics username + SVN password.)
