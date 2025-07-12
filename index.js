require("dotenv").config();
const express = require("express");
const app = express();
const cors = require("cors");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const { MongoClient, ServerApiVersion } = require("mongodb");
const { ObjectId } = require("mongodb");
const port = 3000;
function isValidObjectId(id) {
  return ObjectId.isValid(id) && (String)(new ObjectId(id)) === id;
}

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
    const CommentsCollection = client.db("ThreadQube").collection("comments")

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

    // update user badge to gold
    app.patch("/users/badge/:email", async (req, res) => {
      const email = req.params.email;
      const { badge } = req.body;

      const result = await UsersCollection.updateOne(
        { email },
        { $set: { badge } }
      );
      res.send(result);
    });


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
      const tag = req.query.tag;

      try {
        const query = tag ? { tag } : {};

        const total = await PostsCollection.countDocuments(query);

        const posts = await PostsCollection.find(query)
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

    // specific post
    app.get("/Allposts/:id", async(req, res) => {
      const id = req.params.id;
      if (!isValidObjectId(id)) {
        return res.status(400).send({ error: "Invalid post ID" });
      }
      const result = await PostsCollection.findOne({_id: new ObjectId(id)});
      res.send(result);
    })

    // announcements
    app.post("/announcements", async(req, res) => {
      const result = await AnnouncementsCollection.insertOne(req.body);
      res.send(result);
    })

    // comments
    app.get('/comments', async (req, res) => {
      const { postId } = req.query;
      const comments = await CommentsCollection.find({ postId }).sort({ createdAt: -1 }).toArray();
      res.send(comments);
    });

    app.post('/comments', async (req, res) => {
      const comment = req.body; 
      comment.createdAt = new Date();
      const result = await CommentsCollection.insertOne(comment);
      res.send(result);
    });

    app.patch("/Allposts/:id/comment", async(req, res) => {
      const id = req.params.id;
      const filter = {_id: new ObjectId(id)};
      const updatedDoc = { $inc:{ comments: 1 } };
      const result = await PostsCollection.updateOne(filter, updatedDoc);
      res.send(result);
    })

    // Update votes
    app.patch('/Allposts/:id/vote', async (req, res) => {
      const postId = req.params.id;
      const { voteType } = req.body; 

      const updateField = voteType === "upvote" ? { $inc: { upvote: 1 } } : { $inc: { downVote: 1 } };
      const result = await PostsCollection.updateOne({ _id: new ObjectId(postId) }, updateField);
      res.send(result);
    });

    // dashboard home (landing page)
    app.get("/dashboard-stats", async (req, res) => {
      const email = req.query.email;

      const posts = await PostsCollection.find({ authorEmail: email }).toArray();
      const comments = await CommentsCollection.find({ userEmail: email }).toArray();
      const user = await UsersCollection.findOne({ email });

      const totalPosts = posts.length;
      const totalLikes = posts.reduce((sum, post) => sum + (post.upvote || 0), 0);
      const totalComments = comments.length;
      const memberSince = user?.createdAt;

      res.send({ totalPosts, totalLikes, totalComments, memberSince, badge: user?.badge });
    });


    // payment intent
    app.post("/create-payment-intent", async (req, res) => {
      const { email } = req.body;

      try {
        const amountInCents = 1000; // $10 for membership

        const paymentIntent = await stripe.paymentIntents.create({
          amount: amountInCents,
          currency: "usd",
          metadata: { email },
        });

        res.send({
          clientSecret: paymentIntent.client_secret,
        });
      } catch (error) {
        console.error("Payment error:", error);
        res.status(500).json({ error: "Payment initiation failed" });
      }
    });

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
