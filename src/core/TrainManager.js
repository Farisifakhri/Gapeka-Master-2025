const gapekaData = require('../../data/gapeka_lvl1.json');

class TrainManager {
    constructor(io, stationData, interlocking) {
        this.io = io;
        this.station = stationData;
        this.interlocking = interlocking;
        this.activeTrains = [];
        this.completedTrains = [];
        this.gameTimeStr = "04:30:00"; 
        
        // Parameter Fisika
        this.TRAVEL_TIME_DRN_CW = 75; 
        this.TRAVEL_TIME_TBT_CW = 61; 
    }

    onTick(gameTime) {
        this.gameTimeStr = gameTime;
        this.spawnCheck(gameTime);
        this.updatePhysics(gameTime);
    }

    log(message) {
        console.log(`[${this.gameTimeStr}] ${message}`);
    }

    // --- FUNGSI BARU: HITUNG ASPEK SINYAL KELUAR ---
    getDepartureAspect(trackId) {
        // Cari kereta yang sedang DWELLING di jalur tersebut
        const train = this.activeTrains.find(t => t.track_dest === trackId && t.status === 'DWELLING');
        
        if (!train) return 'GREEN'; // Default Hijau kalau tidak ada kereta (atau kereta langsir)

        const schDepSeconds = this.timeToSeconds(train.schedule.departure);
        const currSeconds = this.timeToSeconds(this.gameTimeStr);
        
        // Hitung selisih: Jadwal - Sekarang
        // Positif = Belum waktunya (Kepagian)
        // Negatif = Sudah lewat jadwal (Telat)
        const diff = schDepSeconds - currSeconds;

        // LOGIKA KRL:
        // Jika lebih cepat dari 2 menit (120 detik) -> KUNING (Hati-hati, maks 40 km/h)
        // Jika sisa waktu <= 2 menit atau sudah telat -> HIJAU (Aman, Gaspol)
        if (diff > 120) {
            this.log(`[ASPEK] KA ${train.ka_id} terlalu awal (${diff}s). Sinyal KUNING.`);
            return 'YELLOW';
        } else {
            return 'GREEN';
        }
    }

    spawnCheck(currentTime) {
        // ... (Kode spawnCheck SAMA SEPERTI SEBELUMNYA, tidak berubah) ...
        gapekaData.forEach(train => {
            if (this.completedTrains.includes(train.ka_id)) return;
            if (this.activeTrains.find(t => t.ka_id === train.ka_id)) return;

            const scheduledTime = this.timeToSeconds(train.schedule.arrival);
            const currentSeconds = this.timeToSeconds(currentTime);
            
            if (currentSeconds >= scheduledTime - 180 && currentSeconds < scheduledTime + 60) {
                const performanceFactor = 0.85 + (Math.random() * 0.4); 
                let load = (train.track_dest === 1) ? (80 + Math.floor(Math.random() * 21)) : (10 + Math.floor(Math.random() * 40));

                this.activeTrains.push({
                    ...train,
                    status: 'APPROACHING',
                    info: `Lepas ${train.origin_stn}`,
                    distanceToSignal: 1200, 
                    currentSpeedMs: 20, 
                    displaySpeed: 0,    
                    passengerLoad: load, 
                    perfFactor: performanceFactor,
                    actualArrival: null, 
                    arrivalStatus: null 
                });
                this.log(`[TRAIN] KA ${train.ka_id} muncul. Load: ${load}%`);
                this.broadcast();
            }
        });
    }

