
import { MongoClient, Db } from "mongodb";

const uri = process.env.MONGODB_URI;

if (!uri) {
  throw new Error("MONGODB_URI is missing from environment variables");
}

export const client = new MongoClient(uri, {
  serverSelectionTimeoutMS: 15000,
});

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
