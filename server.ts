import express from "express";
import { createServer as createViteServer } from "vite";
import { MongoClient, ObjectId } from "mongodb";
import path from "path";
import { fileURLToPath } from "url";
import { z } from "zod";
import cors from "cors";
import dotenv from "dotenv";
import fs from "fs/promises";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
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

const DEFAULT_USER_ID = "public_user";

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

  // Auth Endpoint
  apiRouter.post("/auth/login", async (req, res) => {
    res.json({ token: "public_access", user: { id: DEFAULT_USER_ID, email: "public@example.com" } });
  });

  // Public API Endpoints
  apiRouter.get("/tasks", async (req, res) => {
    try {
      console.log(`[API] GET /tasks started...`);
      const adapter = await getAdapter();
      console.log(`[API] Using adapter isMongo=${adapter.isMongo}`);
      const tasks = await adapter.getTasks(DEFAULT_USER_ID);
      const mapped = tasks.map(t => {
        const id = t.id || (t._id ? t._id.toString() : null);
        return { ...t, id: id || 'temp-id', _id: undefined };
      });
      res.json(mapped);
    } catch (error: any) {
      console.error("Fetch tasks error:", error);
      res.status(500).json({ 
        error: "Failed to fetch tasks.", 
        details: error.message,
        stack: process.env.NODE_ENV === 'production' ? undefined : error.stack
      });
    }
  });

  apiRouter.post("/tasks", async (req, res) => {
    try {
      const taskSchema = z.object({
        title: z.string().min(1),
        status: z.enum(["pending", "completed"]),
        endTime: z.string().optional().nullable(),
      });

      const parsed = taskSchema.parse(req.body);
      const adapter = await getAdapter();
      
      const task = {
        userId: DEFAULT_USER_ID,
        ...parsed,
        createdAt: new Date()
      };

      const insertedTask = await adapter.addTask(task);
      res.status(201).json(insertedTask);
    } catch (error: any) {
      console.error("Create task error:", error.message);
      res.status(500).json({ error: error.message || "Failed to create task" });
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

      const updateData = taskSchema.parse(req.body);
      const adapter = await getAdapter();
      
      const updatedTask = await adapter.updateTask(id, DEFAULT_USER_ID, updateData);

      if (!updatedTask) {
        return res.status(404).json({ error: "Task not found" });
      }

      res.json(updatedTask);
    } catch (error: any) {
      console.error("Update task error:", error.message);
      res.status(500).json({ error: "Failed to update task" });
    }
  });

  apiRouter.delete("/tasks/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const adapter = await getAdapter();
      const success = await adapter.deleteTask(id, DEFAULT_USER_ID);
      
      if (!success) {
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
      const adapter = await getAdapter();
      await adapter.clearTasks(DEFAULT_USER_ID);
      res.status(204).send();
    } catch (error: any) {
      console.error("Batch delete error:", error.message);
      res.status(500).json({ error: "Failed to delete tasks" });
    }
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
