import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import morgan from 'morgan';
import connectDB from './config/database.js';
import { ObjectId } from 'mongodb';

// Load environment variables
dotenv.config();

// Create express app
const app = express();

// Middleware
const allowedOrigins = process.env.FRONTEND_URLS.split(',');

app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(express.json());
app.use(morgan('dev'));

// Routes
// JWT Auth routes
app.post('/jwt/create', async (req, res) => {
  const { email } = req.body;
  const token = jwt.sign({ email }, process.env.JWT_SECRET, {
    expiresIn: '3h',
  });
  res.send({ token });
});

// JWT Verify middleware
const verifyToken = (req, res, next) => {
  const token = req.headers.authorization.split(' ')[1];
  if (!token) {
    return res.status(401).send('Unauthorized');
  }
  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if ((err, decoded)) {
      return res.status(401).send('Unauthorized');
    }
    req.user = decoded;
    next();
  });
};

// User routes
const userCollection = 'users';
// Register new user
app.post('/users/:email', async (req, res) => {
  const email = req.params.email;
  const query = { email: email };
  const user = req.body;
  // Check if user exists
  const db = await connectDB(userCollection);
  const isUserExist = await db.findOne(query);
  if (isUserExist) return res.send({ role: isUserExist.role });
  // if user does not exist, create a new user
  const result = await db.insertOne({
    ...user,
    role: 'customer',
    timestamp: new Date(),
  });
  const newUser = await db.findOne({ _id: new ObjectId(result.insertedId) });
  res.send({ role: newUser.role });
});

// Default route
app.get('/', (req, res) => {
  res.send('Welcome to the API - developed by github/amirulkanak');
});

//  Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server is online, address: http://localhost:${PORT}`);
});
