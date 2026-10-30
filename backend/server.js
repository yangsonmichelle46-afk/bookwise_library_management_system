// ========================================
// BOOKWISE LIBRARY MANAGEMENT SYSTEM
// BACKEND SERVER
// ========================================

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const { GoogleGenAI } = require('@google/genai');

const {
  Book,
  Admin,
  connectDB
} = require('./db');

const app = express();

const PORT = process.env.PORT || 5000;
const isProduction =
  process.env.NODE_ENV === 'production';

// ========================================
// CORS CONFIGURATION
// ========================================

const allowedOrigins = (
  process.env.FRONTEND_URL || ''
)
  .split(',')
  .map(origin => origin.trim().replace(/\/$/, ''))
  .filter(Boolean);

const localOrigins = [
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:5175',
  'http://localhost:5176',
  'http://localhost:5177',

  'http://127.0.0.1:5173',
  'http://127.0.0.1:5174',
  'http://127.0.0.1:5175',
  'http://127.0.0.1:5176',
  'http://127.0.0.1:5177'
];

app.use(cors({

  origin: (origin, callback) => {

    if (!origin) {
      return callback(null, true);
    }

    const normalizedOrigin =
      origin.replace(/\/$/, '');

    const isAllowed =
      allowedOrigins.includes(normalizedOrigin) ||
      (!isProduction &&
        localOrigins.includes(normalizedOrigin));

    if (isAllowed) {
      return callback(null, true);
    }

    return callback(
      new Error('Origin not allowed by CORS')
    );
  },

  credentials: true

}));

app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

// ========================================
// AUTHENTICATION CONFIGURATION
// ========================================

const COOKIE_NAME = 'bookwise_admin_session';

function getCookieOptions() {

  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'lax',
    path: '/',
    maxAge: 8 * 60 * 60 * 1000
  };
}

function createSession(res, admin) {

  const secret = process.env.SESSION_SECRET;

  if (!secret || secret.length < 32) {
    throw new Error(
      'SESSION_SECRET must contain at least 32 characters.'
    );
  }

  const token = jwt.sign(
    {
      sub: String(admin._id),
      role: 'admin'
    },
    secret,
    {
      expiresIn: '8h'
    }
  );

  res.cookie(
    COOKIE_NAME,
    token,
    getCookieOptions()
  );
}

// ========================================
// ADMIN AUTHENTICATION MIDDLEWARE
// ========================================

function requireAdmin(req, res, next) {

  const token = req.cookies?.[COOKIE_NAME];

  if (!token) {
    return res.status(401).json({
      message: 'Please log in as an administrator.'
    });
  }

  try {

    const decoded = jwt.verify(
      token,
      process.env.SESSION_SECRET
    );

    if (decoded.role !== 'admin') {
      return res.status(403).json({
        message: 'Administrator access required.'
      });
    }

    req.adminId = decoded.sub;

    next();

  } catch (error) {

    res.clearCookie(
      COOKIE_NAME,
      getCookieOptions()
    );

    return res.status(401).json({
      message: 'Your session has expired. Please log in again.'
    });
  }
}

