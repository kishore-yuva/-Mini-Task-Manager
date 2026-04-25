import { createServer } from "../server";

let cachedApp: any = null;

export default async (req: any, res: any) => {
  try {
    if (!cachedApp) {
      cachedApp = await createServer();
    }
    return cachedApp(req, res);
  } catch (err: any) {
    console.error("Vercel Function Error:", err);
    res.status(500).send(`Server Initialization Error: ${err.message}`);
  }
};
