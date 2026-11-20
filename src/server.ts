
import dotenv from "dotenv";
import dns from "node:dns";

dotenv.config();

// Configure DNS only for this Node.js process.
dns.setServers(["8.8.8.8", "8.8.4.4"]);

const startServer = async () => {
  try {
    const { app, mountAuth } = await import("./app.js");

    const PORT = Number(process.env.PORT) || 5000;

    app.listen(PORT, () => {
      console.log(`MentorLagbe server running on port ${PORT}`);
    });

    try {
      const { connectDB } = await import("./config/db.js");

      await connectDB();
      await mountAuth();

      console.log("BetterAuth mounted successfully");
    } catch (error) {
      console.error("Database/Auth initialization failed:", error);
      console.log("Express is still running.");
    }
  } catch (error) {
    console.error("Server startup failed:", error);
    process.exit(1);
  }
};

startServer();
