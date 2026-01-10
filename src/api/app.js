const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

// 1. Import Class Core
const TrainManager = require('../core/TrainManager');
const Interlocking = require('../core/Interlocking');
const GameLoop = require('../core/GameLoop');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Setup Static Files
app.use(express.static(path.join(__dirname, '../../public')));
app.use(express.json());

// --- INISIALISASI GAME ---

// 1. Interlocking (Sinyal & Wesel)
// Tidak perlu pass stationsData, dia load sendiri dari stations.json
const interlocking = new Interlocking(); 

// 2. TrainManager (Logika Kereta)
// Butuh IO buat lapor posisi, dan Interlocking buat cek sinyal
const trainManager = new TrainManager(io, interlocking); 

// 3. GameLoop (Detak Jantung Waktu)
const gameLoop = new GameLoop(trainManager, interlocking, io);

// --- EVENT LISTENER ---

// Socket.io Connection (Interaksi UI Dispatcher)
io.on('connection', (socket) => {
    console.log('👨‍✈️ Dispatcher Terhubung.');

    // 1. Kirim Status Sinyal Awal (Biar UI sinkron)
    socket.emit('init_signals', interlocking.getAllSignals());

    // 2. Dispatcher Klik Sinyal (Toggle Merah/Hijau)
    socket.on('toggle_signal', (data) => {
        const { stationId, signalId, status } = data;
        
        // Update di Server
        const success = interlocking.setSignal(stationId, signalId, status);
        
        if (success) {
            // Update balik ke UI (Biar warna tombol berubah)
            // Kirim stationId juga biar script.js bisa cari tombolnya
            io.emit('signal_update', { stationId, signalId, status });
        }
    });

    socket.on('disconnect', () => {
        console.log('Dispatcher Terputus.');
    });
});

// Debug Log Tick (Opsional, matikan kalau spam)
gameLoop.on('tick', (timeString) => {
    // console.log("Tick:", timeString); 
});

// Start Game Loop
gameLoop.start();

// Start Server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`\n==================================================`);
    console.log(`🚄 TANGERANG LINE DISPATCHER SYSTEM (GAPEKA 2025)`);
    console.log(`==================================================`);
    console.log(`Server aktif di http://localhost:${PORT}`);
    console.log(`Siap menerima perintah Dispatcher...`);
});