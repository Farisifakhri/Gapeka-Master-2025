const EventEmitter = require('events');

class GameLoop extends EventEmitter {
    constructor() {
        super();
        // SET START TIME: 04:30:00
        this.gameTime = new Date("2025-07-01T04:30:00"); 
        this.isPlaying = false;
    }

    start() {
        this.isPlaying = true;
        console.log(`>>> GAME START: Waktu Realtime Dimulai ${this.formatTime()} <<<`);
        
        setInterval(() => {
            if (this.isPlaying) {
                this.gameTime.setSeconds(this.gameTime.getSeconds() + 1);
                this.emit('tick', this.formatTime()); 
            }
        }, 1000); 
    }

    formatTime() {
        return this.gameTime.toTimeString().substring(0, 8);
    }
}

module.exports = new GameLoop();