    updatePhysics(gameTime) {
        let changed = false;
        this.activeTrains.forEach(t => {
            
            // FASE 1 & 2 (APPROACHING & ENTERING) SAMA SEPERTI SEBELUMNYA...
             if (t.status === 'APPROACHING') {
                t.distanceToSignal -= (t.currentSpeedMs / t.perfFactor);
                // Update display speed noise
                t.displaySpeed = Math.floor((t.currentSpeedMs * 3.6));

                if (t.distanceToSignal <= 0) {
                    const sigName = t.track_dest === 1 ? 'S_IN_J1' : 'S_IN_J2';
                    const aspect = this.station.signals[sigName].aspect;

                    if (aspect === 'GREEN' || aspect === 'YELLOW') {
                        t.status = 'ENTERING';
                        t.info = 'Masuk Cawang';
                        t.distanceToSignal = 200; 
                        t.currentSpeedMs = 15; 
                        this.interlocking.normalizeSignal(sigName);
                        this.io.emit('signal_update', { id: sigName, aspect: 'RED' });
                        changed = true;
                    } else {
                        t.currentSpeedMs = 0; 
                        t.displaySpeed = 0;
                        t.info = 'Tertahan Sinyal Masuk';
                        t.distanceToSignal = 0;
                    }
                }
            }
            else if (t.status === 'ENTERING') {
                t.distanceToSignal -= 12; 
                t.displaySpeed = Math.floor((t.currentSpeedMs * 3.6));
                
                if (t.distanceToSignal <= 0) {
                    t.status = 'DWELLING';
                    t.info = 'Naik Turun Penumpang';
                    t.currentSpeedMs = 0;
                    t.displaySpeed = 0;
                    t.actualArrival = gameTime; 
                    
                    const schArr = this.timeToSeconds(t.schedule.arrival);
                    const actArr = this.timeToSeconds(gameTime);
                    const diff = actArr - schArr;
                    if (diff < -10) t.arrivalStatus = 'EARLY';
                    else if (diff <= 60) t.arrivalStatus = 'ONTIME';
                    else t.arrivalStatus = 'LATE';

                    changed = true;
                    t.dwellTimer = 20; 
                }
            }

            // FASE 3: DWELLING
            else if (t.status === 'DWELLING') {
                t.displaySpeed = 0;
                
                if (t.dwellTimer > 0) {
                    t.dwellTimer--; 
                    t.info = `Boarding... (${t.dwellTimer}s)`;
                    changed = true;
                } else {
                    const sigOut = t.track_dest === 1 ? 'S_OUT_J1' : 'S_OUT_J2';
                    const aspect = this.station.signals[sigOut].aspect;

                    // LOGIKA BERANGKAT
                    if (aspect === 'GREEN' || aspect === 'YELLOW') {
                        this.calculateScore(t, gameTime);

                        t.status = 'DEPARTING';
                        t.info = 'Meninggalkan Cawang';
                        
                        // --- LOGIKA KECEPATAN BERDASARKAN WARNA SINYAL ---
                        if (aspect === 'YELLOW') {
                            t.currentSpeedMs = 11; // ~40 km/h (Hati-hati)
                            t.speedLimit = 40;     // Flag limit
                        } else {
                            t.currentSpeedMs = 20; // ~72 km/h (Normal)
                            t.speedLimit = 80;
                        }

                        this.interlocking.normalizeSignal(sigOut);
                        this.io.emit('signal_update', { id: sigOut, aspect: 'RED' });
                        changed = true;
                        
                        setTimeout(() => {
                            this.completedTrains.push(t.ka_id);
                            this.activeTrains = this.activeTrains.filter(tr => tr.ka_id !== t.ka_id);
                            this.broadcast();
                        }, 4000);
                    } else {
                        t.info = `SIAP BERANGKAT! (Buka Sinyal)`;
                        changed = true; 
                    }
                }
            }
            
            // FASE 4: BERANGKAT (DEPARTING)
            else if (t.status === 'DEPARTING') {
                // Update kecepatan visual
                let baseSpeed = 0;
                
                // Jika limit 40 km/h (Kuning), jangan ngebut
                if (t.speedLimit === 40) {
                    baseSpeed = 38 + Math.random() * 4; // 38-42 km/h
                } else {
                    baseSpeed = 60 + Math.random() * 10; // 60-70 km/h
                }
                
                t.displaySpeed = Math.floor(baseSpeed);
            }
        });

        this.broadcast();
    }

    calculateScore(train, actualDepartureTime) {
        // ... (Logic Score SAMA SEPERTI SEBELUMNYA) ...
        const schDep = this.timeToSeconds(train.schedule.departure);
        const actDep = this.timeToSeconds(actualDepartureTime);
        const isDepLate = (actDep - schDep) > 60; 

        let score = 0; let reason = "";

        if (train.arrivalStatus === 'EARLY') {
            score = 100; reason = "Sempurna! Operasional Efisien.";
        } else if (train.arrivalStatus === 'ONTIME') {
            if (!isDepLate) { score = 90; reason = "Mantap! Tepat Waktu."; }
            else { score = 0; reason = "Terlambat berangkat."; }
        } else if (train.arrivalStatus === 'LATE') {
            if (isDepLate) { score = 50; reason = "Terlambat datang & berangkat."; }
            else { score = 80; reason = "Recovery Bagus!"; }
        }
        this.log(`[SCORE] KA ${train.ka_id} | SKOR: ${score} | ${reason}`);
    }

    timeToSeconds(timeStr) {
        const parts = timeStr.split(':');
        return (parseInt(parts[0]) * 3600) + (parseInt(parts[1]) * 60) + (parts[2] ? parseInt(parts[2]) : 0);
    }

    broadcast() {
        this.io.emit('train_update', this.activeTrains);
    }
}

module.exports = TrainManager;