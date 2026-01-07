const EventEmitter = require('events'); // 1. Wajib import ini

class GameLoop extends EventEmitter { // 2. Tambahkan extends EventEmitter
    constructor(trainManager, interlocking, io) {
        super(); // 3. Panggil super() di baris pertama constructor
        
        this.trainManager = trainManager;
        this.interlocking = interlocking;
        this.io = io;
        
        // --- SETTING WAKTU REAL-TIME ---
        const now = new Date();
        const currentHours = String(now.getHours()).padStart(2, '0');
        const currentMinutes = String(now.getMinutes()).padStart(2, '0');
        const currentSeconds = String(now.getSeconds()).padStart(2, '0');
        
        console.log(`🕒 GAME STARTED: Waktu disinkronkan ke ${currentHours}:${currentMinutes}:${currentSeconds}`);
        
        // Konversi ke detik
        this.gameTime = this.timeToSeconds(`${currentHours}:${currentMinutes}:${currentSeconds}`);
        
        this.speedFactor = 1; 
        this.isRunning = false;
    }

    start() {
        if (this.isRunning) return;
        this.isRunning = true;
        
        // Loop Utama (1 Detik sekali)
        this.interval = setInterval(() => {
            this.update();
        }, 1000 / this.speedFactor);
    }

    stop() {
        this.isRunning = false;
        clearInterval(this.interval);
    }

    update() {
        // 1. Update Waktu
        this.gameTime++;
        if (this.gameTime >= 86400) this.gameTime = 0; // Reset jam 24:00

        const timeString = this.secondsToTime(this.gameTime);

        // 2. EMIT EVENT 'tick' UNTUK app.js (INI YANG BIKIN ERROR SEBELUMNYA)
        this.emit('tick', timeString);

        // 3. Broadcast Waktu ke Client via Socket.io
        this.io.emit('time_update', { time: timeString });

        // 4. Update Logika Kereta
        this.trainManager.updateTrains(timeString, this.interlocking);
        
        // 5. Update Logika Sinyal (Berantai)
        this.interlocking.updateSignalChain(this.trainManager.activeTrains);

        // 6. Broadcast Data Kereta & Sinyal ke Client
        this.io.emit('train_update', this.trainManager.activeTrains);
        
        // Broadcast Status Sinyal
        for (let signalId in this.interlocking.signals) {
            this.io.emit('signal_update', { 
                id: signalId, 
                status: this.interlocking.signals[signalId].status 
            });
        }
    }

    timeToSeconds(timeStr) {
        const [h, m, s] = timeStr.split(':').map(Number);
        return (h * 3600) + (m * 60) + (s || 0);
    }

    secondsToTime(totalSeconds) {
        const h = Math.floor(totalSeconds / 3600);
        const m = Math.floor((totalSeconds % 3600) / 60);
        const s = totalSeconds % 60;
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }
}

module.exports = GameLoop;