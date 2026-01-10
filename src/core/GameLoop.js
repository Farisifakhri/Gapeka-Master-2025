const EventEmitter = require('events');

class GameLoop extends EventEmitter {
    constructor(trainManager, interlocking, io) {
        super();
        this.trainManager = trainManager;
        this.interlocking = interlocking;
        this.io = io;
        
        // --- SETTING WAKTU (Mulai jam 04:00 pagi sesuai Gapeka) ---
        // Biar langsung kerasa simulasi paginya
        this.gameTime = this.timeToSeconds("04:00:00"); 
        
        console.log(`🕒 GAME STARTED: Waktu simulasi mulai 04:00:00`);
        
        this.speedFactor = 1; // 1 detik = 1 detik (Realtime)
        this.isRunning = false;
        this.interval = null;
    }

    start() {
        if (this.isRunning) return;
        this.isRunning = true;
        
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
        if (this.gameTime >= 86400) this.gameTime = 0; // Reset 24:00

        const timeString = this.secondsToTime(this.gameTime);

        // 2. Emit Tick (Internal)
        this.emit('tick', timeString);

        // 3. Broadcast Waktu ke Client (UI)
        this.io.emit('time_update', timeString);

        // 4. Update Logika Kereta (Physics & Movement)
        // TrainManager akan membaca sinyal sendiri dari Interlocking saat update
        this.trainManager.updateTrains(timeString);
        
        // CATATAN: 
        // updateSignalChain DIHAPUS karena sistem sekarang Manual Dispatcher.
        // TrainManager sudah otomatis ngerem kalau sinyal merah.
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