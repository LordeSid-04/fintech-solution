# CodexGo Setup and Run Guide

This guide is intended to reproduce the application in a clean environment.

## 1) Prerequisites

- Node.js `18.17+` (`20+` recommended)
- npm
- Git

## 2) Clone repository

```bash
git clone https://github.com/LordeSid-04/experiment-dlweek.git
cd experiment-dlweek
```

## 3) Install dependencies

```bash
npm run setup
```

## 4) Backend setup

```bash
cd backend
copy .env.example .env
```

Set values in `backend/.env`:

- `OPENAI_API_KEY=` (optional)
- `OPENAI_MODEL=gpt-5-codex`
- `GOVERNOR_USE_MODEL_SUMMARY=false`
- `BACKEND_PORT=4000`

Run backend:

```bash
npm start
```

Expected: backend prints listening URL and `GET /health` returns `ok: true`.

## 5) Frontend setup

Open a new terminal:

```bash
cd frontend
```

Set frontend env:

```bash
set NEXT_PUBLIC_BACKEND_URL=http://localhost:4000
```

Run frontend:

```bash
npm run dev
```

Expected: app available at `http://localhost:3000`.

## 6) Trial run

1. Open `/auth`, create/login account.
2. Open `/confidence`, set mode (0, 50, or 100).
3. Open `/workspace`, submit a prompt.
4. Confirm timeline events, generated output, and gate decision are shown.

## 7) Deployed app

Public deployment:

- `https://experiment-dlweek.vercel.app`

If backend URL has changed, set `NEXT_PUBLIC_BACKEND_URL` in deployment platform environment settings.
