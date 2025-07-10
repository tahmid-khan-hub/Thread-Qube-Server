const express = require("express");
const app = express();
const cors = require("cors");
require("dotenv").config();
const { MongoClient, ServerApiVersion } = require("mongodb");
const { ObjectId } = require("mongodb");
const port = 3000;

// middleware
app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.zc7c13h.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    const PostsCollection = client.db("ThreadQube").collection("Allposts");
    const UsersCollection = client.db("ThreadQube").collection("users");
    const AnnouncementsCollection = client.db("ThreadQube").collection("announcements");

    await client.connect();

    // All user
    app.get("/users/all", async(req, res) => {
      const result = await UsersCollection.find().toArray();
      res.send(result);
    })

    // users
    app.get("/users", async(req, res) => {
      const email = req.query.email;
      const user = await UsersCollection.findOne({email})
      res.send(user);
    })

    app.post("/users", async(req, res) => {
      const { email } = req.body;
      const existingUser = await UsersCollection.findOne({ email });
      if (existingUser) {
        return res.send({ message: "User already exists" });
      }
      const result = await UsersCollection.insertOne(req.body);
      res.send(result);
    })

    // update user role to admin
    app.patch("/users/admin/:id", async(req, res) => {
      const id = req.params.id;
      const filter = {_id: new ObjectId(id)};
      const updatedDoc = {$set:{role: "admin"}}
      const result = await UsersCollection.updateOne(filter, updatedDoc);
      res.send(result);
    })

    // posts
    app.post("/Allposts", async(req, res) => {
      const postData = req.body;
      const result = await PostsCollection.insertOne(postData);
      res.send(result)
    })

    app.get("/Allposts", async (req, res) => {

      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 5;
      const skip = (page - 1) * limit;

      try {
        const total = await PostsCollection.estimatedDocumentCount();
        const posts = await PostsCollection.find()
          .sort({ postTime: -1 })
          .skip(skip)
          .limit(limit)
          .toArray();

        res.send({
          posts,
          currentPage: page,
          totalPages: Math.ceil(total / limit),
          totalPosts: total,
        });
      } catch (error) {
        console.error("Failed to get posts:", error);
        res.status(500).send({ error: "Failed to get posts" });
      }
    });

    app.delete("/Allposts/:id", async(req, res) => {
      const id = req.params.id;
      const result = await PostsCollection.deleteOne({_id: new ObjectId(id)});
      res.send(result);
    })

    // user all posts
    app.get("/Allposts/user" , async(req, res) => {
      const email = req.query.email;
      const result = await PostsCollection.find({ authorEmail: email }).toArray()
      res.send(result);
    })

    // announcements
    app.post("/announcements", async(req, res) => {
      const result = await AnnouncementsCollection.insertOne(req.body);
      res.send(result);
    })

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("ThreadQube is working");
});

app.listen(port, () => {
  console.log(`ThreadQube is running on port${port}`);
});
