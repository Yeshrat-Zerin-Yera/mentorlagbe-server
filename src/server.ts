
import dotenv from "dotenv";

dotenv.config();

const startServer = async () => {
  try {
    const { connectDB } = await import("./config/db.js");
    await connectDB();

    const { app } = await import("./app.js");

    const PORT = Number(process.env.PORT) || 5000;

    app.listen(PORT, () => {
      console.log(`MentorLagbe server running on port ${PORT}`);
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
};

startServer();
