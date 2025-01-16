import dotenv from 'dotenv';
import { MongoClient, ServerApiVersion } from 'mongodb';

// Load environment variables
dotenv.config();

// MongoDB connection string
const uri = process.env.MONGODB_URI;

// Database Name
const dbName = process.env.MONGODB_DB;

let client;

const connectDB = async (dbCollection) => {
  if (!client) {
    client = new MongoClient(uri, {
      serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
      },
    });
  }
  return client.db(dbName).collection(dbCollection);
};

export default connectDB;
