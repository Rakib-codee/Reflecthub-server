const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
require('dotenv').config();
const Stripe = require("stripe");
let stripe;

function getStripe() {
  if (!stripe) {
    if (!process.env.STRIPE_SECRET_KEY) {
      throw new Error('Missing STRIPE_SECRET_KEY');
    }
    stripe = Stripe(process.env.STRIPE_SECRET_KEY);
  }
  return stripe;
}

const app = express();
const port = process.env.PORT || 3000;

// Middleware
const allowedOrigins = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (allowedOrigins.length === 0) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};

app.use(cors(corsOptions));
app.options(/.*/, cors(corsOptions));
app.use(express.json());

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// MongoDB Connection
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.jrfrvrx.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
let _mongoClientPromise;
function getMongoClientPromise() {
  if (_mongoClientPromise) return _mongoClientPromise;

  const client = new MongoClient(uri, {
    serverApi: {
      version: ServerApiVersion.v1,
      strict: true,
      deprecationErrors: true,
    }
  });

  _mongoClientPromise = client.connect()
    .then(() => client)
    .catch((err) => {
      _mongoClientPromise = undefined;
      throw err;
    });
  return _mongoClientPromise;
}

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();

    const getDb = async () => {
      const client = await getMongoClientPromise();
      return client.db("lifeLessonsDB");
    };

    const getUserCollection = async () => {
      const db = await getDb();
      return db.collection("users");
    };

    const getLessonCollection = async () => {
      const db = await getDb();
      return db.collection("lessons");
    };

 // --- USERS API ---
    app.post('/users/:email', async (req, res) => {
      const email = req.params.email;
      const user = req.body;
      
      // LOG TO DEBUG
      console.log("1. Hit /users endpoint for:", email);
      console.log("2. Data received:", user);

      const userCollection = await getUserCollection();

      const query = { email: email };
      
      // Check if user already exists
      const existingUser = await userCollection.findOne(query);
      if (existingUser) {
        console.log("3. User already exists, checking if we need to update...");
        return res.send({ message: 'User already exists', insertedId: null });
      }

      const result = await userCollection.insertOne(user);
      console.log("4. User inserted successfully:", result);
      res.send(result);
    });
        // DELETE USER API
    app.delete('/users/:id', async (req, res) => {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const userCollection = await getUserCollection();
        const result = await userCollection.deleteOne(query);
        res.send(result);
    });
    // UPDATE USER PROFILE API (Name & Photo)
    app.patch('/user-update/:email', async (req, res) => {
        const email = req.params.email;
        const filter = { email: email };
        const userCollection = await getUserCollection();
        const updatedDoc = {
            $set: {
                name: req.body.name,
                photoURL: req.body.photoURL
            }
        }
        const result = await userCollection.updateOne(filter, updatedDoc);
        res.send(result);
    });

    // CHECK ADMIN STATUS
    app.get('/users/admin/:email', async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const userCollection = await getUserCollection();
      const user = await userCollection.findOne(query);
      let admin = false;
      if (user) {
        admin = user?.role === 'admin';
      }
      res.send({ admin });
    });

    // GET ALL USERS (For Admin Dashboard)
    app.get('/users', async (req, res) => {
        const userCollection = await getUserCollection();
        const result = await userCollection.find().toArray();
        res.send(result);
    });
    // ADMIN STATS API
    app.get('/admin-stats', async (req, res) => {
        const userCollection = await getUserCollection();
        const lessonCollection = await getLessonCollection();
        const users = await userCollection.estimatedDocumentCount();
        const lessons = await lessonCollection.estimatedDocumentCount();
        
        // Count Premium Users
        const premiumUsers = await userCollection.countDocuments({ isPremium: true });

        // (Optional) Calculate Total Revenue (Premium Users * 1500)
        const revenue = premiumUsers * 1500;

        res.send({
            users,
            lessons,
            premiumUsers,
            revenue
        });
    });

    // MAKE ADMIN API
    app.patch('/users/admin/:id', async (req, res) => {
        const id = req.params.id;
        const filter = { _id: new ObjectId(id) };
        const userCollection = await getUserCollection();
        const updatedDoc = {
            $set: {
                role: 'admin'
            }
        }
        const result = await userCollection.updateOne(filter, updatedDoc);
        res.send(result);
    });
    // --- LESSONS API (Public) ---
    // Get all public lessons (with Search & Filter logic later)
    // GET Lessons (Handles both "All Public" and "My Lessons by Email")
    app.get('/lessons', async (req, res) => {
        const email = req.query.email;
        let query = {};

        const lessonCollection = await getLessonCollection();
        
        if (email) {
            // If email is provided, get lessons for that specific user (Dashboard)
            query = { 'author.email': email };
        } else {
            // If no email, get only PUBLIC lessons (Home/Explore page)
            query = { privacy: "Public" };
        }
        
        const result = await lessonCollection.find(query).toArray();
        res.send(result);
    });
