
// ========================================
// BOOKWISE DATABASE CONFIGURATION
// ========================================

const dns = require('dns');

dns.setServers([
  '1.1.1.1',
  '8.8.8.8'
]);

const path = require('path');

require('dotenv').config({
  path: path.join(__dirname, '.env'),
  override: true
});

const mongoose = require('mongoose');

// ========================================
// BOOK SCHEMA
// ========================================

const bookSchema = new mongoose.Schema({

  title: {
    type: String,
    required: true,
    trim: true
  },

  author: {
    type: String,
    required: true,
    trim: true
  },

  isbn: {
    type: String,
    trim: true,
    default: '',
    index: true
  },

  category: {
    type: String,
    trim: true,
    default: ''
  },

  publishedYear: {
    type: Number,
    default: null
  },

  quantity: {
    type: Number,
    required: true,
    default: 0,
    min: 0
  },

  availableCopies: {
    type: Number,
    required: true,
    default: 0,
    min: 0,
    validate: {
      validator: function (value) {
        return value <= this.quantity;
      },
      message: 'Available copies cannot exceed total quantity.'
    }
  }

}, {
  timestamps: true,
  versionKey: false
});

// ========================================
// BOOK MODEL
// ========================================

const Book =
  mongoose.models.Book ||
  mongoose.model('Book', bookSchema);

// ========================================
// CONNECT TO MONGODB
// ========================================

async function connectDB() {

  const uri = process.env.MONGODB_URI;

  if (!uri || !uri.trim()) {
    throw new Error(
      'MONGODB_URI is missing from backend/.env'
    );
  }

  let parsedUri;

  try {
    parsedUri = new URL(uri);
  } catch {
    throw new Error(
      'Invalid MongoDB connection string.'
    );
  }

  if (
    parsedUri.protocol !== 'mongodb:' &&
    parsedUri.protocol !== 'mongodb+srv:'
  ) {
    throw new Error(
      'Invalid MongoDB protocol.'
    );
  }

  console.log('Connecting to MongoDB...');
  console.log('MongoDB Host:', parsedUri.hostname);
  console.log('Database:', parsedUri.pathname);

  try {

    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 15000
    });

    console.log('MongoDB connected successfully!');
    console.log('Database:', mongoose.connection.name);

    return mongoose.connection;

  } catch (error) {

    console.error(
      'MongoDB connection failed:',
      error.message
    );

    throw error;
  }
}

// ========================================
// EXPORT
// ========================================

module.exports = {
  mongoose,
  Book,
  connectDB
};
