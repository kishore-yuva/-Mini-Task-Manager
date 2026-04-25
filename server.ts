import express from "express";
import { MongoClient, ObjectId } from "mongodb";
import path from "path";
import { fileURLToPath } from "url";
import { z } from "zod";
import cors from "cors";
import dotenv from "dotenv";
import fs from "fs/promises";
import jwt from "jsonwebtoken";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const JWT_SECRET = process.env.JWT_SECRET || "fallback-secret-for-dev-only";
const LOCAL_DB_PATH = process.env.VERCEL 
  ? path.join("/tmp", "tasks.json")
  : path.join(process.cwd(), "tasks.json");

// Define a unified interface for Database interactions
interface DbAdapter {
  isMongo: boolean;
  getTasks: (userId: string) => Promise<any[]>;
  addTask: (task: any) => Promise<any>;
  updateTask: (id: string, userId: string, update: any) => Promise<any>;
  deleteTask: (id: string, userId: string) => Promise<boolean>;
  clearTasks: (userId: string) => Promise<void>;
}

// Local File Implementation Helpers
async function getLocalTasks(): Promise<any[]> {
  try {
    const data = await fs.readFile(LOCAL_DB_PATH, "utf-8");
    return JSON.parse(data);
  } catch (e) {
    return [];
  }
}

async function saveLocalTasks(tasks: any[]) {
  await fs.writeFile(LOCAL_DB_PATH, JSON.stringify(tasks, null, 2));
}

// Global cached state
let mongoClient: MongoClient | null = null;
let mongoDb: any = null;
let activeAdapter: DbAdapter | null = null;
let mongoFailedPermanently = false;
let inMemoryTasks: any[] = [];

// Helper to safely convert to ObjectId
function safeObjectId(id: string): ObjectId | null {
  if (!id || id.length !== 24 || !/^[0-9a-fA-F]{24}$/.test(id)) {
    return null;
  }
  try {
    return new ObjectId(id);
  } catch (e) {
    return null;
  }
}

async function getAdapter(): Promise<DbAdapter> {
  if (activeAdapter) return activeAdapter;

  const mongodbUri = process.env.MONGODB_URI;
  const useMongo = !mongoFailedPermanently && mongodbUri && !mongodbUri.includes("your_mongodb_uri") && mongodbUri.trim() !== "" && mongodbUri !== "base";

  if (useMongo) {
    try {
      console.log("🔋 Attempting connection to MongoDB...");
      mongoClient = new MongoClient(mongodbUri!, {
        connectTimeoutMS: 2000, // Fail fast to avoid 502 timeouts
        serverSelectionTimeoutMS: 2000,
        socketTimeoutMS: 30000,
      });
      await mongoClient.connect();
      mongoDb = mongoClient.db("taskmanager");
      console.log("✅ Using MongoDB Atlas Database.");
      
      activeAdapter = {
        isMongo: true,
        getTasks: async (userId) => await mongoDb.collection("tasks").find({ userId }).sort({ createdAt: -1 }).toArray(),
        addTask: async (task) => {
          const res = await mongoDb.collection("tasks").insertOne(task);
          return { ...task, id: res.insertedId.toString() };
        },
        updateTask: async (id, userId, update) => {
          const oid = safeObjectId(id);
          if (!oid) return null;
          const res = await mongoDb.collection("tasks").findOneAndUpdate(
            { _id: oid, userId },
            { $set: update },
            { returnDocument: 'after' }
          );
          return res ? { ...res, id: res._id.toString() } : null;
        },
        deleteTask: async (id, userId) => {
          const oid = safeObjectId(id);
          if (!oid) return false;
          const res = await mongoDb.collection("tasks").deleteOne({ _id: oid, userId });
          return res.deletedCount > 0;
        },
        clearTasks: async (userId) => {
          await mongoDb.collection("tasks").deleteMany({ userId });
        }
      };
      return activeAdapter;
    } catch (err: any) {
      console.warn("⚠️ MongoDB Connection Failed. Switching to Secondary Database.", err.message);
      mongoFailedPermanently = true; // Don't try again for this process session
    }
  }

  // Fallback to Local/In-Memory
  console.log("📂 Using Local/In-Memory database backup");
  activeAdapter = {
    isMongo: false,
    getTasks: async (userId) => {
      const tasks = await getLocalTasks();
      return (tasks.length > 0 ? tasks : inMemoryTasks).filter(t => t.userId === userId).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    },
    addTask: async (task) => {
      const tasks = await getLocalTasks();
      const targetList = tasks.length > 0 || (await fs.stat(LOCAL_DB_PATH).catch(() => null)) ? tasks : inMemoryTasks;
      const newTask = { ...task, id: Math.random().toString(36).substr(2, 9) };
      targetList.push(newTask);
      try {
        await saveLocalTasks(targetList === tasks ? tasks : inMemoryTasks);
      } catch (e) {
        console.warn("💾 Local file saving failed (possibly read-only FS), using memory only.");
        inMemoryTasks = targetList;
      }
      return newTask;
    },
    updateTask: async (id, userId, update) => {
      let tasks = await getLocalTasks();
      if (tasks.length === 0 && inMemoryTasks.length > 0) tasks = inMemoryTasks;
      const idx = tasks.findIndex(t => (t.id === id || (t._id && t._id.toString() === id)) && t.userId === userId);
      if (idx === -1) return null;
      tasks[idx] = { ...tasks[idx], ...update };
      try {
        await saveLocalTasks(tasks);
      } catch (e) {
        inMemoryTasks = tasks;
      }
      return tasks[idx];
    },
    deleteTask: async (id, userId) => {
      let tasks = await getLocalTasks();
      if (tasks.length === 0 && inMemoryTasks.length > 0) tasks = inMemoryTasks;
      const filtered = tasks.filter(t => (t.id !== id && (!t._id || t._id.toString() !== id)) || t.userId !== userId);
      if (filtered.length === tasks.length) return false;
      try {
        await saveLocalTasks(filtered);
      } catch (e) {
        inMemoryTasks = filtered;
      }
      return true;
    },
    clearTasks: async (userId) => {
      let tasks = await getLocalTasks();
      if (tasks.length === 0 && inMemoryTasks.length > 0) tasks = inMemoryTasks;
      const filtered = tasks.filter(t => t.userId !== userId);
      try {
        await saveLocalTasks(filtered);
      } catch (e) {
        inMemoryTasks = filtered;
      }
    }
  };
  return activeAdapter;
}