// --- LESSONS API ---
    // 1. Post a new lesson
    app.post('/lessons', async (req, res) => {
      const lesson = req.body;
      const lessonCollection = await getLessonCollection();
      const result = await lessonCollection.insertOne(lesson);
      res.send(result);
    });
    // GET Single Lesson by ID
    app.get('/lessons/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const lessonCollection = await getLessonCollection();
      const result = await lessonCollection.findOne(query);
      res.send(result);
    });
     // DELETE Lesson
    app.delete('/lessons/:id', async (req, res) => {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const lessonCollection = await getLessonCollection();
        const result = await lessonCollection.deleteOne(query);
        res.send(result);
    });
     // UPDATE LESSON API
    app.put('/lessons/:id', async (req, res) => {
        const id = req.params.id;
        const filter = { _id: new ObjectId(id) };
        const updatedLesson = req.body;
        const lessonCollection = await getLessonCollection();
        const lesson = {
            $set: {
                title: updatedLesson.title,
                description: updatedLesson.description,
                category: updatedLesson.category,
                tone: updatedLesson.tone,
                photoURL: updatedLesson.photoURL,
                privacy: updatedLesson.privacy,
                access: updatedLesson.access
            }
        }
        const result = await lessonCollection.updateOne(filter, lesson);
        res.send(result);
    });
    // GET Single User by Email (To check admin/premium status)
    app.get('/users/:email', async (req, res) => {
        const email = req.params.email;
        const query = { email: email };
        const userCollection = await getUserCollection();
        const user = await userCollection.findOne(query);
        res.send(user);
    });
     // --- PAYMENT API ---

    // 1. Create Payment Intent
    app.post('/create-payment-intent', async (req, res) => {
      const { price } = req.body;
      const amount = parseInt(price * 100); // Stripe calculates in cents/poisha
      
      const paymentIntent = await getStripe().paymentIntents.create({
        amount: amount,
        currency: 'bdt', // or 'usd'
        payment_method_types: ['card']
      });

      res.send({
        clientSecret: paymentIntent.client_secret
      });
    });

    // 2. Save Payment & Upgrade User
    app.post('/payments', async (req, res) => {
        const payment = req.body;

        const db = await getDb();
        const userCollection = await getUserCollection();
        
        // A. Save to payments collection
        const paymentResult = await db.collection("payments").insertOne(payment);

        // B. Update User Status to Premium
        const query = { email: payment.email };
        const updatedDoc = {
            $set: {
                isPremium: true
            }
        }
        const userResult = await userCollection.updateOne(query, updatedDoc);

        res.send({ paymentResult, userResult });
    });
    // Send a ping to confirm a successful connection
    const client = await getMongoClientPromise();
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get('/', (req, res) => {
    res.send('Digital Life Lessons Server is Running');
});

app.use((req, res) => {
    res.status(404).json({ message: 'Not Found' });
});

app.use((err, req, res, next) => {
    console.error(err);
    if (err && err.message === 'Not allowed by CORS') {
        return res.status(403).json({ message: 'CORS Forbidden' });
    }
    res.status(500).json({ message: 'Internal Server Error' });
});

if (require.main === module) {
  app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
  });
}

module.exports = app;