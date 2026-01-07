const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

// 1. Import Class
const TrainManager = require('../core/TrainManager');
const Interlocking = require('../core/Interlocking');
const GameLoop = require('../core/GameLoop');

// 2. [TAMBAHAN BARU] Import Data Stasiun
const stationsData = require('../../data/stations.json'); 

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Setup Static Files
app.use(express.static(path.join(__dirname, '../../public')));
app.use(express.json());

// 3. [PERBAIKAN] Oper stationsData ke Interlocking
const interlocking = new Interlocking(stationsData); 
// ^^^ INI YANG TADI KETINGGALAN ^^^

const trainManager = new TrainManager(io, stationsData, interlocking); 
// Note: TrainManager juga butuh io, stationsData, dan interlocking sesuai urutan constructor-nya

const gameLoop = new GameLoop(trainManager, interlocking, io);

// Setup Event Listener
gameLoop.on('tick', (timeString) => {
    // console.log("Tick:", timeString);
});

// API Routes
app.post('/api/interlocking/request-route', (req, res) => {
    const { routeId, forcedAspect } = req.body;
    try {
        const result = interlocking.requestRoute(routeId, forcedAspect);
        res.json({ success: true, message: result });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
});

// Socket.io Connection
io.on('connection', (socket) => {
    console.log('User Connected');
    socket.emit('init_signals', interlocking.signals);
    socket.on('disconnect', () => {
        console.log('User Disconnected');
    });
});

// Start Game Loop & Server
gameLoop.start();

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Simulasi Gapeka Master 2025 siap beroperasi! 🚆`);
});