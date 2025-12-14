const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
require('dotenv').config();
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB Connection
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.jrfrvrx.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();

    const db = client.db("lifeLessonsDB");
    const userCollection = db.collection("users");
    const lessonCollection = db.collection("lessons");
    // const paymentCollection = db.collection("payments"); // We will use this later

 // --- USERS API ---
    app.post('/users/:email', async (req, res) => {
      const email = req.params.email;
      const user = req.body;
      
      // LOG TO DEBUG
      console.log("1. Hit /users endpoint for:", email);
      console.log("2. Data received:", user);

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
    // --- LESSONS API (Public) ---
    // Get all public lessons (with Search & Filter logic later)
    app.get('/lessons', async (req, res) => {
        const query = { privacy: "Public" }; // Only show public lessons
        const result = await lessonCollection.find(query).toArray();
        res.send(result);
    });
    // GET Lessons (Handles both "All Public" and "My Lessons by Email")
    app.get('/lessons', async (req, res) => {
        const email = req.query.email;
        let query = {};
        
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
      const result = await lessonCollection.insertOne(lesson);
      res.send(result);
    });
    // GET Single Lesson by ID
    app.get('/lessons/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await lessonCollection.findOne(query);
      res.send(result);
    });
     // DELETE Lesson
    app.delete('/lessons/:id', async (req, res) => {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const result = await lessonCollection.deleteOne(query);
        res.send(result);
    });
     // --- PAYMENT API ---

    // 1. Create Payment Intent
    app.post('/create-payment-intent', async (req, res) => {
      const { price } = req.body;
      const amount = parseInt(price * 100); // Stripe calculates in cents/poisha
      
      const paymentIntent = await stripe.paymentIntents.create({
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
        
        // A. Save to payments collection
        const paymentResult = await client.db("lifeLessonsDB").collection("payments").insertOne(payment);

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

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});