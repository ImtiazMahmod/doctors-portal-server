const express = require("express");
const cors = require("cors");
const { MongoClient } = require("mongodb");
require("dotenv").config();
const { initializeApp } = require("firebase-admin/app");
const stripe = require("stripe")(process.env.STRIPE_SECRETE);
const ObjectId = require("mongodb").ObjectId;
const fileUpload = require("express-fileupload");

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());
app.use(fileUpload());

///firebase admin

const admin = require("firebase-admin");

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

///verify token
async function verifyToken(req, res, next) {
  if (req.headers.authorization.startsWith("Bearer ")) {
    const idToken = req.headers.authorization.split(" ")[1];

    try {
      const decodedUser = await admin.auth().verifyIdToken(idToken);
      console.log("decodedUser", idToken);
      req.decodedUserEmail = decodedUser?.email;
    } catch {
      console.log("got error");
    }
  }
  next();
}

//database
const uri = `mongodb+srv://${process.env.DOCRTORS_USER}:${process.env.DOCRTORS_PASS}@cluster0.zbwte.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`;

const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

async function run() {
  try {
    await client.connect();
    const database = client.db("doctors-portal");

    const appointmentCollection = database.collection("appointment");

    const usersCollection = database.collection("users");
    const doctorsCollection = database.collection("doctors");

    ///appointment post
    app.post("/appointments", async (req, res) => {
      const appointment = req.body;
      const result = await appointmentCollection.insertOne(appointment);
      res.json(result);
    });
    ///doctors post
    app.post("/doctors", async (req, res) => {
      const name = req.body.name;
      const email = req.body.email;
      const pic = req.files.image;
      const picData = pic.data;
      const encodedPic = picData.toString("base64");
      const imageBuffer = Buffer.from(encodedPic, "base64");

      const doctor = {
        name,
        email,
        image: imageBuffer,
      };

      const result = await doctorsCollection.insertOne(doctor);
      res.json(result);
    });

    ///load doctors
    app.get("/doctors", async (req, res) => {
      const result = await doctorsCollection.find({}).toArray();
      res.send(result);
    });

    ///load specific load details
    app.get("/appointments/:id", async (req, res) => {
      const id = req.params.id;
      const result = await appointmentCollection.findOne({ _id: ObjectId(id) });
      res.send(result);
    });

    ///load specific patient appointment
    app.get("/appointments", verifyToken, async (req, res) => {
      const email = req?.query?.email;
      const date = req?.query?.date;
      if (req?.decodedUserEmail === email) {
        // console.log(email, date);
        // console.log(new Date(date));
        const query = { email: email, date: date };
        const appointments = await appointmentCollection.find(query).toArray();
        // console.log(appointments);
        res.send(appointments);
      }
    });
    ///update payment appointmentInfo
    app.put("/appointment/:id", async (req, res) => {
      const id = req.params.id;
      const payment = req.body;
      const filter = { _id: ObjectId(id) };
      const updateDoc = {
        $set: {
          payment,
        },
      };
      const result = await appointmentCollection.updateOne(filter, updateDoc);
      console.log(result);
      res.json(result);
    });

    //users info
    app.post("/users", async (req, res) => {
      const newUser = req.body;
      const users = await usersCollection.insertOne(newUser);
      // console.log(users);
      res.json(users);
    });

    ///users info add if user is remain or not
    app.put("/users", async (req, res) => {
      const newUser = req.body;
      const filter = { email: newUser.email };
      const options = { upsert: true };
      const updateDoc = { $set: newUser };
      const users = await usersCollection.updateOne(filter, updateDoc, options);
      // console.log(users);
      res.json(users);
    });

    //make admin
    app.put("/users/admin", verifyToken, async (req, res) => {
      const newUser = req.body;
      // console.log(newUser);
      if (req?.decodedUserEmail) {
        const query = { email: req?.decodedUserEmail };
        const admin = await usersCollection.findOne(query);

        if (admin.role === "admin") {
          const filter = { email: newUser?.email };
          const updateDoc = { $set: { role: "admin" } };
          const users = await usersCollection.updateOne(filter, updateDoc);
          // console.log("admin", users);
          res.json(users);
        }
      } else {
        res.status(401).json({ message: "user Unauthorized" });
      }
    });

    ///admin check
    app.get("/users/admin/:email", async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      console.log("user", user, "email", email);
      let isAdmin = false;
      if (user?.role === "admin") {
        isAdmin = true;
      }
      res.send({ admin: isAdmin });
      console.log("isAdmin", isAdmin);
    });

    ///stripe payment intent
    app.post("/create-payment-intent", async (req, res) => {
      const paymentInfo = req.body;
      console.log(paymentInfo);
      const amount = paymentInfo.price * 100;
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        automatic_payment_methods: {
          enabled: true,
        },
      });

      res.json({
        clientSecret: paymentIntent.client_secret,
      });
    });
  } finally {
  }
}
run().catch(console.dir);
app.get("/", (req, res) => {
  res.send("server OK");
});
app.listen(port, () => {
  console.log("connected", port);
});
