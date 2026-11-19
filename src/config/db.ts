
import dns from "node:dns";
import { MongoClient, Db } from "mongodb";

// Use public DNS for MongoDB Atlas SRV lookups.
// This changes DNS resolution only inside this Node.js process.
dns.setServers(["8.8.8.8", "8.8.4.4"]);

const uri = process.env.MONGODB_URI;

if (!uri) {
  throw new Error("MONGODB_URI is missing from environment variables");
}

const client = new MongoClient(uri);

let db: Db;

export const connectDB = async (): Promise<Db> => {
  if (db) return db;

  await client.connect();

  db = client.db(process.env.DB_NAME || "mentorlagbe");

  console.log("MongoDB connected successfully");

  return db;
};

export const getDB = (): Db => {
  if (!db) {
    throw new Error("Database is not connected yet");
  }

  return db;
};
