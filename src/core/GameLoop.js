class GameLoop {
    constructor(io, trainManager, signalManager) {
        this.io = io;
        this.trainManager = trainManager;
        this.signalManager = signalManager;
        this.isRunning = false;
        
        // SET WAKTU SESUAI REAL-TIME SAAT INI
        const now = new Date();
        this.gameTime = this.formatTime(now);
        
        this.lastUpdate = Date.now();
    }

    start() {
        if (this.isRunning) return;
        this.isRunning = true;
        
        console.log(`[GAME] Started at Real Time: ${this.gameTime}`);
        
        this.interval = setInterval(() => {
            this.update();
        }, 1000); // 1 detik dunia nyata = 1 detik game
    }

    update() {
        // Update Waktu (Increment 1 detik)
        this.incrementTime();
        
        // Update Logika Kereta & Sinyal
        this.trainManager.updateTrains(this.gameTime);
        // this.signalManager.updateSignals(); // Jika ada logika auto-signal

        // Kirim Waktu ke Client
        this.io.emit('time_update', this.gameTime);
    }

    stop() {
        this.isRunning = false;
        clearInterval(this.interval);
    }

    incrementTime() {
        let [hh, mm, ss] = this.gameTime.split(':').map(Number);
        ss++;
        if (ss >= 60) { ss = 0; mm++; }
        if (mm >= 60) { mm = 0; hh++; }
        if (hh >= 24) { hh = 0; }
        
        this.gameTime = [
            hh.toString().padStart(2, '0'),
            mm.toString().padStart(2, '0'),
            ss.toString().padStart(2, '0')
        ].join(':');
    }
    
    formatTime(date) {
        return [
            date.getHours().toString().padStart(2, '0'),
            date.getMinutes().toString().padStart(2, '0'),
            date.getSeconds().toString().padStart(2, '0')
        ].join(':');
    }
}

module.exports = GameLoop;