// ========================================
// BOOK HELPER FUNCTIONS
// ========================================

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
    body.availableCopies ??
    (isUpdate ? NaN : quantity)
  );

  const year =
    publishedYear === '' || publishedYear == null
      ? null
      : Number(publishedYear);

  if (
    typeof title !== 'string' ||
    !title.trim()
  ) {
    return {
      error: 'Book title is required.'
    };
  }

  if (
    typeof author !== 'string' ||
    !author.trim()
  ) {
    return {
      error: 'Book author is required.'
    };
  }

  if (
    !Number.isFinite(quantity) ||
    quantity < 0
  ) {
    return {
      error: 'Quantity must be a valid non-negative number.'
    };
  }

  if (
    !Number.isFinite(availableCopies) ||
    availableCopies < 0 ||
    availableCopies > quantity
  ) {
    return {
      error: 'Available copies must be between zero and total quantity.'
    };
  }

  if (
    year !== null &&
    (!Number.isInteger(year) || year < 0)
  ) {
    return {
      error: 'Published year must be a valid whole number.'
    };
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

// ========================================
// PUBLIC HEALTH ROUTES
// ========================================

app.get('/', (req, res) => {

  const connected =
    mongoose.connection.readyState === 1;

  res.status(connected ? 200 : 503).json({

    message: 'Bookwise Library Management System API',

    database: connected
      ? 'connected'
      : 'disconnected'

  });
});

app.get('/health', (req, res) => {

  res.json({

    status: 'OK',

    message: 'Bookwise backend is running.',

    database:
      mongoose.connection.readyState === 1
        ? 'connected'
        : 'disconnected'

  });
});

// ========================================
// CREATE FIRST ADMINISTRATOR
// ONE-TIME SETUP
// ========================================

app.post('/api/auth/setup', async (req, res) => {

  try {

    const setupKey = process.env.ADMIN_SETUP_KEY;

    if (!setupKey) {
      return res.status(404).json({
        message: 'Administrator setup is disabled.'
      });
    }

    if (await Admin.exists({})) {
      return res.status(409).json({
        message: 'An administrator already exists. Setup is closed.'
      });
    }

    const {
      email,
      password,
      setupKey: submittedKey
    } = req.body || {};

    if (
      typeof submittedKey !== 'string' ||
      submittedKey !== setupKey
    ) {
      return res.status(403).json({
        message: 'Invalid setup key.'
      });
    }

    if (
      typeof email !== 'string' ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
    ) {
      return res.status(400).json({
        message: 'Enter a valid email address.'
      });
    }

    if (
      typeof password !== 'string' ||
      password.length < 12 ||
      password.length > 128
    ) {
      return res.status(400).json({
        message: 'Password must be 12–128 characters.'
      });
    }

    const passwordHash = await bcrypt.hash(
      password,
      12
    );

    const admin = await Admin.create({

      email: email.trim().toLowerCase(),

      passwordHash

    });

    createSession(res, admin);

    res.status(201).json({

      message: 'Administrator account created.',

      admin: {
        email: admin.email
      }

    });

  } catch (error) {

    console.error(
      'Admin setup error:',
      error.message
    );

    res.status(500).json({
      message: 'Could not complete administrator setup.'
    });
  }
});

// ========================================
// ADMIN LOGIN
// ========================================

app.post('/api/auth/login', async (req, res) => {

  try {

    const { email, password } = req.body || {};

    if (
      typeof email !== 'string' ||
      typeof password !== 'string'
    ) {
      return res.status(400).json({
        message: 'Email and password are required.'
      });
    }

    const admin = await Admin.findOne({

      email: email.trim().toLowerCase()

    }).select('+passwordHash');

    if (
      !admin ||
      !(await bcrypt.compare(
        password,
        admin.passwordHash
      ))
    ) {
      return res.status(401).json({
        message: 'Incorrect email or password.'
      });
    }

    createSession(res, admin);

    res.json({

      message: 'Login successful.',

      admin: {
        email: admin.email
      }

    });

  } catch (error) {

    console.error('Login error:', error.message);

    res.status(500).json({
      message: 'Unable to log in right now.'
    });
  }
});

// ========================================
// CHECK ADMIN SESSION
// ========================================

app.get('/api/auth/me', requireAdmin, async (req, res) => {

  try {

    const admin = await Admin.findById(
      req.adminId
    ).select('email').lean();

    if (!admin) {
      return res.status(401).json({
        message: 'Administrator account not found.'
      });
    }

    res.json({
      admin: {
        email: admin.email
      }
    });

  } catch (error) {

    res.status(500).json({
      message: 'Unable to verify administrator session.'
    });
  }
});

// ========================================
// ADMIN LOGOUT
// ========================================

app.post('/api/auth/logout', (req, res) => {

  res.clearCookie(
    COOKIE_NAME,
    getCookieOptions()
  );

  res.json({
    message: 'Logged out successfully.'
  });
});

// ========================================
// PROTECT BOOK AND AI ROUTES
// ========================================

app.use('/api/books', requireAdmin);
app.use('/api/ai', requireAdmin);

// ========================================
// GET ALL BOOKS / SEARCH BOOKS
// ========================================

app.get('/api/books', async (req, res) => {

  try {

    const search = String(
      req.query.search || ''
    ).trim();

    const escapedSearch = search.replace(
      /[.*+?^${}()|[\]\\]/g,
      '\\$&'
    );

    const filter = search
      ? {
          $or: [
            { title: { $regex: escapedSearch, $options: 'i' } },
            { author: { $regex: escapedSearch, $options: 'i' } },
            { isbn: { $regex: escapedSearch, $options: 'i' } },
            { category: { $regex: escapedSearch, $options: 'i' } }
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

// ========================================
// GET ONE BOOK
// ========================================

app.get('/api/books/:id', async (req, res) => {

  try {

    if (!isValidBookId(req.params.id)) {
      return res.status(400).json({
        message: 'Invalid book ID.'
      });
    }

    const book = await Book.findById(
      req.params.id
    ).lean();

    if (!book) {
      return res.status(404).json({
        message: 'Book not found.'
      });
    }

    res.json({
      data: normalizeBook(book)
    });

  } catch (error) {

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

// ========================================
// UPDATE BOOK
// ========================================

app.put('/api/books/:id', async (req, res) => {

  try {

    if (!isValidBookId(req.params.id)) {
      return res.status(400).json({
        message: 'Invalid book ID.'
      });
    }

    const result = validateBookInput(
      req.body,
      true
    );

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
      message: 'Could not update the book.'
    });
  }
});

// ========================================
// DELETE BOOK
// ========================================

app.delete('/api/books/:id', async (req, res) => {

  try {

    if (!isValidBookId(req.params.id)) {
      return res.status(400).json({
        message: 'Invalid book ID.'
      });
    }

    const book = await Book.findByIdAndDelete(
      req.params.id
    );

    if (!book) {
      return res.status(404).json({
        message: 'Book not found.'
      });
    }

    res.json({
      message: 'Book deleted successfully.'
    });

  } catch (error) {

    res.status(500).json({
      message: 'Failed to delete the book.'
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

    if (!apiKey) {
      return res.status(503).json({
        message: 'Gemini API key is not configured.'
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
      apiKey
    });

    const model =
      process.env.GEMINI_MODEL ||
      'gemini-2.5-flash';

    const prompt = `
You are the AI Library Assistant for Bookwise.

Help users search the library catalog and receive reading recommendations.

LIBRARY CATALOG:
${JSON.stringify(catalog)}

RULES:
1. Answer the user's question directly.
2. Use the supplied catalog as the source of truth.
3. Recommend only books in the catalog.
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
        message: 'Gemini returned an empty response.'
      });
    }

    res.json({
      reply
    });

  } catch (error) {

    console.error('Gemini AI error:', error.message);

    const status =
      error.status || error.statusCode;

    if (status === 401 || status === 403) {
      return res.status(502).json({
        message: 'Gemini authentication failed. Check your API key.'
      });
    }

    if (status === 429) {
      return res.status(503).json({
        message: 'Gemini request limit reached. Try again later.'
      });
    }

    res.status(502).json({
      message: 'The AI assistant could not respond.'
    });
  }
});

// ========================================
// START SERVER
// ========================================

async function startServer() {

  try {

    if (
      !process.env.SESSION_SECRET ||
      process.env.SESSION_SECRET.length < 32
    ) {
      throw new Error(
        'SESSION_SECRET must be at least 32 characters.'
      );
    }

    console.log('Connecting to MongoDB...');

    await connectDB();

    app.listen(PORT, '0.0.0.0', () => {

      console.log('===================================');
      console.log('BOOKWISE LIBRARY MANAGEMENT SYSTEM');
      console.log(`Server running on port ${PORT}`);
      console.log('MongoDB: Connected');
      console.log('===================================');

    });

  } catch (error) {

    console.error(
      'Backend startup failed:',
      error.message
    );

    process.exit(1);
  }
}

startServer();