// Authentication Middleware
function authenticateToken(req: any, res: any, next: any) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.status(401).json({ error: "Access denied. Token missing." });

  jwt.verify(token, JWT_SECRET, (err: any, user: any) => {
    if (err) return res.status(403).json({ error: "Invalid or expired token." });
    req.user = user;
    next();
  });
}

export async function createServer() {
  const app = express();
  app.use(cors());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  
  const apiRouter = express.Router();
  app.use("/api", apiRouter);
  
  // Health check
  apiRouter.get("/health", async (req, res) => {
    try {
      const adapter = await getAdapter();
      res.json({ 
        status: "ok", 
        db: adapter.isMongo ? "MongoDB" : "Local JSON",
        connected: true,
        timestamp: new Date().toISOString()
      });
    } catch (e) {
      res.status(500).json({ status: "error", connected: false });
    }
  });

  // Auth Endpoint (Passwordless Email Login)
  apiRouter.post("/auth/login", async (req, res) => {
    console.log(`[API] Login attempt for email: ${req.body?.email}`);
    try {
      const { email } = req.body;
      if (!email || !email.includes("@")) {
        console.warn(`[API] Invalid email provided: ${email}`);
        return res.status(400).json({ error: "Valid email is required" });
      }

      const adapter = await getAdapter();
      let user;

      if (adapter.isMongo && mongoDb) {
        user = await mongoDb.collection("users").findOne({ email });
        if (!user) {
          console.log(`[API] Creating new mongo user for: ${email}`);
          const result = await mongoDb.collection("users").insertOne({
            email,
            createdAt: new Date()
          });
          user = { _id: result.insertedId, email };
        }
      } else {
        console.log(`[API] Using local/fallback user for: ${email}`);
        user = { _id: "local_user_" + email, email };
      }

      const userId = user._id.toString();
      const token = jwt.sign({ id: userId, email: user.email }, JWT_SECRET, { expiresIn: '7d' });

      console.log(`[API] Login successful for: ${email}`);
      res.json({ token, user: { id: userId, email: user.email } });
    } catch (error: any) {
      console.error("💥 Login error:", error);
      res.status(500).json({ error: "Authentication failed", details: error.message });
    }
  });

  // Protected API Endpoints
  apiRouter.get("/tasks", authenticateToken, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const adapter = await getAdapter();
      const tasks = await adapter.getTasks(userId);
      const mapped = tasks.map(t => {
        const id = t.id || (t._id ? t._id.toString() : null);
        return { ...t, id: id || 'temp-id', _id: undefined };
      });
      res.json(mapped);
    } catch (error: any) {
      console.error("Fetch tasks error:", error);
      res.status(500).json({ error: "Failed to fetch tasks." });
    }
  });

  apiRouter.post("/tasks", authenticateToken, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const taskSchema = z.object({
        title: z.string().min(1),
        status: z.enum(["pending", "completed"]),
        endTime: z.string().optional().nullable(),
      });

      const parsed = taskSchema.parse(req.body);
      const adapter = await getAdapter();
      
      const task = {
        userId,
        ...parsed,
        createdAt: new Date()
      };

      const insertedTask = await adapter.addTask(task);
      res.status(201).json(insertedTask);
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Failed to create task" });
    }
  });

  apiRouter.patch("/tasks/:id", authenticateToken, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.id;
      const taskSchema = z.object({
        title: z.string().min(1).optional(),
        status: z.enum(["pending", "completed"]).optional(),
        endTime: z.string().optional().nullable(),
      });

      const updateData = taskSchema.parse(req.body);
      const adapter = await getAdapter();
      
      const updatedTask = await adapter.updateTask(id, userId, updateData);

      if (!updatedTask) {
        return res.status(404).json({ error: "Task not found" });
      }

      res.json(updatedTask);
    } catch (error: any) {
      res.status(500).json({ error: "Failed to update task" });
    }
  });

  apiRouter.delete("/tasks/:id", authenticateToken, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.id;
      const adapter = await getAdapter();
      const success = await adapter.deleteTask(id, userId);
      
      if (!success) {
        return res.status(404).json({ error: "Task not found" });
      }
      
      res.status(204).send();
    } catch (error: any) {
      res.status(500).json({ error: "Failed to delete task" });
    }
  });

  apiRouter.delete("/tasks", authenticateToken, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const adapter = await getAdapter();
      await adapter.clearTasks(userId);
      res.status(204).send();
    } catch (error: any) {
      res.status(500).json({ error: "Failed to delete tasks" });
    }
  });

  // 404 for API
  apiRouter.use((req, res) => {
    console.warn(`[API] 404 - Not Found: ${req.method} ${req.originalUrl}`);
    res.status(404).json({ error: "API route not found" });
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
    const { createServer: createViteServer } = await import("vite");
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

  return app;
}
