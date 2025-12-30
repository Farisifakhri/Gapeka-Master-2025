const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');

// --- IMPORT LOGIC ---
const gameLoop = require('../core/GameLoop');
const InterlockingSystem = require('../core/Interlocking');
const TrainManager = require('../core/TrainManager'); // <--- PENTING

// --- LOAD DATA ---
const stationData = require('../../data/stations.json'); 
const interlockingTable = require('../../data/interlocking_table.json');

// --- SETUP SERVER ---
const app = express();
const server = http.createServer(app);
const io = socketIo(server, { cors: { origin: "*" } });

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../../public'))); // Serve Frontend

// Route Peredam Error Chrome
app.get('/.well-known/appspecific/com.chrome.devtools.json', (req, res) => res.sendStatus(204));

// --- INISIALISASI GAME ENGINE ---
// 1. Sistem Interlocking (Pengatur Sinyal)
const vpi = new InterlockingSystem(stationData);
// 2. Train Manager (Pengatur Kereta) - Masukkan 'io' dan 'stationData'
const trainManager = new TrainManager(io, stationData);

// --- SOCKET IO (REALTIME) ---
io.on('connection', (socket) => {
    console.log('>>> User Frontend Masuk <<<');
    socket.emit('init_station', stationData);
});

// --- GAMELOOP (DETAK JANTUNG GAME) ---
gameLoop.on('tick', (gameTime) => {
    // 1. Kirim Waktu ke Frontend
    io.emit('time_update', { time: gameTime });
    
    // 2. Update Pergerakan Kereta
    trainManager.onTick(gameTime);
});

// --- API ENDPOINTS (TOMBOL-TOMBOL) ---
app.post('/api/route', (req, res) => {
    const { routeId } = req.body;
    const result = vpi.requestRoute(routeId); // Minta Interlocking

    if (result.success) {
        // Cari warna sinyal dari tabel
        const routeDef = interlockingTable.routes[routeId];
        const color = routeDef ? routeDef.signal_aspect : 'GREEN';

        // Kirim update ke Frontend
        io.emit('signal_update', { routeId, status: 'SECURE', signalAspect: color });
        
        // Kirim juga update track (reserved/occupied)
        io.emit('track_update', stationData.tracks);

        res.json({ status: 'success', message: result.message });
    } else {
        res.status(409).json({ status: 'failed', reason: result.reason });
    }
});

app.post('/api/release-route', (req, res) => {
    const { routeId } = req.body;
    vpi.releaseRoute(routeId);
    io.emit('signal_update', { routeId, status: 'IDLE', signalAspect: 'RED' });
    res.json({ status: 'success' });
});

// --- START SERVER ---
const PORT = 3000;
server.listen(PORT, () => {
    console.log(`Server PPKA siap di http://localhost:${PORT}`);
    gameLoop.start(); 
});