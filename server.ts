import express from "express";
import { createServer as createViteServer } from "vite";
import { MongoClient, ObjectId } from "mongodb";
import path from "path";
import { fileURLToPath } from "url";
import { z } from "zod";
import jwt from "jsonwebtoken";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Initialize MongoDB Connection
let client: MongoClient | null = null;
let db: any = null;

async function getDb() {
  if (!db) {
    const mongodbUri = process.env.MONGODB_URI;
    
    if (!mongodbUri || mongodbUri.includes("your_mongodb_uri") || mongodbUri.trim() === "" || mongodbUri === "base") {
      throw new Error("MONGODB_URI is missing or misconfigured. Please provide your MongoDB Atlas connection string in Settings.");
    }

    try {
      client = new MongoClient(mongodbUri);
      await client.connect();
      db = client.db("taskmanager");
      console.log("🎨 MongoDB connected successfully.");
    } catch (err: any) {
      console.error("❌ MongoDB connection failed:", err.message);
      throw err;
    }
  }
  return db;
}

const JWT_SECRET = process.env.JWT_SECRET || "default_secret_dont_use_in_prod";

// Middleware to verify JWT
const authenticateToken = (req: any, res: any, next: any) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.status(401).json({ error: "Access token required" });

  jwt.verify(token, JWT_SECRET, (err: any, user: any) => {
    if (err) return res.status(403).json({ error: "Invalid or expired token" });
    req.user = user;
    next();
  });
};

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Health check
  app.get("/api/health", async (req, res) => {
    const mongodbUri = process.env.MONGODB_URI;
    const isConfigured = !!mongodbUri && !mongodbUri.includes("your_mongodb_uri") && mongodbUri !== "base";
    
    let isConnected = false;
    if (isConfigured) {
      try {
        const database = await getDb();
        await database.command({ ping: 1 });
        isConnected = true;
      } catch (e) {
        isConnected = false;
      }
    }

    res.json({ 
      status: "ok", 
      db: isConfigured ? "MongoDB" : "Missing Configuration",
      connected: isConnected,
      configured: isConfigured
    });
  });

  // Auth Endpoint
  app.post("/api/auth/login", async (req, res) => {
    try {
      const loginSchema = z.object({ email: z.string().email() });
      const result = loginSchema.safeParse(req.body);
      
      if (!result.success) {
        return res.status(400).json({ error: "Invalid email format" });
      }

      const { email } = result.data;
      const database = await getDb();
      const usersCollection = database.collection("users");
      
      let user = await usersCollection.findOne({ email });
      
      if (!user) {
        const insertResult = await usersCollection.insertOne({ 
          email, 
          createdAt: new Date() 
        });
        user = await usersCollection.findOne({ _id: insertResult.insertedId });
      }

      const token = jwt.sign({ id: user._id.toString(), email: user.email }, JWT_SECRET, { expiresIn: '7d' });
      res.json({ token, user: { id: user._id.toString(), email: user.email } });
    } catch (error: any) {
      console.error("Login error:", error.message);
      let message = error.message || "Authentication failed";
      
      // Provide more helpful tips for common MongoDB errors
      if (error.message.includes("MONGODB_URI")) {
        message = error.message;
      } else if (error.message.includes("ENOTFOUND") || error.message.includes("getaddrinfo")) {
        message = "DNS Error: The hostname could not be found. Please check your MONGODB_URI.";
      } else if (error.message.includes("SSL alert number 80") || error.message.includes("tlsv1 alert internal")) {
        message = "Network Error (SSL 80): MongoDB Atlas rejected the connection. Please ensure 'Allow Access From Anywhere' (0.0.0.0/0) is enabled in your MongoDB Atlas Network Access settings.";
      } else if (error.message.includes("auth failed") || error.message.includes("Authentication failed")) {
        message = "Database login failed. Please check your MongoDB username and password.";
      }

      res.status(500).json({ error: message });
    }
  });

  // Protected API Endpoints
  app.get("/api/tasks", authenticateToken, async (req: any, res) => {
    try {
      const database = await getDb();
      const tasksCollection = database.collection("tasks");
      const tasks = await tasksCollection
        .find({ userId: req.user.id })
        .sort({ createdAt: -1 })
        .toArray();
      
      const mappedTasks = tasks.map(t => ({
        ...t,
        id: t._id.toString(),
        _id: undefined
      }));
      
      res.json(mappedTasks);
    } catch (error: any) {
      console.error("Fetch tasks error:", error.message);
      res.status(500).json({ error: "Failed to fetch tasks." });
    }
  });

  app.post("/api/tasks", authenticateToken, async (req: any, res) => {
    try {
      const taskSchema = z.object({
        title: z.string().min(1),
        status: z.enum(["pending", "completed"]),
        endTime: z.string().optional().nullable(),
      });

      const result = taskSchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ error: result.error.issues[0].message });
      }

      const { title, status, endTime } = result.data;
      const database = await getDb();
      const tasksCollection = database.collection("tasks");
      
      const task = {
        userId: req.user.id,
        title,
        status,
        endTime: endTime || null,
        createdAt: new Date()
      };

      const insertResult = await tasksCollection.insertOne(task);
      const insertedTask = {
        ...task,
        id: insertResult.insertedId.toString(),
        _id: undefined
      };
      
      res.status(201).json(insertedTask);
    } catch (error: any) {
      console.error("Create task error:", error.message);
      res.status(500).json({ error: "Failed to create task" });
    }
  });

  app.patch("/api/tasks/:id", authenticateToken, async (req: any, res) => {
    try {
      const { id } = req.params;
      const taskSchema = z.object({
        title: z.string().min(1).optional(),
        status: z.enum(["pending", "completed"]).optional(),
        endTime: z.string().optional().nullable(),
      });

      const result = taskSchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ error: result.error.issues[0].message });
      }

      const updateData: any = {};
      const { title, status, endTime } = result.data;
      if (title !== undefined) updateData.title = title;
      if (status !== undefined) updateData.status = status;
      if (endTime !== undefined) updateData.endTime = endTime;

      if (Object.keys(updateData).length === 0) {
        return res.status(400).json({ error: "No fields to update" });
      }

      const database = await getDb();
      const tasksCollection = database.collection("tasks");
      
      const updatedDoc = await tasksCollection.findOneAndUpdate(
        { _id: new ObjectId(id), userId: req.user.id },
        { $set: updateData },
        { returnDocument: 'after' }
      );

      if (!updatedDoc) {
        return res.status(404).json({ error: "Task not found" });
      }

      const mappedTask = {
        ...updatedDoc,
        id: updatedDoc._id.toString(),
        _id: undefined
      };

      res.json(mappedTask);
    } catch (error: any) {
      console.error("Update task error:", error.message);
      res.status(500).json({ error: "Failed to update task" });
    }
  });

  app.delete("/api/tasks/:id", authenticateToken, async (req: any, res) => {
    try {
      const { id } = req.params;
      const database = await getDb();
      const tasksCollection = database.collection("tasks");
      
      const result = await tasksCollection.deleteOne({ 
        _id: new ObjectId(id), 
        userId: req.user.id 
      });
      
      if (result.deletedCount === 0) {
        return res.status(404).json({ error: "Task not found" });
      }
      
      res.status(204).send();
    } catch (error: any) {
      console.error("Delete task error:", error.message);
      res.status(500).json({ error: "Failed to delete task" });
    }
  });

  app.delete("/api/tasks", authenticateToken, async (req: any, res) => {
    try {
      const database = await getDb();
      const tasksCollection = database.collection("tasks");
      await tasksCollection.deleteMany({ userId: req.user.id });
      res.status(204).send();
    } catch (error: any) {
      console.error("Batch delete error:", error.message);
      res.status(500).json({ error: "Failed to delete tasks" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
  });
}

startServer();
