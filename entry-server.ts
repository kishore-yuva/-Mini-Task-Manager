import { createServer } from "./server";

const PORT = 3000;

createServer().then(app => {
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 Server running on http://localhost:${PORT} (Env: ${process.env.NODE_ENV || 'development'})`);
  });
}).catch(err => {
  console.error("❌ Failed to start server:", err);
  process.exit(1);
});
