
import express from "express";
import cors from "cors";
import helmet from "helmet";
import { toNodeHandler } from "better-auth/node";
import userRoutes from "./routes/user.routes.js";
import tuitionRoutes from "./routes/tuition.routes.js";

export const app = express();

app.use(helmet());

app.use(
  cors({
    origin: process.env.CLIENT_URL || "http://localhost:3000",
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  })
);

// Reserve the BetterAuth route before express.json().
let authHandler: ReturnType<typeof toNodeHandler> | null = null;

app.all("/api/auth/*splat", (req, res, next) => {
  if (!authHandler) {
    res.status(503).json({
      success: false,
      message: "Authentication is temporarily unavailable",
    });
    return;
  }

  return authHandler(req, res);
});

app.use(express.json());

app.use("/api/users", userRoutes);
app.use("/api/tuitions", tuitionRoutes);

app.get("/", (_req, res) => {
  res.status(200).json({
    success: true,
    message: "Welcome to MentorLagbe API",
  });
});

app.get("/health", (_req, res) => {
  res.status(200).json({
    success: true,
    message: "Server is healthy",
  });
});

export const mountAuth = async () => {
  const { auth } = await import("./config/auth.js");
  authHandler = toNodeHandler(auth);
};

export default app;
