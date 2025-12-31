const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');

const gameLoop = require('../core/GameLoop');
const InterlockingSystem = require('../core/Interlocking');
const TrainManager = require('../core/TrainManager');
const stationData = require('../../data/stations.json');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, { cors: { origin: "*" } });

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../../public')));

// INIT SYSTEM
const interlocking = new InterlockingSystem(stationData);
const trainManager = new TrainManager(io, stationData, interlocking);

// SOCKET
io.on('connection', (socket) => {
    socket.emit('init_signals', stationData.signals); 
});

// GAMELOOP
gameLoop.on('tick', (gameTime) => {
    io.emit('time_update', { time: gameTime });
    trainManager.onTick(gameTime);
});

// --- API INTERLOCKING (LOGIC SINYAL BERANTAI) ---
app.post('/api/interlocking/request-route', (req, res) => {
    const { routeId, forcedAspect } = req.body; 
    let aspectToSet = forcedAspect; // 1. Prioritas Utama: Perintah Suara

    // Jika tidak ada perintah suara (AUTO MODE), gunakan logika sistem
    if (!aspectToSet) {
        
        // A. LOGIKA SINYAL KELUAR (Cek Waktu Keberangkatan)
        if (routeId.includes('OUT')) {
            const trackId = routeId.includes('J1') ? 1 : 2;
            // Panggil TrainManager untuk hitung selisih waktu
            aspectToSet = trainManager.getDepartureAspect(trackId);
        } 
        
        // B. LOGIKA SINYAL MASUK (Sinyal Berantai / Distant Signal)
        else if (routeId.includes('IN')) {
            // Cek Sinyal Keluar di depannya
            const trackId = routeId.includes('J1') ? 1 : 2;
            const outSignalName = `S_OUT_J${trackId}`;
            const outSignalAspect = stationData.signals[outSignalName].aspect;

            // RUMUS BERANTAI:
            if (outSignalAspect === 'RED') {
                // Depan Merah -> Masuk Kuning (Hati-hati)
                aspectToSet = 'YELLOW';
                console.log(`[LOGIC] Sinyal Keluar J${trackId} Tertutup. Sinyal Masuk set KUNING.`);
            } else {
                // Depan Hijau -> Masuk Hijau (Aman)
                aspectToSet = 'GREEN';
                console.log(`[LOGIC] Sinyal Keluar J${trackId} Terbuka. Sinyal Masuk set HIJAU.`);
            }
        }
    }

    // Eksekusi ke Interlocking Core
    const result = interlocking.requestRoute(routeId, aspectToSet);
    
    if (result.success) {
        io.emit('signal_update', result.signalUpdate);
        res.json({ status: 'success', message: result.message });
    } else {
        res.status(409).json({ status: 'failed', reason: result.reason });
    }
});

const PORT = 3000;
server.listen(PORT, () => {
    console.log(`Panel PPKA Cawang siap di http://localhost:${PORT}`);
    gameLoop.start(); 
});