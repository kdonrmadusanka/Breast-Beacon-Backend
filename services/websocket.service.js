const { Server } = require("socket.io");

let io;
let connectionCount = 0;

const initSocketIO = (server) => {
  if (io) {
    console.warn("Socket.IO already initialized, skipping re-initialization");
    return io;
  }

  io = new Server(server, {
    cors: {
      origin: process.env.FRONTEND_URL || "http://localhost:5173",
      methods: ["GET", "POST"],
      credentials: true,
    },
    // Add connection timeout and ping settings
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  io.on("connection", (socket) => {
    connectionCount++;
    console.log(
      `🔌 Socket.IO client connected: ${socket.id} (Total: ${connectionCount})`
    );

    socket.on("joinRoom", (room) => {
      socket.join(room);
      console.log(`📝 Client ${socket.id} joined room ${room}`);
    });

    socket.on("leaveRoom", (room) => {
      socket.leave(room);
      console.log(`🚪 Client ${socket.id} left room ${room}`);
    });

    socket.on("disconnect", (reason) => {
      connectionCount--;
      console.log(
        `❌ Socket.IO client disconnected: ${socket.id} (Reason: ${reason}) (Total: ${connectionCount})`
      );
    });

    // Handle connection errors
    socket.on("error", (error) => {
      console.error(`🚨 Socket error for ${socket.id}:`, error);
    });
  });

  // Log server-level events
  io.on("connection_error", (err) => {
    console.error("🚨 Socket.IO connection error:", err);
  });

  console.log("✅ Socket.IO initialized successfully");
  return io;
};

const getIO = () => {
  if (!io) {
    throw new Error("Socket.IO not initialized. Call initSocketIO first.");
  }
  return io;
};

const getConnectionCount = () => connectionCount;

const broadcastToRoom = (room, event, data) => {
  if (io) {
    io.to(room).emit(event, data);
    console.log(`📡 Broadcasted '${event}' to room '${room}'`);
  }
};

const broadcastToAll = (event, data) => {
  if (io) {
    io.emit(event, data);
    console.log(`📡 Broadcasted '${event}' to all clients`);
  }
};

module.exports = {
  initSocketIO,
  getIO,
  getConnectionCount,
  broadcastToRoom,
  broadcastToAll,
};
