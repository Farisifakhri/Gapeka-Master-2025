const EventEmitter = require('events');

class GameLoop extends EventEmitter {
    constructor() {
        super();
        this.gameTime = new Date("2025-02-01T08:40:00"); // Start jam 08:40
        this.isPlaying = false;
    }

    start() {
        this.isPlaying = true;
        console.log(`>>> GAME START: Waktu Server ${this.formatTime()} <<<`);
        
        // Loop setiap 1 detik (1000ms) = nambah 1 menit waktu game
        setInterval(() => {
            if (this.isPlaying) {
                this.gameTime.setMinutes(this.gameTime.getMinutes() + 1);
                this.emit('tick', this.formatTime()); // Broadcast waktu ke semua sistem
            }
        }, 1000); 
    }

    formatTime() {
        return this.gameTime.toTimeString().substring(0, 5); // Ambil "HH:MM"
    }
}

module.exports = new GameLoop();