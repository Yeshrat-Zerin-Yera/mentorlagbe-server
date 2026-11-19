
import dotenv from "dotenv";

dotenv.config();

const startServer = async () => {
  try {
    // Load these modules only after dotenv has loaded
    const { default: app } = await import("./app.js");
    const { connectDB } = await import("./config/db.js");

    const PORT = Number(process.env.PORT) || 5000;

    await connectDB();

    app.listen(PORT, () => {
      console.log(`MentorLagbe server running on port ${PORT}`);
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
};

startServer();
