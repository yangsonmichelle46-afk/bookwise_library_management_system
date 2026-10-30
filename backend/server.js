
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const { GoogleGenAI } = require('@google/genai');

const { Book, connectDB } = require('./db');

const app = express();
const PORT = process.env.PORT || 5000;

// ================================
// MIDDLEWARE
// ================================

app.use(cors());
app.use(express.json({ limit: '1mb' }));

// ================================
// HELPER FUNCTIONS
// ================================

function normalizeBook(book) {
  if (!book) return null;

  const item =
    typeof book.toObject === 'function'
      ? book.toObject()
      : book;

  const id = String(item._id || item.id);

  return {
    id,
    _id: id,
    title: item.title,
    author: item.author,
    isbn: item.isbn || '',
    category: item.category || '',
    publishedYear: item.publishedYear ?? null,
    quantity: item.quantity ?? 0,
    availableCopies: item.availableCopies ?? 0
  };
}

function isValidBookId(id) {
  return mongoose.isValidObjectId(id);
}

function validateBookInput(body = {}, isUpdate = false) {
  const {
    title,
    author,
    isbn = '',
    category = '',
    publishedYear = null
  } = body;

  const quantity = Number(
    body.quantity ?? (isUpdate ? NaN : 0)
  );

  const availableCopies = Number(
    body.availableCopies ?? (isUpdate ? NaN : quantity)
  );

  const year =
    publishedYear === '' || publishedYear == null
      ? null
      : Number(publishedYear);

  if (typeof title !== 'string' || !title.trim()) {
    return { error: 'Book title is required.' };
  }

  if (typeof author !== 'string' || !author.trim()) {
    return { error: 'Book author is required.' };
  }

  if (!Number.isFinite(quantity) || quantity < 0) {
    return { error: 'Quantity must be a valid non-negative number.' };
  }

  if (
    !Number.isFinite(availableCopies) ||
    availableCopies < 0 ||
    availableCopies > quantity
  ) {
    return {
      error: 'Available copies must be between zero and the total quantity.'
    };
  }

  if (
    year !== null &&
    (!Number.isInteger(year) || year < 0)
  ) {
    return { error: 'Published year must be a valid whole number.' };
  }

  return {
    data: {
      title: title.trim(),
      author: author.trim(),
      isbn: String(isbn || '').trim(),
      category: String(category || '').trim(),
      publishedYear: year,
      quantity,
      availableCopies
    }
  };
}

// ================================
// HOME / API HEALTH CHECK
// ================================

app.get('/', (req, res) => {
  const connected = mongoose.connection.readyState === 1;

  res.status(connected ? 200 : 503).json({
    message: 'Bookwise Library Management System API',
    database: connected ? 'connected' : 'disconnected'
  });
});

// ================================
// GET ALL BOOKS / SEARCH BOOKS
// ================================

app.get('/api/books', async (req, res) => {
  try {
    const search = String(req.query.search || '').trim();

    const escapedSearch = search.replace(
      /[.*+?^${}()|[\]\\]/g,
      '\\$&'
    );

    const filter = search
      ? {
          $or: [
            {
              title: {
                $regex: escapedSearch,
                $options: 'i'
              }
            },
            {
              author: {
                $regex: escapedSearch,
                $options: 'i'
              }
            },
            {
              isbn: {
                $regex: escapedSearch,
                $options: 'i'
              }
            },
            {
              category: {
                $regex: escapedSearch,
                $options: 'i'
              }
            }
          ]
        }
      : {};

    const books = await Book.find(filter)
      .sort({ title: 1 })
      .lean();

    res.json({
      count: books.length,
      data: books.map(normalizeBook)
    });

  } catch (error) {
    console.error('Get books error:', error.message);

    res.status(500).json({
      message: 'Failed to retrieve books.'
    });
  }
});

// ================================
// GET ONE BOOK
// ================================

app.get('/api/books/:id', async (req, res) => {
  try {
    if (!isValidBookId(req.params.id)) {
      return res.status(400).json({
        message: 'Invalid book ID.'
      });
    }

    const book = await Book.findById(req.params.id).lean();

    if (!book) {
      return res.status(404).json({
        message: 'Book not found.'
      });
    }

    res.json({
      data: normalizeBook(book)
    });

  } catch (error) {
    console.error('Get book error:', error.message);

    res.status(500).json({
      message: 'Failed to retrieve book.'
    });
  }
});

// ================================
// ADD NEW BOOK
// ================================

app.post('/api/books', async (req, res) => {
  try {
    const result = validateBookInput(req.body);

    if (result.error) {
      return res.status(400).json({
        message: result.error
      });
    }

    const book = await Book.create(result.data);

    res.status(201).json({
      message: 'Book added successfully.',
      data: normalizeBook(book)
    });

  } catch (error) {
    console.error('Add book error:', error.message);

    res.status(400).json({
      message: 'Could not add the book. Check the submitted values.'
    });
  }
});

