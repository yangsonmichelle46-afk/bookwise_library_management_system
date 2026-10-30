
// ========================================
// BOOKWISE DATABASE CONFIGURATION
// ========================================

// DNS configuration for MongoDB Atlas
const dns = require('dns');

dns.setServers([
  '1.1.1.1',
  '8.8.8.8'
]);

// ========================================
// LOAD ENVIRONMENT VARIABLES
// ========================================

const path = require('path');

require('dotenv').config({
  path: path.join(__dirname, '.env'),
  override: true
});

// ========================================
// IMPORT MONGOOSE
// ========================================

const mongoose = require('mongoose');

// ========================================
// BOOK SCHEMA
// ========================================

const bookSchema = new mongoose.Schema(
  {
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
        message:
          'Available copies cannot exceed total quantity.'
      }
    }
  },
  {
    timestamps: true,
    versionKey: false
  }
);

// ========================================
// CREATE BOOK MODEL
// ========================================

const Book =
  mongoose.models.Book ||
  mongoose.model('Book', bookSchema);

// ========================================
// CONNECT TO MONGODB ATLAS
// ========================================

async function connectDB() {
  const uri = process.env.MONGODB_URI;

  // Check if MongoDB URI exists
  if (!uri || !uri.trim()) {
    throw new Error(
      'MONGODB_URI is missing from backend/.env'
    );
  }

  let parsedUri;

  // Validate connection string
  try {
    parsedUri = new URL(uri);
  } catch (error) {
    throw new Error(
      'Invalid MongoDB connection string. Check your backend .env file.'
    );
  }

  // Validate MongoDB protocol
  if (
    parsedUri.protocol !== 'mongodb:' &&
    parsedUri.protocol !== 'mongodb+srv:'
  ) {
    throw new Error(
      'Invalid MongoDB protocol. Use mongodb:// or mongodb+srv://'
    );
  }

  // Safe connection diagnostics
  console.log('\n===================================');
  console.log('BOOKWISE MONGODB CONFIGURATION');
  console.log('===================================');

  console.log('Protocol:', parsedUri.protocol);
  console.log('Hostname:', parsedUri.hostname);
  console.log(
    'Database:',
    parsedUri.pathname || '(not specified)'
  );

  console.log('DNS Servers: 1.1.1.1, 8.8.8.8');
  console.log('Connecting to MongoDB...');

  // Prevent an invalid numeric hostname
  if (/^\d+$/.test(parsedUri.hostname)) {
    throw new Error(
      'Invalid MongoDB hostname. Copy the correct connection string from MongoDB Atlas.'
    );
  }

  // Connect to MongoDB
  try {
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 15000
    });

    console.log('\n===================================');
    console.log('MONGODB CONNECTED SUCCESSFULLY!');
    console.log('===================================');
    console.log(
      'Database:',
      mongoose.connection.name
    );
    console.log('Status: Connected');

    return mongoose.connection;

  } catch (error) {
    console.error('\n===================================');
    console.error('MONGODB CONNECTION FAILED');
    console.error('===================================');
    console.error('Error:', error.message);

    throw error;
  }
}

// ========================================
// EXPORT DATABASE FUNCTIONS
// ========================================

module.exports = {
  mongoose,
  Book,
  connectDB
};
