
const { mongoose, Book, connectDB } = require('./db');

async function testConnection() {
  try {
    console.log('===================================');
    console.log('BOOKWISE DATABASE CONNECTION TEST');
    console.log('===================================');

    // Connect to MongoDB
    await connectDB();

    // Count existing books
    const count = await Book.countDocuments();

    console.log('\nDatabase test successful!');
    console.log('Total books:', count);

    // Display up to five books
    const books = await Book.find()
      .limit(5)
      .select('title author isbn category')
      .lean();

    if (books.length > 0) {
      console.log('\nBooks in your catalog:');

      console.table(
        books.map(book => ({
          title: book.title,
          author: book.author,
          isbn: book.isbn,
          category: book.category
        }))
      );
    } else {
      console.log('\nYour library catalog is currently empty.');
    }

    console.log('\nMongoDB test completed successfully!');

  } catch (error) {
    console.error('\nDATABASE TEST FAILED');
    console.error('Reason:', error.message);
    process.exitCode = 1;

  } finally {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  }
}

testConnection();
