# Bookwise Frontend (fixed for MongoDB IDs)

## Install and run
1. Open a terminal in this folder.
2. Run `npm install`.
3. Copy `.env.example` to `.env` and set `VITE_API_BASE_URL=http://localhost:5000` for local development.
4. Start the backend in its own terminal.
5. Run `npm run dev` and open the URL printed by Vite.

## Fix included
The frontend now normalizes MongoDB `_id` into `id`, because edit/delete actions use `id`.

Do not put `MONGODB_URI` or Gemini API keys in the frontend. Those belong only in `backend/.env` or your backend host's environment variables.
