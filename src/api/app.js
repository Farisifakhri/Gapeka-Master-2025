// src/api/app.js
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const GameManager = require('../core/GameManager'); // Import GameManager

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Serve static files from 'public' directory
app.use(express.static(path.join(__dirname, '../../public')));

// --- GAME INITIALIZATION ---
// Serahkan semua logika game ke GameManager
const gameManager = new GameManager(io);

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Akses game di http://localhost:${PORT}`);
});