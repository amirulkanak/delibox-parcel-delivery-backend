import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import jwt from 'jsonwebtoken';
import { ObjectId } from 'mongodb';
// import morgan from 'morgan';
import connectDB from './config/database.js';

// Load environment variables
dotenv.config();

// Create express app
const app = express();

// Middleware
const allowedOrigins = process.env.FRONTEND_URLS.split(',');

app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(express.json());
// app.use(morgan('dev'));

// Collections
const userCollection = 'users';
const bookedParcelCollection = 'bookedParcel';
const reviewCollection = 'reviews';

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
  // Check if user exists
  const db = await connectDB(userCollection);
  const isUserExist = await db.findOne(query);
  if (isUserExist) return res.send({ message: 'User already exists' });
  // if user does not exist, create a new user
  const user = req.body;
  if (user.role === 'user') {
    const result = await db.insertOne({
      ...user,
      phone: 'not available',
      role: 'user',
      bookedParcel: 0,
      totalSpent: 0,
      createdAt: new Date(),
    });
    return res.send(result);
  }
  if (user.role === 'deliveryMan') {
    const result = await db.insertOne({
      ...user,
      phone: 'not available',
      role: 'deliveryMan',
      deliveredParcel: 0,
      averageReview: 0,
      createdAt: new Date(),
    });
    return res.send(result);
  }
});

// update user photo by email
app.patch('/users/update/photo/:email', verifyToken, async (req, res) => {
  const email = req.decoded.email;
  if (email !== req.params.email) {
    return res.status(401).send('Unauthorized');
  }
  const db = await connectDB(userCollection);
  const query = { email: email };
  const update = {
    $set: {
      photo: req.body.photo,
    },
  };
  const result = await db.updateOne(query, update);
  res.send(result);
});

// get user role by email
app.get('/users/role/:email', async (req, res) => {
  const email = req.params.email;
  const query = { email: email };
  const db = await connectDB(userCollection);
  const user = await db.findOne(query);
  res.send({ userId: user._id, role: user.role });
});

// get all users data with role user
app.get('/users/user/all', verifyToken, async (req, res) => {
  const query = { role: 'user' };
  const db = await connectDB(userCollection);
  const result = await db.find(query).toArray();
  res.send(result);
});

// get all users data with role deliveryMan
app.get('/users/delivery-man/all', verifyToken, async (req, res) => {
  const query = { role: 'deliveryMan' };
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
      averageReview: 0,
      deliveredParcel: 0,
    },
  };
  const result = await db.updateOne(query, update);
  res.send(result);
});

// get all user field data with role deliveryMan
app.get('/users/deliveryMan', verifyToken, async (req, res) => {
  const db = await connectDB(userCollection);
  const query = { role: 'deliveryMan' };
  const field = { _id: 1, name: 1 };
  const result = await db.find(query).project(field).toArray();
  res.send(result);
});

// get top 3 deliveryMan
app.get('/users/top-delivery-man', async (req, res) => {
  const db = await connectDB(userCollection);
  const pipeline = [
    {
      $match: {
        role: 'deliveryMan',
      },
    },
    {
      $project: {
        name: 1,
        photo: 1,
        averageReview: 1,
        deliveredParcel: 1,
      },
    },
    {
      $sort: {
        deliveredParcel: -1,
      },
    },
    {
      $limit: 3,
    },
  ];
  const result = await db.aggregate(pipeline).toArray();
  res.send(result);
});

// Book Parcel routes
// get total
app.get('/user-parcel/total', async (req, res) => {
  const db = await connectDB(bookedParcelCollection);
  const totalBookedParcel = await db.countDocuments();
  const totalDeliveredParcel = await db.countDocuments({ status: 'delivered' });
  const userDB = await connectDB(userCollection);
  const totalUser = await userDB.countDocuments();
  const result = {
    totalBookedParcel,
    totalDeliveredParcel,
    totalUser,
  };
  res.send(result);
});
// Book a parcel
app.post('/bookedParcel/add/:email', verifyToken, async (req, res) => {
  const email = req.decoded.email;
  if (email !== req.params.email) {
    return res.status(401).send('Unauthorized');
  }
  const parcel = req.body;
  // update booked parcel count and total spent
  updateBookedParcelCount(email, 1, parcel.price, 'increase');
  // update user phone number
  const userDB = await connectDB(userCollection);
  await userDB.updateOne(
    { email: email },
    { $set: { phone: parcel.phoneNumber } }
  );
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
    deliveryDate: new Date(parcel.deliveryDate),
    approximateDeliveryDate: 'processing',
    deliveryMenID: 'processing',
    bookedDate: new Date(),
  });
  res.send(result);
});

