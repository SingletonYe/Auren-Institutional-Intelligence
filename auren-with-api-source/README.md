# Auren Institutional Intelligence

A finance AI website prototype with a Miromind API-backed research assistant.

## Run Locally

1. Create `.env` from `.env.example`.
2. Set `MIROMIND_API_KEY` to your Miromind API key.
3. Start the app:

```bash
npm start
```

Open `http://localhost:3000`.

## API

The frontend calls `POST /api/chat`. The Node server keeps the API key on the backend and forwards requests to Miromind's chat completions endpoint using `mirothinker-1-7-deepresearch-mini`.
