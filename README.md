# 🚀 ThreadQube – Backend

This is the **backend** of **ThreadQube**, a forum web application built with the **MERN stack**. It manages authentication, user roles, post/comment APIs, comment reporting, announcements, and Stripe-based Gold Membership upgrades. The backend exposes a RESTful API consumed by the React frontend, with secure Firebase token verification and role-based access control for admins.

---

### ✨ Features

🔐 **Firebase Authentication** with Bearer Token verification  
📝 **Post and Comment APIs** (create, delete only — no editing)  
🚩 **Comment Reporting System** – Users can report inappropriate comments  
🧑‍💼 **Role-Based Access Control** – Admin-only actions (not based on Gold Membership)  
📢 **Admin Announcements** – Admins can create and remove announcements  
👥 **Role Management** – Admins can view all users and promote them to admin  
💳 **Stripe Integration** – Users can upgrade to Gold Membership via secure payments  
📦 **MongoDB Atlas** – Cloud database for storing all data  
🌐 **CORS-enabled REST API** – Ready for frontend integration  

---

### 🧰 Tech Stack

- **Node.js + Express** – Backend server and RESTful API handling  
- **MongoDB Atlas + Mongoose** – Cloud-based NoSQL database and schemas  
- **Firebase Admin SDK** – User authentication and token verification  
- **Stripe** – Payment processing for Gold Membership  
- **dotenv** – Environment variable management  
- **CORS** – Security and request logging middleware  
