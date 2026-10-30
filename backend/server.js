
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const { GoogleGenAI } = require('@google/genai');
const { Book, connectDB } = require('./db');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json({ limit: '1mb' }));

// ========================================
// BOOK HELPER FUNCTIONS
// ========================================

function normalizeBook(book) {
  if (!book) return null;

  const obj =
    typeof book.toObject === 'function'
      ? book.toObject()
      : book;

  return {
    id: String(obj._id || obj.id),
    _id: String(obj._id || obj.id),
    title: obj.title,
    author: obj.author,
    isbn: obj.isbn || '',
    category: obj.category || '',
    publishedYear: obj.publishedYear ?? null,
    quantity: obj.quantity ?? 0,
    availableCopies: obj.availableCopies ?? 0
  };
}

function validObjectId(id) {
  const { mongoose } = require('./db');
  return mongoose.isValidObjectId(id);
}

// ========================================
// HOME / DATABASE STATUS
// ========================================

app.get('/', async (req, res) => {
  try {
    const { mongoose } = require('./db');

    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({
        message: 'MongoDB is not connected.',
        database: 'disconnected'
      });
    }

    res.json({
      message: 'Library Management System API is running.',
      database: 'connected'
    });

  } catch (error) {
    console.error('Database status error:', error.message);

    res.status(500).json({
      message: 'Could not check database connection.'
    });
  }
});

// ========================================
// GET ALL BOOKS / SEARCH BOOKS
// ========================================

app.get('/api/books', async (req, res) => {
  try {
    const search = String(req.query.search || '').trim();

    const filter = search ? {
      $or: [
        {
          title: {
            $regex: search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
            $options: 'i'
          }
        },
        {
          author: {
            $regex: search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
            $options: 'i'
          }
        },
        {
          isbn: {
            $regex: search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
            $options: 'i'
          }
        },
        {
          category: {
            $regex: search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
            $options: 'i'
          }
        }
      ]
    } : {};

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

// ========================================
// GET ONE BOOK
// ========================================

app.get('/api/books/:id', async (req, res) => {
  try {
    if (!validObjectId(req.params.id)) {
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

// ========================================
// ADD NEW BOOK
// ========================================

app.post('/api/books', async (req, res) => {
  try {
    const {
      title,
      author,
      isbn = '',
      category = '',
      publishedYear = null,
      quantity = 0,
      availableCopies
    } = req.body || {};

    if (
      typeof title !== 'string' ||
      !title.trim() ||
      typeof author !== 'string' ||
      !author.trim()
    ) {
      return res.status(400).json({
        message: 'Title and author are required.'
      });
    }

    const qty = Number(quantity);
    const available = Number(availableCopies ?? quantity);

    const year =
      publishedYear === '' || publishedYear == null
        ? null
        : Number(publishedYear);

    if (
      !Number.isFinite(qty) ||
      qty < 0 ||
      !Number.isFinite(available) ||
      available < 0 ||
      (year !== null && !Number.isFinite(year))
    ) {
      return res.status(400).json({
        message: 'Quantity, available copies, and published year must be valid numbers.'
      });
    }

    const book = await Book.create({
      title: title.trim(),
      author: author.trim(),
      isbn: String(isbn || '').trim(),
      category: String(category || '').trim(),
      publishedYear: year,
      quantity: qty,
      availableCopies: available
    });

    res.status(201).json({
      data: normalizeBook(book)
    });

  } catch (error) {
    console.error('Add book error:', error.message);

    res.status(400).json({
      message: 'Could not add book. Check the submitted values.'
    });
  }
});

// ========================================
// UPDATE BOOK
// ========================================

app.put('/api/books/:id', async (req, res) => {
  try {
    if (!validObjectId(req.params.id)) {
      return res.status(400).json({
        message: 'Invalid book ID.'
      });
    }

    const {
      title,
      author,
      isbn = '',
      category = '',
      publishedYear = null,
      quantity,
      availableCopies
    } = req.body || {};

    if (
      typeof title !== 'string' ||
      !title.trim() ||
      typeof author !== 'string' ||
      !author.trim() ||
      quantity == null ||
      availableCopies == null
    ) {
      return res.status(400).json({
        message: 'Title, author, quantity, and availableCopies are required.'
      });
    }

    const qty = Number(quantity);
    const available = Number(availableCopies);

    const year =
      publishedYear === '' || publishedYear == null
        ? null
        : Number(publishedYear);

    if (
      !Number.isFinite(qty) ||
      qty < 0 ||
      !Number.isFinite(available) ||
      available < 0 ||
      (year !== null && !Number.isFinite(year))
    ) {
      return res.status(400).json({
        message: 'Quantity, available copies, and published year must be valid numbers.'
      });
    }

    const book = await Book.findByIdAndUpdate(
      req.params.id,
      {
        title: title.trim(),
        author: author.trim(),
        isbn: String(isbn || '').trim(),
        category: String(category || '').trim(),
        publishedYear: year,
        quantity: qty,
        availableCopies: available
      },
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
      data: normalizeBook(book)
    });

  } catch (error) {
    console.error('Update book error:', error.message);

    res.status(400).json({
      message: 'Could not update book. Check the submitted values.'
    });
  }
});

// ========================================
// DELETE BOOK
// ========================================

app.delete('/api/books/:id', async (req, res) => {
  try {
    if (!validObjectId(req.params.id)) {
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
      message: 'Failed to delete book.'
    });
  }
});

// ========================================
// GEMINI AI LIBRARY ASSISTANT
// ========================================

app.post('/api/ai/chat', async (req, res) => {
  try {
    const message = req.body?.message;

    if (
      typeof message !== 'string' ||
      !message.trim()
    ) {
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

    if (!catalog.length) {
      return res.json({
        reply: 'There are currently no books in the library catalog.'
      });
    }

    const ai = new GoogleGenAI({ apiKey });

    const model = (
      process.env.GEMINI_MODEL || 'gemini-2.5-flash'
    ).trim();

    const prompt = `
You are the AI Library Assistant for a Library Management System.

Help users search the catalog and receive reading recommendations.

LIBRARY CATALOG:
${JSON.stringify(catalog)}

RULES:
1. Answer the user's actual question directly.
2. Use the supplied catalog as the source of truth.
3. Recommend only books that appear in the catalog.
4. Use exact book titles and authors.
5. Include categories when available.
6. availableCopies means copies currently available.
7. Never invent titles, authors, quantities, or availability.
8. If the catalog lacks requested information, say so.
9. Use friendly, clear English.
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

    res.json({ reply });

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
        message: 'Gemini authentication failed. Check your server API key and API access.'
      });
    }

    if (status === 429) {
      return res.status(503).json({
        message: 'Gemini request quota or rate limit reached. Check your API usage and try again later.'
      });
    }

    if (status === 404) {
      return res.status(502).json({
        message: 'The configured Gemini model was not found or is unavailable to this API key.'
      });
    }

    res.status(502).json({
      message: 'The AI assistant could not respond. Check the backend terminal for the Gemini AI error.'
    });
  }
});

// ========================================
// START SERVER
// ========================================

async function startServer() {
  try {
    await connectDB();

    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Library API is running on port ${PORT}`);
    });

  } catch (error) {
    console.error('Failed to connect to MongoDB:', error.message);
    process.exit(1);
  }
}

startServer();
