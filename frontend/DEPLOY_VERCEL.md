# Deploying the frontend to Vercel

This file explains how to deploy the Next.js frontend to Vercel (via GitHub integration or Vercel CLI) and which environment variables are required.

Summary
- Framework: Next.js 15 (App Router)
- Build command: npm run build
- Output directory: .next

Important: Do NOT commit secrets. Use Vercel Project Settings -> Environment Variables to add secrets.

Required environment variables (common)
- NEXT_PUBLIC_API_URL - URL to backend API (e.g. https://api.example.com/api)
- NEXT_PUBLIC_SOCKET_URL - Socket.IO server URL (e.g. https://api.example.com)
- JWT_SECRET - JWT signing secret used by server API (if server runs on Vercel)

Optional (Azure speech/translator features)
- AZURE_SPEECH_KEY
- AZURE_SPEECH_REGION
- AZURE_TRANSLATOR_KEY
- AZURE_TRANSLATOR_REGION

Deploy with GitHub (recommended)
1. Push this repository to GitHub (or ensure the branch you want deployed is pushed).
2. Go to https://vercel.com/new and import the repository.
3. In the project settings, set the Build Command to: npm run build
4. Set the Output Directory to: .next
5. Add the required environment variables in the Vercel dashboard (Production and Preview as needed).
6. Deploy — Vercel will build and serve the app.

Deploy with Vercel CLI
1. Install the CLI: npm i -g vercel
2. From the `frontend/` folder run: vercel login && vercel
3. During the prompts choose the project name and link it to your account or an existing project.
4. When asked for build settings, confirm the build command: npm run build and output directory: .next
5. Add environment variables in the Vercel web UI (recommended) or via `vercel env add`.

Deploy from VS Code

- Install the recommended extensions (see `.vscode/extensions.json`) or install the official Vercel extension: `Vercel` by Vercel.
- Open the project in VS Code and run the build task: Command Palette -> Tasks: Run Task -> "Next: build (production)" (or use the Run Task UI).
- Use the Vercel extension sidebar to deploy (sign-in and choose the project). The extension will run the `vercel` CLI under the hood.
- Alternatively, open the integrated terminal and run `vercel` or `vercel --prod` after `vercel login`.
- I included `.vscode/tasks.json` which provides convenient tasks:
	- "Next: build (production)" — runs `npm run build`
	- "Vercel: login" — runs `vercel login` (interactive)
	- "Vercel: deploy (preview)" — runs `vercel` and depends on the build task
	- "Vercel: deploy (production)" — runs `vercel --prod` and depends on the build task

Notes about VS Code tasks and extensions

- Tasks run in your shell, so ensure the Vercel CLI is installed globally (`npm i -g vercel`) if you plan to run the Vercel tasks from VS Code.
- The `vercel.vercel` extension lets you create/deploy projects from the editor and manage domains, but secrets should be set in the Vercel web UI.
- `.vscode/extensions.json` includes recommendations such as `vercel.vercel`, `esbenp.prettier-vscode`, and `dbaeumer.vscode-eslint` to improve DX.

Backend notes
- This repository contains a separate `backend/` service that runs a Socket.IO server and other API endpoints. You must deploy that service separately (e.g., Vercel Serverless Functions, Render, or another host) and set `NEXT_PUBLIC_API_URL` and `NEXT_PUBLIC_SOCKET_URL` to point to it.
- If you host the backend separately, ensure CORS and Socket origins allow your Vercel frontend domain.

Troubleshooting
- If builds fail due to memory/heap errors, try setting NODE_OPTIONS=--max-old-space-size=4096 in Vercel build environment variables.
- If Socket.IO cannot connect in production, check that `NEXT_PUBLIC_SOCKET_URL` is correct and that the backend allows the frontend origin.

That's it — once the project is linked, Vercel will build and deploy on each push.
