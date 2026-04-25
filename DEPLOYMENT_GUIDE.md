# Mini Task Manager - Deployment & Database Configuration

This guide helps you set up and deploy the Mini Task Manager with MongoDB.

## 🗄️ Database Setup (MongoDB Atlas)

1. Create a free account at [MongoDB Atlas](https://www.mongodb.com/cloud/atlas).
2. Deploy a free Shared Cluster.
3. In "Database Access", create a user with a password.
4. In "Network Access", allow access from `0.0.0.0/0` (for deployment).
5. Click "Connect" -> "Drivers" -> Copy your Connection String.
6. Replace `<password>` with your actual database user password.

## 🚀 Deploying to Netlify

1. **Push your code** to GitHub.
2. **Connect your repository** to Netlify.
3. **Configure Build Settings**:
   - Build Command: `npm run build`
   - Publish directory: `dist`
4. **Set Environment Variables** in Netlify (Site Settings -> Environment Variables):
   - `MONGODB_URI`: Your Atlas connection string.
   - `JWT_SECRET`: A long random string.
   - `VITE_APP_NAME`: Your custom app name.
5. **Functions (Backend)**:
   - Note: To run the Express backend on Netlify, you may need to migrate `server.ts` to Netlify Functions or deploy the backend to a platform like Render/Railrail while keeping the frontend on Netlify.

1. Open the **Settings** menu (gear icon).
2. Go to **Environment Variables**.
3. Add a new variable:
   - Key: `MONGODB_URI`
   - Value: `your_mongodb_connection_string`
4. Add another variable:
   - Key: `JWT_SECRET`
   - Value: `a_random_long_secret_string`
5. Click **Save**.
