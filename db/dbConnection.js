import mongoose from "mongoose";
import dns from "node:dns";

// Custom DNS resolvers help on some local networks (e.g. when resolving
// MongoDB Atlas SRV records fails). Skip it on Vercel, where the runtime
// already provides working resolvers.
if (!process.env.VERCEL) {
  dns.setServers(["8.8.8.8", "1.1.1.1"]);
}

// Cache the connection across serverless invocations so a warm Lambda does
// not open a new MongoDB connection on every request.
let connectionPromise = null;

const dbConnection = async () => {
  if (mongoose.connection.readyState === 1) return mongoose.connection;

  if (!connectionPromise) {
    if (!process.env.MONGO_URI) {
      throw new Error("MONGO_URI is not set");
    }

    connectionPromise = mongoose
      .connect(process.env.MONGO_URI, {
        serverSelectionTimeoutMS: 10000,
      })
      .then(async (m) => {
        console.log("Database Connected Successfully!");
        try {
          await m.connection.collection("bookings").dropIndex("event_1_user_1");
          console.log("Dropped legacy unique index event_1_user_1 if present");
        } catch {
          // Index might not exist or already dropped
        }
        return m.connection;
      })
      .catch((err) => {
        connectionPromise = null;
        console.error("Database Connection Failed:", err.message);
        throw err;
      });
  }

  return connectionPromise;
};

export default dbConnection;
