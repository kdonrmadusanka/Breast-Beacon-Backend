const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const { Server } = require("socket.io");
const http = require("http");
const ChatMessage = require("./models/chatMessage.model"); // Assuming you have this model
const mammogramRoutes = require("./routes/mammogram.routes");
const chatMessageRoutes = require("./routes/chatMessage.routes");
const patientRoutes = require("./routes/patient.routes");
const doctorRoutes = require("./routes/doctor.routes");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB Connection
mongoose
  .connect("mongodb+srv://breastbeacon:bb12345@breastbeacon.7o4hugj.mongodb.net/?retryWrites=true&w=majority&appName=breastbeacon", {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log("MongoDB connected"));

// Routes
app.use("/api/mammograms", mammogramRoutes);
app.use("/api/chatMessages", chatMessageRoutes);
app.use("/api/patients", patientRoutes);
app.use("/api/doctors", doctorRoutes);

// Socket.IO Connection
io.on("connection", (socket) => {
  socket.on("message", async (msg) => {
    const chatMessage = new ChatMessage({
      patientId: msg.patientId,
      doctorId: msg.doctorId,
      mammogramId: msg.mammogramId,
      sender: msg.sender,
      message: msg.text,
      imageAction: msg.imageAction,
    });
    await chatMessage.save();
    io.emit("message", msg);
  });
});

// Server Start
server.listen(5000, () => console.log("Server running on port 5000"));
