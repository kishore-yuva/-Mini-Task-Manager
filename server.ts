import express from "express";
import { createServer as createViteServer } from "vite";
import { MongoClient, ObjectId } from "mongodb";
import path from "path";
import { fileURLToPath } from "url";
import { z } from "zod";
import jwt from "jsonwebtoken";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Initialize MongoDB Connection (Cached for Serverless)
let client: MongoClient | null = null;
let db: any = null;

async function getDb() {
  if (db) return db;

  const mongodbUri = process.env.MONGODB_URI;
  
  if (!mongodbUri || mongodbUri.includes("your_mongodb_uri") || mongodbUri.trim() === "" || mongodbUri === "base") {
    throw new Error("MONGODB_URI is missing. Please set this in your Netlify Environment Variables.");
  }

  try {
    if (!client) {
      console.log("🔋 Initializing new MongoDB client...");
      client = new MongoClient(mongodbUri, {
        connectTimeoutMS: 10000,
        serverSelectionTimeoutMS: 10000,
      });
      await client.connect();
    } else {
      console.log("♻️  Reusing existing MongoDB client.");
    }
    
    db = client.db("taskmanager");
    return db;
  } catch (err: any) {
    console.error("❌ MongoDB connection failed:", err.message);
    // Reset client to force reconnection on next attempt
    client = null;
    db = null;
    throw err;
  }
}

const JWT_SECRET = process.env.JWT_SECRET || "default_secret_dont_use_in_prod";

// Removed authenticateToken middleware for public access
const DEFAULT_USER_ID = "public_user";

export async function createServer() {
  const app = express();
  app.use(cors());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  
  // Robust request logging
  app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.log(`[REQ] ${req.method} ${req.originalUrl} -> ${req.url}`);
    next();
  });

  const apiRouter = express.Router();
  
  // IMMEDIATELY mount API router to ensure it catches requests first
  app.use("/api", apiRouter);
  
  // Health check
  apiRouter.get("/health", async (req, res) => {
    console.log(`[API] Health check within apiRouter: ${req.method} ${req.url}`);
    const mongodbUri = process.env.MONGODB_URI;
    const isConfigured = !!mongodbUri && !mongodbUri.includes("your_mongodb_uri") && mongodbUri !== "base" && mongodbUri.trim() !== "";
    
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
      configured: isConfigured,
      timestamp: new Date().toISOString()
    });
  });

  // Auth Endpoint (Kept for compatibility but effectively bypassed)
  apiRouter.post("/auth/login", async (req, res) => {
    res.json({ token: "public_access", user: { id: DEFAULT_USER_ID, email: "public@example.com" } });
  });

  // Public API Endpoints
  apiRouter.get("/tasks", async (req, res) => {
    try {
      const database = await getDb();
      const tasksCollection = database.collection("tasks");
      const tasks = await tasksCollection
        .find({ userId: DEFAULT_USER_ID })
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

  apiRouter.post("/tasks", async (req, res) => {
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
        userId: DEFAULT_USER_ID,
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

  apiRouter.patch("/tasks/:id", async (req, res) => {
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

      const database = await getDb();
      const tasksCollection = database.collection("tasks");
      
      const updatedDoc = await tasksCollection.findOneAndUpdate(
        { _id: new ObjectId(id), userId: DEFAULT_USER_ID },
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

  apiRouter.delete("/tasks/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const database = await getDb();
      const tasksCollection = database.collection("tasks");
      
      const result = await tasksCollection.deleteOne({ 
        _id: new ObjectId(id), 
        userId: DEFAULT_USER_ID 
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

  apiRouter.delete("/tasks", async (req, res) => {
    try {
      const database = await getDb();
      const tasksCollection = database.collection("tasks");
      await tasksCollection.deleteMany({ userId: DEFAULT_USER_ID });
      res.status(204).send();
    } catch (error: any) {
      console.error("Batch delete error:", error.message);
      res.status(500).json({ error: "Failed to delete tasks" });
    }
  });

  // Test endpoint
  apiRouter.post("/test", (req, res) => {
    console.log("[API] Test POST received:", req.body);
    res.json({ message: "Test successful", body: req.body });
  });

  // API Fallback for unmatched /api routes
  apiRouter.all("*", (req, res) => {
    console.warn(`[API 404] Route not found in apiRouter: ${req.method} ${req.url}`);
    res.status(404).json({
      error: "Route not found",
      method: req.method,
      path: req.path
    });
  });

  // Global Error Handler
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error("💥 Unhandled API Error:", err);
    const status = err.status || 500;
    res.status(status).json({ 
      error: status === 404 ? "Not Found" : "Internal Server Error", 
      message: err.message || "An unexpected error occurred"
    });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    console.log("🛠️  Starting Vite in middleware mode...");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    console.log("📦 Serving production static files...");
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  return app;
}
