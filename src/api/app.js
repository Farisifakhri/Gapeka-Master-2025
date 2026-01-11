const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

// Import Class Core
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
const interlocking = new Interlocking(); 
const trainManager = new TrainManager(io, interlocking); 

// [FIX] Urutan parameter HARUS: (io, trainManager, interlocking)
// Sebelumnya terbalik, makanya updateTrains error/tidak jalan
const gameLoop = new GameLoop(io, trainManager, interlocking);

// --- EVENT LISTENER ---
io.on('connection', (socket) => {
    console.log('👨‍✈️ Dispatcher Terhubung.');

    // Kirim Data Awal
    socket.emit('init_signals', interlocking.getAllSignals());
    
    // Kirim Posisi Kereta Terakhir (Supaya gak nunggu update detik berikutnya)
    socket.emit('train_update', trainManager.activeTrains);

    // Toggle Sinyal
    socket.on('toggle_signal', (data) => {
        const { stationId, signalId, targetStatus } = data;
        const success = interlocking.setSignal(stationId, signalId, targetStatus);
        
        if (success) {
            io.emit('signal_update', { stationId, signalId, status: targetStatus });
        }
    });
    
    // [FITUR BARU] Manual Spawn untuk Testing
    // Ketik di console browser: socket.emit('debug_spawn')
    socket.on('debug_spawn', () => {
        console.log("🛠️ DEBUG: Memaksa spawn kereta uji coba...");
        trainManager.forceSpawnDebug();
    });

    socket.on('disconnect', () => {
        console.log('Dispatcher Terputus.');
    });
});

// Start Loop
gameLoop.start();

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`✅ Server berjalan di http://localhost:${PORT}`);
});