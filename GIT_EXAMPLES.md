Git Quick Examples for this repository

This file contains a few practical git command examples and small workflows tailored to the current repository. Replace placeholders like <remote-url> with your real values.

1) Create and switch to a branch

# Create and switch to a new branch
git checkout -b separate

# Verify current branch
git branch --show-current

2) Stage and commit files

# Stage all files (careful: this includes .DS_Store / env files)
git add .

# Commit with message
git commit -m "Initial commit on separate branch"

3) Push branch to remote

# Add a remote if you don't have one
# git remote add origin <remote-url>

# Push and set upstream
git push -u origin separate

4) Create .gitignore and remove unwanted files from repository

# Example .gitignore entries you may want in the root
# .DS_Store
# node_modules/
# **/node_modules/
# frontend/.next/
# backend/.env
# frontend/.env.local

# If you accidentally committed files you want ignored:
# 1) Add rules to .gitignore
# 2) Remove the files from the index (they remain on disk)
git rm --cached .DS_Store
git rm -r --cached node_modules

# Re-commit the removal
git commit -m "Remove ignored files and add .gitignore"

5) Create a pull request (GitHub example)

# After pushing the branch, create a PR via GitHub UI or gh CLI
# gh pr create --base master --head your-username:separate --title "Feature: ..." --body "Description"

Notes and safety tips
- Never commit secrets (.env or private keys). Keep environment files out of git and use `.env.example` instead.
- Use a clear commit message. One-line summary + optional body is best.
- Before pushing, run `git status` and `git diff --staged` to review staged changes.

If you'd like, I can:
- Add a good `.gitignore` to the repo root and remove files like `.DS_Store` and environment files from tracking.
- Push `separate` to your remote and set the upstream for you (if you provide the remote or it's already configured).
- Create a sample PR using the GitHub CLI if you have `gh` installed and authenticated.
