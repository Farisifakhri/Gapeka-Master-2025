// src/levels/Level1.js
const fs = require('fs');
const path = require('path');
const StationMap = require('../core/StationMap');
const TrainManager = require('../core/TrainManager');

class Level1 {
    constructor(io) {
        this.io = io;
        this.isActive = false;
        this.gameTime = 0;
        
        // STATE TUTORIAL
        this.tutorialStep = 0;
        this.tutorialCompleted = false;

        try {
            console.log("Loading Level 1: Maseng Tutorial...");
            const stationsData = JSON.parse(fs.readFileSync(path.join(__dirname, '../../data/stations_lvl1.json'), 'utf8'));
            const gapekaData = JSON.parse(fs.readFileSync(path.join(__dirname, '../../data/gapeka_lvl1.json'), 'utf8'));

            this.map = new StationMap(stationsData);
            
            // State Sinyal & Wesel
            this.state = { signals: {}, switches: {} };
            this.initInterlocking();

            this.trainManager = new TrainManager(this.io, this.map, this); 
            this.trainManager.loadGapeka(gapekaData);

            console.log("=== LEVEL 1 READY ===");

        } catch (err) { console.error(err); }
    }

    initInterlocking() {
        const station = this.map.getStations()[0];
        station.switches.forEach(w => this.state.switches[w.id] = w.position);
        station.signals.forEach(s => this.state.signals[s.id] = { ...s });
    }

    start() {
        if (this.isActive) return;
        this.isActive = true;
        
        // --- MULAI TUTORIAL LANGKAH 1 ---
        setTimeout(() => {
            this.sendTutorialPopup("SELAMAT DATANG, PPKA!", "Tugas Anda: Masukkan KA Pangrango ke Jalur 2 (Lurus). Pastikan Wesel mengarah ke Jalur 2.");
            this.tutorialStep = 1;
        }, 1000);

        // Game Loop
        this.gameInterval = setInterval(() => {
            this.gameTime++;
            this.trainManager.update(this.gameTime);
            
            // Cek Kondisi Tutorial
            this.checkTutorialProgress();

            this.io.emit('game_update', {
                time: this.gameTime,
                trains: this.trainManager.getAllTrains(),
                signals: this.state.signals,
                switches: this.state.switches
            });
        }, 1000);
    }

    // --- LOGIKA TUTORIAL PINTAR ---
    checkTutorialProgress() {
        if(this.tutorialCompleted) return;

        // STEP 1: Pemain harus memastikan Wesel Lurus & Buka Sinyal Masuk (J1)
        if (this.tutorialStep === 1) {
            const j1 = this.state.signals['J1'];
            if (j1 && j1.aspect === 'GREEN') {
                this.sendTutorialPopup("BAGUS!", "Sinyal Masuk sudah Hijau. Kereta diizinkan masuk.");
                this.tutorialStep = 2; // Lanjut ke step menunggu
            }
        }
        
        // STEP 2: Kereta Sampai
        if (this.tutorialStep === 2) {
            const trains = this.trainManager.getAllTrains();
            const train = trains[0];
            if (train && train.status === 'STOPPED_AT_STATION') {
                this.sendTutorialPopup("KERETA TIBA!", "Kereta berhenti sempurna. Jadwal berangkat sudah tiba. Klik Sinyal Keluar (J2)!");
                this.tutorialStep = 3;
            }
        }

        // STEP 3: Berangkat
        if (this.tutorialStep === 3) {
            const j2 = this.state.signals['J2'];
            if (j2 && j2.aspect === 'GREEN') {
                 // Manual berangkatkan kereta (override logic manager utk tutorial)
                 const trains = this.trainManager.getAllTrains();
                 if(trains[0]) {
                     trains[0].status = 'MOVING';
                     trains[0].action = 'PASS'; // Biar jalan terus sampai ujung
                     trains[0].targetX = 2000;
                     trains[0].currentSpeed = 0.5; // Akselerasi awal
                 }

                 this.sendTutorialPopup("SELESAI!", "Kereta berhasil diberangkatkan. Anda lulus tutorial dasar!");
                 this.tutorialCompleted = true;
            }
        }
    }

    sendTutorialPopup(title, msg) {
        this.io.emit('tutorial_popup', { title: title, message: msg });
    }

    // ... (stop, getMapData sama seperti sebelumnya) ...
    stop() { this.isActive = false; clearInterval(this.gameInterval); }
    getMapData() { return this.map.getStations(); }

    handleInput(action, data) {
        if (!this.isActive) return;

        if (action === 'toggle_switch') {
            const curr = this.state.switches[data.switchId];
            this.state.switches[data.switchId] = (curr === 'NORMAL') ? 'REVERSE' : 'NORMAL';
            // Safety: Merahkan sinyal jika wesel gerak
            Object.values(this.state.signals).forEach(s => { if(s.linked_switch === data.switchId) s.aspect = 'RED'; });
        } 
        else if (action === 'set_signal') {
            const sig = this.state.signals[data.signalId];
            if(sig) {
                // Logic Sinyal Sederhana
                if(sig.aspect !== 'RED') sig.aspect = 'RED';
                else {
                    const swPos = this.state.switches[sig.linked_switch];
                    // Kalau Wesel Lurus (NORMAL) -> Hijau, Kalau Belok -> Kuning
                    sig.aspect = (swPos === 'NORMAL') ? 'GREEN' : 'YELLOW';
                }
            }
        }
    }
}

module.exports = Level1;