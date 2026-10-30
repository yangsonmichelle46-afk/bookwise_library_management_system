# Bookwise Library Management Backend (MongoDB)

## Requirements
- Node.js 20 or newer
- MongoDB Atlas cluster or a local MongoDB server

## Setup
1. In this folder, run `npm install`.
2. Copy `.env.example` to `.env`.
3. Replace `MONGODB_URI` with your MongoDB Atlas connection string. Replace `<db_username>` and `<db_password>` with your database user's credentials; URL-encode special characters in the password. Keep `.env` private and never commit it.
4. Add your Gemini API key to `GEMINI_API_KEY` if you use the AI assistant.
5. In MongoDB Atlas Network Access, add your current IP address for local development. For a deployed backend, configure the appropriate network access for that hosting service.
6. Test the database using `npm run test:db`.
7. Start the API using `npm run dev` (or `npm start`).

API runs at `http://localhost:5000` by default.

## Endpoints
- `GET /` — API and MongoDB status
- `GET /api/books` — list all books
- `GET /api/books?search=database` — search title, author, ISBN, or category
- `GET /api/books/:id` — get one book by MongoDB ObjectId
- `POST /api/books` — add a book
- `PUT /api/books/:id` — update a book
- `DELETE /api/books/:id` — delete a book
- `POST /api/ai/chat` — Gemini assistant based on the saved catalog

## Important migration note
This backend stores new books in MongoDB. Existing PostgreSQL records are not copied automatically. Export/import them separately if you need to preserve existing records. MongoDB book IDs are ObjectId strings, not PostgreSQL numeric IDs; the frontend should use the returned `id` value when editing or deleting.