// ================================
// UPDATE BOOK
// ================================

app.put('/api/books/:id', async (req, res) => {
  try {
    if (!isValidBookId(req.params.id)) {
      return res.status(400).json({
        message: 'Invalid book ID.'
      });
    }

    const result = validateBookInput(req.body, true);

    if (result.error) {
      return res.status(400).json({
        message: result.error
      });
    }

    const book = await Book.findByIdAndUpdate(
      req.params.id,
      result.data,
      {
        new: true,
        runValidators: true
      }
    );

    if (!book) {
      return res.status(404).json({
        message: 'Book not found.'
      });
    }

    res.json({
      message: 'Book updated successfully.',
      data: normalizeBook(book)
    });

  } catch (error) {
    console.error('Update book error:', error.message);

    res.status(400).json({
      message: 'Could not update the book. Check the submitted values.'
    });
  }
});

// ================================
// DELETE BOOK
// ================================

app.delete('/api/books/:id', async (req, res) => {
  try {
    if (!isValidBookId(req.params.id)) {
      return res.status(400).json({
        message: 'Invalid book ID.'
      });
    }

    const book = await Book.findByIdAndDelete(req.params.id);

    if (!book) {
      return res.status(404).json({
        message: 'Book not found.'
      });
    }

    res.json({
      message: 'Book deleted successfully.'
    });

  } catch (error) {
    console.error('Delete book error:', error.message);

    res.status(500).json({
      message: 'Failed to delete the book.'
    });
  }
});

// ================================
// GEMINI AI LIBRARY ASSISTANT
// ================================

app.post('/api/ai/chat', async (req, res) => {
  try {
    const message = req.body?.message;

    if (typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({
        message: 'Please enter a question.'
      });
    }

    if (message.length > 1000) {
      return res.status(400).json({
        message: 'Your question must be 1000 characters or fewer.'
      });
    }

    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey || !apiKey.trim()) {
      return res.status(503).json({
        message: 'Gemini API key is not configured on the server.'
      });
    }

    const catalog = await Book.find({})
      .sort({ title: 1 })
      .limit(100)
      .select(
        'title author category publishedYear quantity availableCopies'
      )
      .lean();

    if (catalog.length === 0) {
      return res.json({
        reply: 'There are currently no books in the library catalog.'
      });
    }

    const ai = new GoogleGenAI({
      apiKey: apiKey
    });

    const model = (
      process.env.GEMINI_MODEL || 'gemini-2.5-flash'
    ).trim();

    const prompt = `
You are the AI Library Assistant for Bookwise.

Help users search the library catalog and receive reading recommendations.

LIBRARY CATALOG:
${JSON.stringify(catalog)}

RULES:
1. Answer the user's actual question directly.
2. Use the supplied catalog as the source of truth.
3. Recommend only books that appear in the catalog.
4. Use exact book titles and authors.
5. Include categories when available.
6. Available copies means copies currently available.
7. Never invent titles, authors, quantities, or availability.
8. If the catalog lacks requested information, say so.
9. Use friendly and clear English.
10. Keep answers concise.

USER QUESTION:
${message.trim()}
`;

    const response = await ai.models.generateContent({
      model,
      contents: prompt
    });

    const reply = response.text?.trim();

    if (!reply) {
      return res.status(502).json({
        message: 'Gemini returned an empty response. Please try again.'
      });
    }

    res.json({
      reply
    });

  } catch (error) {
    console.error('Gemini AI error:', {
      name: error.name,
      message: error.message,
      status: error.status || error.statusCode || null,
      code: error.code || null
    });

    const status = error.status || error.statusCode;

    if (status === 401 || status === 403) {
      return res.status(502).json({
        message: 'Gemini authentication failed. Check your server API key.'
      });
    }

    if (status === 429) {
      return res.status(503).json({
        message: 'Gemini request limit reached. Please try again later.'
      });
    }

    if (status === 404) {
      return res.status(502).json({
        message: 'The configured Gemini model is unavailable.'
      });
    }

    res.status(502).json({
      message: 'The AI assistant could not respond. Check the backend terminal.'
    });
  }
});

// ================================
// START SERVER
// ================================

async function startServer() {
  try {
    console.log('Connecting to MongoDB...');

    await connectDB();

    console.log('MongoDB connected successfully!');

    app.listen(PORT, '0.0.0.0', () => {
      console.log('===================================');
      console.log('BOOKWISE LIBRARY MANAGEMENT SYSTEM');
      console.log(`Server running on port ${PORT}`);
      console.log(`API URL: http://localhost:${PORT}`);
      console.log('MongoDB: Connected');
      console.log('===================================');
    });

  } catch (error) {
    console.error('===================================');
    console.error('MONGODB CONNECTION FAILED');
    console.error(error.message);
    console.error('Check your MongoDB URI and Atlas settings.');
    console.error('===================================');

    process.exit(1);
  }
}

startServer();
