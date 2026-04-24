import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";
import { z } from "zod";
import jwt from "jsonwebtoken";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const db = new Database("tasks.db");
db.pragma('foreign_keys = ON');
const JWT_SECRET = process.env.JWT_SECRET || "default_secret_dont_use_in_prod";

// Initialize Database
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId INTEGER NOT NULL,
    title TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    endTime DATETIME,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (userId) REFERENCES users(id)
  );
`);

// Support schema migration for older task tables missing userId or endTime
try {
  db.exec("ALTER TABLE tasks ADD COLUMN userId INTEGER REFERENCES users(id)");
} catch (e) {}

try {
  db.exec("ALTER TABLE tasks ADD COLUMN endTime DATETIME");
} catch (e) {}

// Middleware to verify JWT
const authenticateToken = (req: any, res: any, next: any) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.status(401).json({ error: "Access denied" });

  try {
    const verified = jwt.verify(token, JWT_SECRET);
    req.user = verified;
    next();
  } catch (err) {
    res.status(403).json({ error: "Invalid token" });
  }
};

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Auth Endpoints (Email-only)
  app.post("/api/auth/login", async (req, res) => {
    try {
      const userSchema = z.object({
        email: z.string().email(),
      });
      const result = userSchema.safeParse(req.body);
      if (!result.success) return res.status(400).json({ error: "Valid email is required" });

      const { email } = result.data;
      
      // Upsert user (SQLite way)
      let user: any = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
      
      if (!user) {
        const info = db.prepare("INSERT INTO users (email) VALUES (?)").run(email);
        user = { id: info.lastInsertRowid, email };
      }

      const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
      res.json({ token, user: { id: user.id, email: user.email } });
    } catch (error) {
      res.status(500).json({ error: "Authentication failed" });
    }
  });

  // Protected API Endpoints
  app.get("/api/tasks", authenticateToken, (req: any, res) => {
    try {
      const tasks = db.prepare("SELECT * FROM tasks WHERE userId = ? ORDER BY createdAt DESC").all(req.user.id);
      res.json(tasks);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch tasks" });
    }
  });

  app.post("/api/tasks", authenticateToken, (req: any, res) => {
    try {
      const taskSchema = z.object({
        title: z.string().min(1, "Title is required"),
        status: z.enum(["pending", "completed"]).default("pending"),
        endTime: z.string().nullable().optional(),
      });

      const result = taskSchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ error: result.error.issues[0].message });
      }

      const { title, status, endTime } = result.data;
      
      // Verify user exists before inserting to provide better error
      const userExists = db.prepare("SELECT id FROM users WHERE id = ?").get(req.user.id);
      if (!userExists) {
        return res.status(403).json({ error: "User session is invalid. Please log in again." });
      }

      const info = db.prepare("INSERT INTO tasks (userId, title, status, endTime) VALUES (?, ?, ?, ?)").run(req.user.id, title, status, endTime || null);
      
      const newTask = db.prepare("SELECT * FROM tasks WHERE id = ?").get(info.lastInsertRowid);
      res.status(201).json(newTask);
    } catch (error: any) {
      console.error("Create task error:", error);
      if (error.code === 'SQLITE_CONSTRAINT_FOREIGNKEY') {
        return res.status(403).json({ error: "User session is invalid. Please log in again." });
      }
      res.status(500).json({ error: "Failed to create task" });
    }
  });

  app.patch("/api/tasks/:id", authenticateToken, (req: any, res) => {
    try {
      const { id } = req.params;
      const taskSchema = z.object({
        title: z.string().min(1).optional(),
        status: z.enum(["pending", "completed"]).optional(),
        endTime: z.string().nullable().optional(),
      });

      const result = taskSchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ error: result.error.issues[0].message });
      }

      const { title, status, endTime } = result.data;
      const updates = [];
      const values = [];

      if (title !== undefined) {
        updates.push("title = ?");
        values.push(title);
      }
      if (status !== undefined) {
        updates.push("status = ?");
        values.push(status);
      }
      if (endTime !== undefined) {
        updates.push("endTime = ?");
        values.push(endTime);
      }

      if (updates.length === 0) {
        return res.status(400).json({ error: "No fields to update" });
      }

      values.push(id);
      values.push(req.user.id);
      const query = `UPDATE tasks SET ${updates.join(", ")} WHERE id = ? AND userId = ?`;
      const info = db.prepare(query).run(...values);

      if (info.changes === 0) {
        return res.status(404).json({ error: "Task not found" });
      }

      const updatedTask = db.prepare("SELECT * FROM tasks WHERE id = ?").get(id);
      res.json(updatedTask);
    } catch (error) {
      res.status(500).json({ error: "Failed to update task" });
    }
  });

  app.delete("/api/tasks/:id", authenticateToken, (req: any, res) => {
    try {
      const { id } = req.params;
      const result = db.prepare("DELETE FROM tasks WHERE id = ? AND userId = ?").run(id, req.user.id);
      
      if (result.changes === 0) {
        return res.status(404).json({ error: "Task not found" });
      }
      
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete task" });
    }
  });

  app.delete("/api/tasks", authenticateToken, (req: any, res) => {
    try {
      const result = db.prepare("DELETE FROM tasks WHERE userId = ?").run(req.user.id);
      res.status(204).send();
    } catch (error) {
      console.error("Batch delete error:", error);
      res.status(500).json({ error: "Failed to delete all tasks" });
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
    const distPath = path.join(__dirname, "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
