const stationsData = require('../../data/stations.json');
const gapekaData = require('../../data/gapeka_lvl1.json');
const gameLoop = require('../core/GameLoop');
const TrainManager = require('../core/TrainManager');
const Interlocking = require('../core/Interlocking');

class Level1 {
    constructor() {
        this.lineName = stationsData.line_name;
        this.interlocking = new Interlocking(); // Inisialisasi Sinyal
        this.trainManager = null; // Nanti diisi pas init
        this.io = null; // Socket.IO instance
    }

    // Dipanggil dari app.js saat server start
    init(io) {
        this.io = io;
        this.trainManager = new TrainManager(io, this.interlocking);

        console.log(`\n=== 🎮 CONTROL CENTER: ${this.lineName.toUpperCase()} ===`);
        console.log(`Misi: Atur perjalanan KRL & KA Bandara (Duri - Tangerang)`);
        
        // --- EVENT LISTENER DARI CLIENT (UI) ---
        this.io.on('connection', (socket) => {
            console.log('👨‍✈️ Dispatcher terhubung ke Pusat Kontrol.');

            // Kirim status awal sinyal ke UI pas baru connect
            socket.emit('init_signals', this.interlocking.getAllSignals());

            // Kalau Dispatcher klik sinyal di UI
            socket.on('toggle_signal', (data) => {
                const { stationId, signalId, status } = data;
                const success = this.interlocking.setSignal(stationId, signalId, status);
                
                if (success) {
                    // Broadcast update ke semua layar
                    this.io.emit('signal_update', { stationId, signalId, status });
                }
            });

            // Kalau Dispatcher menyetujui keberangkatan (Departure)
            socket.on('dispatch_train', (trainId) => {
                this.trainManager.dispatchTrain(trainId);
            });
        });

        // --- GAME LOOP (Detak Jantung Game) ---
        // Asumsi: 1 detik dunia nyata = 1 menit di game (biar cepet)
        // Atau 1 detik = 1 detik (realtime). Kita pakai realtime dulu.
        let gameTimeHours = 4;
        let gameTimeMinutes = 20;
        let gameTimeSeconds = 0;

        gameLoop.on('tick', (deltaTime) => {
            // Update Waktu Game
            gameTimeSeconds++;
            if (gameTimeSeconds >= 60) {
                gameTimeSeconds = 0;
                gameTimeMinutes++;
            }
            if (gameTimeMinutes >= 60) {
                gameTimeMinutes = 0;
                gameTimeHours++;
            }

            // Format HH:MM:SS
            const pad = (n) => n < 10 ? '0' + n : n;
            const timeString = `${pad(gameTimeHours)}:${pad(gameTimeMinutes)}:${pad(gameTimeSeconds)}`;

            // Kirim waktu ke UI
            this.io.emit('time_update', timeString);

            // Update Logika Kereta
            this.trainManager.updateTrains(timeString);
        });

        // Mulai Loop
        gameLoop.start();
    }
}

module.exports = new Level1();