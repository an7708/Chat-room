    const express = require('express');
    const http    = require('http');
    const { Server } = require('socket.io');
    const cors    = require('cors');

    const app = express();
    app.use(cors());

    const httpServer = http.createServer(app);

    const io = new Server(httpServer, {
    cors: {
        origin: 'http://localhost:5173',
        methods: ['GET', 'POST'],
    },
    });

    io.on('connection', (socket) => {
    console.log('Connected:', socket.id);

    // ── Store username on the socket ──────────────────────────────
    socket.on('set_username', (name) => {
        socket.data.username = name;
        console.log(`Username set: "${name}" (${socket.id})`);
    });

    // ── Join a room ───────────────────────────────────────────────
    socket.on('join_room', (roomName) => {
        // Leave old room first
        if (socket.data.currentRoom) {
        socket.leave(socket.data.currentRoom);
        socket.to(socket.data.currentRoom).emit('system_message', {
            text: `${socket.data.username} left the room.`,
        });
        }

        socket.join(roomName);
        socket.data.currentRoom = roomName;
        console.log(`"${socket.data.username}" joined room: ${roomName}`);

        socket.to(roomName).emit('system_message', {
        text: `${socket.data.username} joined #${roomName}!`,
        });
    });

    // ── Send message to current room ──────────────────────────────
    socket.on('send_message', (messageData) => {
        const room = socket.data.currentRoom;
        if (!room) return;

        // FIX: attach username from socket.data (server is authoritative)
        // and senderId so the client can detect "self" messages reliably
        io.to(room).emit('receive_message', {
        text:      messageData.text,
        timestamp: messageData.timestamp,
        username:  socket.data.username,   // ← server-sourced name
        senderId:  socket.id,              // ← lets client detect self
        room,
        });
    });

    // ── Typing indicator ──────────────────────────────────────────
    socket.on('typing', (isTyping) => {
        const room = socket.data.currentRoom;
        if (!room) return;

        // Broadcast to everyone in the room EXCEPT the sender
        socket.to(room).emit('user_typing', {
        username: socket.data.username,
        isTyping,
        });
    });

    // ── Disconnect ────────────────────────────────────────────────
    socket.on('disconnect', () => {
        const room = socket.data.currentRoom;
        if (room && socket.data.username) {
        socket.to(room).emit('system_message', {
            text: `${socket.data.username} disconnected.`,
        });
        }
        console.log(`Disconnected: ${socket.data.username || socket.id}`);
    });
    });

    httpServer.listen(3001, () => {
    console.log('✅ Server running on http://localhost:3001');
    });