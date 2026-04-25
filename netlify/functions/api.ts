import serverless from "serverless-http";
import { createServer } from "../../server";

let serverlessHandler: any;

export const handler = async (event: any, context: any) => {
  try {
    if (!serverlessHandler) {
      const app = await createServer();
      serverlessHandler = serverless(app);
    }
    return await serverlessHandler(event, context);
  } catch (error: any) {
    console.error("Netlify Function Error:", error);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        error: "Internal Server Error",
        message: error.message,
        hint: "This often happens if MONGODB_URI is not set in Netlify environment variables or if the connection timed out."
      })
    };
  }
};
