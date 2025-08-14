require("dotenv").config();
const express = require("express");
const app = express();
const cors = require("cors");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const { MongoClient, ServerApiVersion } = require("mongodb");
const { ObjectId } = require("mongodb");
const admin = require("firebase-admin");
const decoded = Buffer.from(process.env.FB_SERVICE_KEY, 'base64').toString('utf8')
const serviceAccount = JSON.parse(decoded)
const port = 3000;
function isValidObjectId(id) {
  return ObjectId.isValid(id) && (String)(new ObjectId(id)) === id;
}

// middleware
app.use(cors({
  origin: ["https://threadqube.netlify.app", "http://localhost:5173"],
  credentials: true
}));
app.use(express.json());

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.zc7c13h.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

const verfiyFirebaseToken = async(req, res, next) =>{
  const AuthHeader = req.headers?.authorization;
  if(!AuthHeader || !AuthHeader.startsWith('Bearer ')){
    return res.status(401).send({message: 'unauthorized access'})
  }
  const token = AuthHeader.split(' ')[1];

  try{
    const decoded = await admin.auth().verifyIdToken(token)
    console.log('decoded token ->', decoded);
    req.decoded = decoded;
    next()
  }
  catch(error){
    return res.status(401).send({message: 'unauthorized access'})
  }
}