// Get all booked parcels by user email
app.get('/bookedParcel/user-parcels', verifyToken, async (req, res) => {
  const email = req.decoded.email;
  const db = await connectDB(bookedParcelCollection);
  const query = { 'user.email': email };
  const result = await db.find(query).toArray();
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

// update booked parcel status,deliveryMenID, approximateDeliveryDate by id
app.patch('/bookedParcel/assign/:id', verifyToken, async (req, res) => {
  const db = await connectDB(bookedParcelCollection);
  const parcel = req.body;
  const query = { _id: new ObjectId(req.params.id) };
  const update = {
    $set: {
      status: parcel.status,
      deliveryMenID: parcel.deliveryManID,
      approximateDeliveryDate: new Date(parcel.approximateDeliveryDate),
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

// deliver booked parcel by id
app.patch('/bookedParcel/deliver/:id', verifyToken, async (req, res) => {
  const deliveryManID = req.body.userId;
  const userDB = await connectDB(userCollection);
  await userDB.updateOne(
    { _id: new ObjectId(deliveryManID) },
    { $inc: { deliveredParcel: 1 } }
  );
  const db = await connectDB(bookedParcelCollection);
  const query = { _id: new ObjectId(req.params.id) };
  const update = {
    $set: {
      status: 'delivered',
    },
  };
  const result = await db.updateOne(query, update);
  res.send(result);
});

// get selected parcel field from all parcels
app.get('/bookedParcel/admin/all', verifyToken, async (req, res) => {
  const db = await connectDB(bookedParcelCollection);
  const field = {
    _id: 1,
    'user.name': 1,
    'user.phone': 1,
    bookedDate: 1,
    deliveryDate: 1,
    price: 1,
    status: 1,
  };
  const result = await db.find().project(field).toArray();
  res.send(result);
});

// get all booked parcels by deliveryManID
app.get('/bookedParcel/deliveryMan/:id', verifyToken, async (req, res) => {
  const db = await connectDB(bookedParcelCollection);
  const query = { deliveryMenID: req.params.id };
  const result = await db.find(query).toArray();
  res.send(result);
});

// get date wise total booked parcel
app.get('/bookedParcel/admin/date-wise', verifyToken, async (req, res) => {
  const db = await connectDB(bookedParcelCollection);
  const pipeline = [
    {
      $group: {
        _id: {
          $dateToString: {
            format: '%d-%m-%Y',
            date: '$bookedDate',
          },
        },
        bookedParcel: {
          $sum: 1,
        },
      },
    },
    {
      $project: {
        _id: 0,
        date: '$_id',
        bookedParcel: 1,
      },
    },
    {
      $sort: {
        date: 1,
      },
    },
  ];
  const result = await db.aggregate(pipeline).toArray();
  res.send(result);
});

// Review routes
// Add review
app.post('/review/add', verifyToken, async (req, res) => {
  const db = await connectDB(reviewCollection);
  const review = req.body;
  const result = await db.insertOne({
    ...review,
    createdAt: new Date(),
  });
  // update deliveryMan average review
  const deliveryManID = review.deliveryManId;
  const userDB = await connectDB(userCollection);
  const pipeline = [
    {
      $match: {
        deliveryManId: deliveryManID,
      },
    },
    {
      $group: {
        _id: null,
        averageRating: {
          $avg: '$rating',
        },
      },
    },
    {
      $project: {
        _id: 0,
        averageRating: {
          $round: ['$averageRating', 1],
        },
      },
    },
  ];
  const averageRating = await db.aggregate(pipeline).toArray();
  await userDB.updateOne(
    { _id: new ObjectId(deliveryManID) },
    { $set: { averageReview: averageRating[0].averageRating } }
  );
  res.send(result);
});

// Get all reviews by deliveryManId
app.get('/reviews/deliveryMan/:id', verifyToken, async (req, res) => {
  const db = await connectDB(reviewCollection);
  const query = { deliveryManId: req.params.id };
  const result = await db.find(query).toArray();
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
