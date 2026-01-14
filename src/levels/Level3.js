// src/levels/Level3.js
const fs = require('fs');
const path = require('path');
const StationMap = require('../core/StationMap');
const TrainManager = require('../core/TrainManager');
const Interlocking = require('../core/Interlocking');

class Level3 {
    constructor(io) {
        this.io = io;
        this.isActive = false;
        this.isLoaded = false; // Flag penanda apakah data sukses dimuat
        this.gameInterval = null;

        try {
            console.log("Loading Level 3 Data...");
            
            // 1. LOAD DATA JSON
            const stationsData = JSON.parse(fs.readFileSync(path.join(__dirname, '../../data/stations_lvl3.json'), 'utf8'));
            const gapekaData = JSON.parse(fs.readFileSync(path.join(__dirname, '../../data/gapeka_lvl3.json'), 'utf8'));
            const interlockingData = JSON.parse(fs.readFileSync(path.join(__dirname, '../../data/interlocking_lvl3.json'), 'utf8'));

            // 2. INISIALISASI SYSTEM
            this.map = new StationMap(stationsData);
            
            // Cek jika map kosong (berarti gagal baca format)
            if (this.map.getStations().length === 0) {
                throw new Error("Data Stasiun Kosong atau Format Salah");
            }

            this.interlocking = new Interlocking(this.map, interlockingData); 
            this.trainManager = new TrainManager(this.io, this.map, this.interlocking); 
            this.trainManager.loadGapeka(gapekaData);
            
            this.isLoaded = true; // Tandai sukses
            console.log("=== LEVEL 3 DATA LOADED SUCCESSFULLY ===");

        } catch (err) {
            this.isLoaded = false;
            console.error("!!! FATAL ERROR LOADING LEVEL 3 !!!");
            console.error(err.message);
            // console.error(err.stack); // Uncomment jika butuh detail
        }
    }

    start() {
        if (this.isActive) return;
        
        // JANGAN START JIKA DATA GAGAL LOAD
        if (!this.isLoaded) {
            console.error("[Level 3] Tidak bisa Start karena data error.");
            this.io.emit('log_message', "Gagal memuat Level 3. Cek Server Log.");
            return;
        }

        this.isActive = true;
        console.log("=== LEVEL 3 STARTED ===");

        // GAME LOOP
        this.gameInterval = setInterval(() => {
            if (!this.isActive || !this.trainManager) return; // Double protection

            try {
                this.trainManager.update(); 
                
                // Kirim update ke frontend
                const trains = this.trainManager.getAllTrains();
                this.io.emit('train_update', trains);
                this.io.emit('signal_update', this.interlocking.getSignalStates());
            } catch (loopErr) {
                console.error("Error in Game Loop:", loopErr.message);
                this.stop(); // Stop game biar gak spam error
            }
        }, 1000);
    }

    stop() {
        this.isActive = false;
        if (this.gameInterval) {
            clearInterval(this.gameInterval);
            this.gameInterval = null;
        }
        console.log("=== LEVEL 3 STOPPED ===");
    }

    getMapData() {
        return this.isLoaded ? this.map.getStations() : [];
    }

    handleRouteRequest(data) {
        if (!this.isActive || !this.isLoaded) return;
        this.interlocking.setRoute(data.startSignal, data.endSignal);
    }
}

module.exports = Level3;