const verifyTokenEmail = (req, res, next) =>{
  if(req.query.email !== req.decoded.email){
    return res.status(403).send({message: 'forbidden access'})
  }
  next()
}

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    const PostsCollection = client.db("ThreadDB").collection("Allposts");
    const UsersCollection = client.db("ThreadDB").collection("users");
    const AnnouncementsCollection = client.db("ThreadDB").collection("announcements");
    const CommentsCollection = client.db("ThreadDB").collection("comments")
    const ReportsCollection = client.db("ThreadDB").collection("reports")
    const TagsCollection = client.db("ThreadDB").collection("tags")
    const FeedbackCollection = client.db("ThreadDB").collection("feedback")
    const StaticPagesCollection = client.db("ThreadDB").collection("staticPages")

    // await client.connect();

    // All user 
    app.get("/users/all", verfiyFirebaseToken, async (req, res) => {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;
      const skip = (page - 1) * limit;

      const total = await UsersCollection.countDocuments();
      const users = await UsersCollection.find().skip(skip).limit(limit).toArray();

      res.send({
        users,
        totalUsers: total,
        totalPages: Math.ceil(total / limit),
        currentPage: page,
      });
    });


    // feedback
    app.post("/feedback", async (req, res) => {
      const feedback = req.body;
      const result = await FeedbackCollection.insertOne(feedback);
      res.send(result);
    });

    app.get("/feedback", async(req, res) => {
      const result = await FeedbackCollection.find().toArray();
      res.send(result);
    })

    app.delete("/feedback/:id", async (req, res) => {
      const id = req.params.id;
      const result = await FeedbackCollection.deleteOne({ _id: new ObjectId(id) });
      res.send(result);
    });

    app.patch("/feedback/:id", async (req, res) => {
      const id = req.params.id;
      const result = await FeedbackCollection.updateOne(
        { _id: new ObjectId(id) },
        {
          $set: {
            response: true,
            respondedAt: new Date()
          }
        }
      );
      res.send(result);
    });

    app.patch("/feedback/:id/read", async (req, res) => {
      const id = req.params.id;

      try {
        const result = await FeedbackCollection.updateOne(
          { _id: new ObjectId(id) },
          {
            $set: {
              read: true,
            },
          }
        );
        res.send(result);
      } catch (error) {
        res.status(500).send({ error: "Failed to mark feedback as read." });
      }
    });


    // users 
    app.get("/users", verfiyFirebaseToken, verifyTokenEmail, async(req, res) => {
      const email = req.query.email;
      const user = await UsersCollection.findOne({email})
      res.send(user);
    })

    // users - new this month
    app.get("/users/new-this-month", verfiyFirebaseToken, async (req, res) => {
      try {
        const now = new Date();
        const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

        const users = await UsersCollection.find({
          role: "user",
          $expr: {
            $gte: [
              { $dateFromString: { dateString: "$createdAt" } },
              firstDayOfMonth
            ]
          }
        }).toArray();

        res.send(users);
      } catch (error) {
        console.error(error);
        res.status(500).send({ message: "Error fetching new users", error });
      }
    });

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
    app.patch("/users/admin/:id", verfiyFirebaseToken, async(req, res) => {
      const id = req.params.id;
      const filter = {_id: new ObjectId(id)};
      const updatedDoc = {$set:{role: "admin"}}
      const result = await UsersCollection.updateOne(filter, updatedDoc);
      res.send(result);
    })

    // admin stats
    app.get("/admin/stats", verfiyFirebaseToken, async(req, res) => {
      const totalPosts = await PostsCollection.countDocuments();
      const totalComments = await CommentsCollection.countDocuments();
      const totalUsers = await UsersCollection.countDocuments();

      res.send({totalPosts, totalComments, totalUsers});
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

    app.put("/users/update", verfiyFirebaseToken, verifyTokenEmail, async (req, res) => {
      const email = req.query.email;
      const { name, photoURL } = req.body;

      const result = await UsersCollection.updateOne(
        { email },
        {
          $set: {
            name,
            photoURL,
            updatedAt: new Date(),
          },
        }
      );

      if (result.modifiedCount > 0) {
        return res.status(200).send({ message: "Updated" });
      } else {
        return res.status(400).send({ message: "Nothing updated" });
      }
    });


    // posts
    app.post("/Allposts", verfiyFirebaseToken, async(req, res) => {
      const postData = req.body;
      const result = await PostsCollection.insertOne(postData);
      res.send(result)
    })

    app.get("/Allposts", async (req, res) => {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 5;
      const skip = (page - 1) * limit;
      const tag = req.query.tag;
      const sortBy = req.query.sort || "newest";

      try {
        const query = tag ? { tag: { $regex: new RegExp(`^${tag}$`, "i") } } : {};

        const total = await PostsCollection.countDocuments(query);

        if (sortBy === "popularity") {
          const pipeline = [
            { $match: query },
            {
              $addFields: {
                totalVotes: { $subtract: ["$upvote", "$downVote"] },
                postIdStr: { $toString: "$_id" },
              },
            },
            {
              $lookup: {
                from: "comments",
                localField: "postIdStr",
                foreignField: "postId",
                as: "commentsArr",
              },
            },
            {
              $addFields: {
                commentsCount: { $size: "$commentsArr" },
              },
            },
            {
              $project: {
                commentsArr: 0,
                postIdStr: 0,
              },
            },
            { $sort: { totalVotes: -1, postTime: -1 } },
            { $skip: skip },
            { $limit: limit },
          ];

          const posts = await PostsCollection.aggregate(pipeline).toArray();

          res.send({
            posts,
            currentPage: page,
            totalPages: Math.ceil(total / limit),
            totalPosts: total,
          });
          return;
        }
        const pipeline = [
          { $match: query },
          {
            $addFields: {
              postIdStr: { $toString: "$_id" }, 
            },
          },
          {
            $lookup: {
              from: "comments",
              localField: "postIdStr",
              foreignField: "postId",
              as: "commentsArr",
            },
          },
          {
            $addFields: {
              commentsCount: { $size: "$commentsArr" },
            },
          },
          {
            $project: {
              commentsArr: 0,
              postIdStr: 0,
            },
          },
          { $sort: { postTime: -1 } },
          { $skip: skip },
          { $limit: limit },
        ];

        const posts = await PostsCollection.aggregate(pipeline).toArray();

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


    app.delete("/Allposts/:id", verfiyFirebaseToken, async(req, res) => {
      const id = req.params.id;
      const result = await PostsCollection.deleteOne({_id: new ObjectId(id)});
      res.send(result);
    })

    // user all posts  
    app.get("/Allposts/user", verfiyFirebaseToken, verifyTokenEmail, async(req, res) => {
      const email = req.query.email;
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;
      const skip = (page - 1) * limit;
      const query = { authorEmail: email };

      const totalPosts = await PostsCollection.countDocuments(query);
      const posts = await PostsCollection.find(query)
      .sort({ postTime: -1 }).skip(skip).limit(limit).toArray();

      res.send({posts, totalPosts, totalPages: Math.ceil(totalPosts / limit), currentPage: page,
      });

    })

    app.get("/Allposts/user/recent", verfiyFirebaseToken, verifyTokenEmail, async (req, res) => {
      const email = req.query.email;
      const query = { authorEmail: email };
      
      const posts = await PostsCollection.find(query)
        .sort({ postTime: -1 })
        .limit(3) 
        .toArray();

      res.send(posts);
    });

    // All posts for specific tags count
    app.get("/allPosts/tags", verfiyFirebaseToken, async (req, res) => {
      try {
        const result = await PostsCollection.aggregate([
          { $group: { _id: "$tag", count: { $sum: 1 } } },
          { $project: { _id: 0, tag: "$_id", count: 1 } },
          { $sort: { count: -1 } }
        ]).toArray();

        res.send(result);
      } catch (error) {
        console.error(error);
        res.status(500).send({ message: "Internal Server Error" });
      }
    });

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
    app.post("/announcements", verfiyFirebaseToken, async(req, res) => {
      const result = await AnnouncementsCollection.insertOne(req.body);
      res.send(result);
    })

    app.get("/announcements", async(req, res) => {
      const result = await AnnouncementsCollection.find().toArray();
      res.send(result);
    })

    app.patch("/announcements/:id/read", async (req, res) => {
      const id = req.params.id;

      try {
        const result = await AnnouncementsCollection.updateOne(
          { _id: new ObjectId(id) },
          {
            $set: {
              read: true,
            },
          }
        );
        res.send(result);
      } catch (error) {
        res.status(500).send({ error: "Failed to update announcement read status." });
      }
    });


    // comments
    app.get('/comments', verfiyFirebaseToken, async (req, res) => {
      const { postId } = req.query;
      const comments = await CommentsCollection.find({ postId }).sort({ createdAt: -1 }).toArray();
      res.send(comments);
    });

    app.get("/comments/:postId", async (req, res) => {
      const postId = req.params.postId;
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;
      const skip = (page - 1) * limit;

      try {
        const totalComments = await CommentsCollection.countDocuments({ postId });
        const comments = await CommentsCollection.find({ postId })
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .toArray();

        res.send({
          comments,
          totalComments,
          totalPages: Math.ceil(totalComments / limit),
        });
      } catch (error) {
        console.error("Error fetching comments:", error);
        res.status(500).send({ error: "Failed to fetch comments" });
      }
    });


    app.post('/comments', verfiyFirebaseToken, async (req, res) => {
      const comment = req.body; 
      comment.createdAt = new Date();
      const result = await CommentsCollection.insertOne(comment);
      res.send(result);
    });

    // Delete specific comment
    app.delete("/comments/:id", verfiyFirebaseToken, async (req, res) => {
      const id = req.params.id;
      const result = await CommentsCollection.deleteOne({ _id: new ObjectId(id) });
      res.send(result);
    });

    // reports 
    app.post("/reports", async (req, res) => {
      const { postId, commentId, feedback } = req.body;

      const report = {
        postId,
        commentId,
        feedback,
        reportedAt: new Date(),
      };

      const result = await ReportsCollection.insertOne(report);
      res.send(result);
    });

    app.get("/reports/:postId", async (req, res) => {
      const postId = req.params.postId;

      try {
        const reports = await ReportsCollection.find({ postId }).toArray();
        const reportedCommentIds = reports.map((report) => report.commentId);
        res.send(reportedCommentIds); 
      } catch (error) {
        res.status(500).send({ error: "Failed to fetch reports" });
      }
    });

    app.get("/reports", verfiyFirebaseToken, async (req, res) => {
      try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        const totalReports = await ReportsCollection.estimatedDocumentCount();

        const reports = await ReportsCollection.find()
          .sort({ reportedAt: -1 })
          .skip(skip)
          .limit(limit)
          .toArray();

        const commentIds = reports.map((r) => new ObjectId(r.commentId));
        const comments = await CommentsCollection.find({ _id: { $in: commentIds } }).toArray();

        const result = reports.map((report) => {
          const comment = comments.find((c) => c._id.toString() === report.commentId);
          return {
            ...report,
            commentText: comment?.commentText || "Deleted comment",
            userEmail: comment?.userEmail,
            userName: comment?.userName,
          };
        });

        res.send({
          reports: result,
          totalReports,
          totalPages: Math.ceil(totalReports / limit),
        });
      } catch (error) {
        console.error("Error fetching paginated reports:", error);
        res.status(500).send({ error: "Failed to fetch reports" });
      }
    });

    // Delete a report
    app.delete("/reports/:id", verfiyFirebaseToken, async (req, res) => {
      const id = req.params.id;
      const result = await ReportsCollection.deleteOne({ _id: new ObjectId(id) });
      res.send(result);
    });

    //  Delete all reports of a comment
    app.delete("/reports/byComment/:commentId", verfiyFirebaseToken, async (req, res) => {
      const { commentId } = req.params;
      const result = await ReportsCollection.deleteMany({ commentId });
      res.send(result);
    });


    app.patch("/Allposts/:id/comment", verfiyFirebaseToken, async(req, res) => {
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
    app.get("/dashboard-stats", verfiyFirebaseToken, verifyTokenEmail, async (req, res) => {
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

    // Tags
    app.get("/tags", verfiyFirebaseToken, async (req, res) => {
      const tags = await TagsCollection.find().toArray();
      res.send(tags);
    });


    app.get("/Alltags", async (req, res) => {
      const tags = await TagsCollection.find().toArray();
      res.send(tags);
    });

    app.post("/tags", verfiyFirebaseToken, async (req, res) => {
      const { name } = req.body;
      const exists = await TagsCollection.findOne({ name });

      if (exists) return res.status(400).send({ error: "Tag already exists" });

      const result = await TagsCollection.insertOne({ name });
      res.send(result);
    });


    // staticPages
    app.get("/staticPages/all", async(req, res) => {
      const result = await StaticPagesCollection.find().toArray();
      res.send(result);
    })

    app.get("/staticPages", async(req, res) => {
      const result = await StaticPagesCollection.findOne({_id: "terms-and-conditions"});
      res.send(result);
    })

    app.get("/staticPages/privacy", async(req, res) => {
      const result = await StaticPagesCollection.findOne({_id: "privacy-and-policy"});
      res.send(result);
    })

    // social links
    app.get("/staticPages/social", async(req, res) => {
      const result = await StaticPagesCollection.findOne({_id: "social-links"});
      res.send(result);
    })

    // specific pages - terms or privacy
    app.get("/staticPages/:id", verfiyFirebaseToken, async(req, res) => {
      const id = req.params.id;
      const result = await StaticPagesCollection.findOne({_id: id});
      res.send(result);
    })

    // patch api for social links
    app.patch("/staticPages/socialLinks",verfiyFirebaseToken, async(req, res) => {
      const { facebook, twitter, linkedin } = req.body;
      const result = await StaticPagesCollection.updateOne(
        {_id: "social-links"},
        {
          $set: {
            facebook, twitter, linkedin
          }
        },
        {upsert: true}
      )

      res.send(result);
    })

    // update page content and last updated date
    app.put("/staticPages/:id", verfiyFirebaseToken, async (req, res) => {
      const id = req.params.id;
      const payload = { ...req.body };

      payload.lastUpdated = new Date();

      const result = await StaticPagesCollection.updateOne(
        { _id: id },
        { $set: payload }
      );

      res.send(result);
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
