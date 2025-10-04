import mongoose from 'mongoose';

const connectDB = async () => {
  try {
    const mongoURI = process.env.MONGO_URI;

    if (!mongoURI) {
      throw new Error('MongoDB URI is not defined in environment variables');
    }

    // Connect with mongoose 7.x+ options
    await mongoose.connect(mongoURI);

    console.log('MongoDB connected successfully');
    return mongoose.connection;
  } catch (err) {
    console.error('MongoDB connection error:', err);

    // Don't exit process in development to allow for fixes
    if (process.env.NODE_ENV === 'production') {
      console.error('Exiting process due to MongoDB connection failure');
      process.exit(1);
    }
    // In development, just log the error and continue
    console.warn('Continuing process despite MongoDB connection failure');
  }
};

export default connectDB;