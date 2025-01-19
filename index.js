import dotenv from 'dotenv';
import express, { query } from 'express';
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

// Collections
const userCollection = 'users';
const bookedParcelCollection = 'bookedParcel';

// increase or decrease booked parcel count and total spent by $inc
const updateBookedParcelCount = async (email, count, totalSpent, operation) => {
  const db = await connectDB(userCollection);
  const sign = operation === 'increase' ? 1 : -1;
  const updatedCount = count * sign;
  const updatedTotalSpent = totalSpent * sign;
  await db.updateOne(
    { email: email },
    {
      $inc: {
        bookedParcel: updatedCount,
        totalSpent: updatedTotalSpent,
      },
    }
  );
};

// Routes
// JWT Auth routes
app.post('/jwt/create', async (req, res) => {
  const email = req.body;
  const token = jwt.sign(email, process.env.JWT_SECRET, {
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
    if (err) {
      console.log(err);
      return res.status(401).send('Unauthorized');
    }
    req.decoded = decoded;
    next();
  });
};

// User routes
// Register new user
app.post('/users/:email', async (req, res) => {
  const email = req.params.email;
  const query = { email: email };
  const user = req.body;
  // Check if user exists
  const db = await connectDB(userCollection);
  const isUserExist = await db.findOne(query);
  if (isUserExist) return res.send({ message: 'User already exists' });
  // if user does not exist, create a new user
  console.log(user);
  const result = await db.insertOne({
    ...user,
    phone: 'not available',
    role: 'user',
    bookedParcel: 0,
    totalSpent: 0,
    createdAt: new Date(),
  });
  res.send(result);
});

// get user role by email
app.get('/users/role/:email', verifyToken, async (req, res) => {
  const tokenEmail = req.decoded.email;
  if (tokenEmail !== req.params.email) {
    return res.status(401).send('Unauthorized');
  }
  const email = req.params.email;
  const query = { email: email };
  const db = await connectDB(userCollection);
  const user = await db.findOne(query);
  if (!user) return res.status(404).send('User not found');
  res.send({ role: user.role });
});

// get all users
app.get('/users/all', verifyToken, async (req, res) => {
  const currentUserEmail = req.decoded.email;
  const query = { email: { $ne: currentUserEmail } };
  const db = await connectDB(userCollection);
  const result = await db.find(query).toArray();
  res.send(result);
});

// update user role by id
app.patch('/users/update/role/:id', verifyToken, async (req, res) => {
  const db = await connectDB(userCollection);
  const user = req.body;
  const query = { _id: new ObjectId(req.params.id) };
  const update = {
    $set: {
      role: user.role,
    },
  };
  const result = await db.updateOne(query, update);
  res.send(result);
});

// Book Parcel routes
// Book a parcel
app.post('/bookedParcel/add/:email', verifyToken, async (req, res) => {
  const email = req.decoded.email;
  if (email !== req.params.email) {
    return res.status(401).send('Unauthorized');
  }
  const parcel = req.body;
  updateBookedParcelCount(email, 1, parcel.price, 'increase');
  const db = await connectDB(bookedParcelCollection);
  const result = await db.insertOne({
    user: {
      email: parcel.email,
      name: parcel.name,
      phone: parcel.phoneNumber,
    },
    parcelDetails: {
      parcelType: parcel.parcelType,
      parcelWeight: parcel.parcelWeight,
    },
    receiverDetails: {
      name: parcel.receiverName,
      phone: parcel.receiverPhoneNumber,
      address: parcel.deliveryAddress,
      latitude: parcel.latitude,
      longitude: parcel.longitude,
    },
    price: parcel.price,
    status: 'pending',
    deliveryDate: parcel.deliveryDate,
    approximateDeliveryDate: 'processing',
    deliveryMenID: 'processing',
    bookedDate: new Date(),
  });
  res.send(result);
});

// Get all booked parcels
app.get('/bookedParcel/all', verifyToken, async (req, res) => {
  const db = await connectDB(bookedParcelCollection);
  const result = await db.find().toArray();
  res.send(result);
});

// Get booked parcel by id
app.get('/bookedParcel/:id', verifyToken, async (req, res) => {
  const db = await connectDB(bookedParcelCollection);
  const query = { _id: new ObjectId(req.params.id) };
  const result = await db.findOne(query);
  if (!result) return res.status(404).send('Parcel not found');
  res.send(result);
});

// Update booked parcel by id
app.patch('/bookedParcel/update/:id', verifyToken, async (req, res) => {
  const db = await connectDB(bookedParcelCollection);
  const parcel = req.body;
  const query = { _id: new ObjectId(req.params.id) };
  const update = {
    $set: {
      'user.phone': parcel.phoneNumber,
      'parcelDetails.parcelType': parcel.parcelType,
      'parcelDetails.parcelWeight': parcel.parcelWeight,
      'receiverDetails.name': parcel.receiverName,
      'receiverDetails.phone': parcel.receiverPhoneNumber,
      'receiverDetails.address': parcel.deliveryAddress,
      'receiverDetails.latitude': parcel.latitude,
      'receiverDetails.longitude': parcel.longitude,
      price: parcel.price,
      deliveryDate: parcel.deliveryDate,
    },
  };
  const result = await db.updateOne(query, update);
  res.send(result);
});

// Cancel booked parcel by id
app.patch('/bookedParcel/cancel/:id', verifyToken, async (req, res) => {
  const db = await connectDB(bookedParcelCollection);
  const query = { _id: new ObjectId(req.params.id) };
  const bookedParcel = await db.findOne(query);
  const email = bookedParcel.user.email;
  const price = bookedParcel.price;
  updateBookedParcelCount(email, 1, price, 'decrease');
  const update = {
    $set: {
      status: 'cancelled',
    },
  };
  const result = await db.updateOne(query, update);
  res.send(result);
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
