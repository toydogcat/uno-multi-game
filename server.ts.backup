import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";

interface Player {
  id: string;
  name: string;
  isHost: boolean;
}

interface SignalMessage {
  from: string;
  to: string;
  type: string;
  data: any;
}

interface Room {
  id: string;
  hostId: string;
  players: Player[];
  locked: boolean;
  signals: SignalMessage[];
  createdAt: number;
}

const app = express();
const PORT = 3000;

// Middleware
app.use(express.json());

// In-memory Room Storage
const rooms = new Map<string, Room>();

// Cleanup stale rooms (older than 2 hours) periodically
setInterval(() => {
  const now = Date.now();
  for (const [roomId, room] of rooms.entries()) {
    if (now - room.createdAt > 2 * 60 * 60 * 1000) {
      rooms.delete(roomId);
    }
  }
}, 30 * 60 * 1000);

// Helper to generate unique short IDs
function generateId(length = 6): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// REST API Endpoints

// Create a new room
app.post("/api/rooms/create", (req, res) => {
  const { hostName } = req.body;
  if (!hostName || typeof hostName !== "string") {
    return res.status(400).json({ error: "Host name is required" });
  }

  const roomId = generateId(5);
  const hostId = generateId(8);

  const newRoom: Room = {
    id: roomId,
    hostId,
    players: [
      {
        id: hostId,
        name: hostName.trim(),
        isHost: true,
      },
    ],
    locked: false,
    signals: [],
    createdAt: Date.now(),
  };

  rooms.set(roomId, newRoom);
  console.log(`[Room Created] ID: ${roomId}, Host: ${hostName} (${hostId})`);

  return res.json({ roomId, playerId: hostId });
});

// Join an existing room
app.post("/api/rooms/join", (req, res) => {
  const { roomId, playerName } = req.body;
  
  if (!roomId || typeof roomId !== "string") {
    return res.status(400).json({ error: "Room ID is required" });
  }
  if (!playerName || typeof playerName !== "string") {
    return res.status(400).json({ error: "Player name is required" });
  }

  const cleanRoomId = roomId.toUpperCase().trim();
  const room = rooms.get(cleanRoomId);

  if (!room) {
    return res.status(404).json({ error: "找不到該房間，請檢查房間代碼是否正確" });
  }

  if (room.locked) {
    return res.status(400).json({ error: "遊戲已經開始，此房間已鎖定" });
  }

  if (room.players.length >= 10) {
    return res.status(400).json({ error: "房間人數已滿 (最大 10 人)" });
  }

  const playerId = generateId(8);
  const newPlayer: Player = {
    id: playerId,
    name: playerName.trim(),
    isHost: false,
  };

  room.players.push(newPlayer);
  console.log(`[Player Joined] Room: ${cleanRoomId}, Player: ${playerName} (${playerId})`);

  return res.json({ roomId: cleanRoomId, playerId, players: room.players });
});

// Get player list for a room
app.get("/api/rooms/:roomId/players", (req, res) => {
  const { roomId } = req.params;
  const room = rooms.get(roomId.toUpperCase());

  if (!room) {
    return res.status(404).json({ error: "Room not found" });
  }

  return res.json({ players: room.players, locked: room.locked });
});

// Lock/Unlock the room (Host only can do this)
app.post("/api/rooms/:roomId/lock", (req, res) => {
  const { roomId } = req.params;
  const { playerId } = req.body;

  const room = rooms.get(roomId.toUpperCase());
  if (!room) {
    return res.status(404).json({ error: "Room not found" });
  }

  if (room.hostId !== playerId) {
    return res.status(403).json({ error: "Only the host can modify room locks" });
  }

  room.locked = true;
  console.log(`[Room Locked] ID: ${roomId}`);
  return res.json({ success: true, locked: room.locked });
});

// Send a WebRTC negotiation signal
app.post("/api/rooms/:roomId/signal", (req, res) => {
  const { roomId } = req.params;
  const { from, to, type, data } = req.body;

  if (!from || !to || !type || !data) {
    return res.status(400).json({ error: "Missing signaling fields" });
  }

  const room = rooms.get(roomId.toUpperCase());
  if (!room) {
    return res.status(404).json({ error: "Room not found" });
  }

  // Add the signal message to our queue
  room.signals.push({ from, to, type, data });
  return res.json({ success: true });
});

// Poll/Retrieve signaling messages for a specific player (removes from queue after reading)
app.get("/api/rooms/:roomId/signals/:playerId", (req, res) => {
  const { roomId, playerId } = req.params;
  const room = rooms.get(roomId.toUpperCase());

  if (!room) {
    return res.status(404).json({ error: "Room not found" });
  }

  // Filter messages destined for this player
  const playerSignals = room.signals.filter((s) => s.to === playerId);
  
  // Remove these retrieved messages from the room signals queue (keeping others)
  room.signals = room.signals.filter((s) => s.to !== playerId);

  return res.json({ signals: playerSignals });
});

// Leave room
app.post("/api/rooms/:roomId/leave", (req, res) => {
  const { roomId } = req.params;
  const { playerId } = req.body;

  const room = rooms.get(roomId.toUpperCase());
  if (!room) {
    return res.status(404).json({ error: "Room not found" });
  }

  const playerIndex = room.players.findIndex((p) => p.id === playerId);
  if (playerIndex !== -1) {
    const leftPlayer = room.players[playerIndex];
    room.players.splice(playerIndex, 1);
    console.log(`[Player Left] Room: ${roomId}, Player: ${leftPlayer.name} (${playerId})`);

    // If host leaves, assign a new host if players are still there, otherwise dissolve room
    if (leftPlayer.isHost) {
      if (room.players.length > 0) {
        room.players[0].isHost = true;
        room.hostId = room.players[0].id;
        console.log(`[Host Promoted] Room: ${roomId}, New Host: ${room.players[0].name} (${room.players[0].id})`);
      } else {
        rooms.delete(roomId.toUpperCase());
        console.log(`[Room Deleted] Room ${roomId} is empty now.`);
      }
    }
  }

  return res.json({ success: true });
});

// Serve frontend assets / SPA Fallback via Vite (or static files in production)
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    // Serve client index.html for all other routes
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[Server Ready] Runs on http://0.0.0.0:${PORT}`);
  });
}

startServer();
