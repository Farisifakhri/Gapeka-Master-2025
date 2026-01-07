const gapekaData = require('../../data/gapeka_lvl1.json');
const MapData = require('./StationMap');

class TrainManager {
    constructor(io, stationData, interlocking) { 
        this.io = io;
        this.station = stationData;
        this.interlocking = interlocking; 
        this.activeTrains = [];
        this.completedTrains = [];
        this.gameTimeStr = "04:30:00"; 
    }

    updateTrains(gameTime, interlocking) {
        this.gameTimeStr = gameTime;
        this.interlocking = interlocking; 
        
        this.spawnCheck(gameTime);
        this.updatePhysics();
    }

    log(message) {
        // console.log(`[${this.gameTimeStr}] ${message}`);
    }

    // --- 1. SPAWN CHECK (TETAP SAMA) ---
    spawnCheck(currentTime) {
        const currentSeconds = this.timeToSeconds(currentTime);

        gapekaData.forEach(train => {
            if (this.completedTrains.includes(train.train_id)) return;
            if (this.activeTrains.find(t => t.train_id === train.train_id)) return;

            const schAtCawang = this.timeToSeconds(train.schedule_arrival);
            
            // Spawn +/- 60 menit dari jadwal Cawang
            if (currentSeconds >= schAtCawang - 3600 && currentSeconds < schAtCawang + 300) {
                let timeDiff = schAtCawang - currentSeconds; 
                let avgSpeedMs = 13.8; 
                let distanceDiffKm = (timeDiff * avgSpeedMs) / 1000; 
                
                let startKm;
                const trackId = train.track_id;

                if (trackId === 1) { 
                    startKm = 13.7 + distanceDiffKm;
                    if (startKm < 13.9) return; 
                } else {
                    startKm = 13.7 - distanceDiffKm;
                    if (startKm > 13.5) return; 
                }

                if (startKm < -1 || startKm > 52) return;

                const isNambo = train.route.includes("NMO");
                const originStation = train.route.split('-')[0];

                this.activeTrains.push({
                    ...train,
                    ka_id: train.train_id,
                    status: 'RUNNING',
                    currentKm: startKm,
                    currentSpeedKmh: 40, 
                    isNambo: isNambo,
                    distanceToSignal: 99999,
                    info: `Berangkat ${originStation}`,
                    nextStationName: '...',
                    nextStationDist: 0,
                    arrivalStatus: null,
                    dwellTimer: 0,
                    npcDwellTimer: 0, // Timer buat stasiun selain Cawang
                    isHeldAtBogor: false, // Flag khusus Bogor
                    remove: false
                });
                this.broadcast();
            }
        });
    }

    // --- 2. PHYSICS ENGINE (DENGAN TASPAT & AUTO STOP) ---
    updatePhysics() {
        let changed = false;
        
        this.activeTrains.forEach(t => {
            // A. UPDATE POSISI
            // Kalo lagi berhenti (DWELLING / NPC_STOP), speed 0
            if (t.status === 'NPC_STOP' || t.status === 'DWELLING') t.currentSpeedKmh = 0;

            let deltaKm = (t.currentSpeedKmh / 3600); 
            
            if (t.track_id === 1) t.currentKm -= deltaKm; // Arah Kota
            else t.currentKm += deltaKm; // Arah Bogor

            // B. HITUNG DATA SPASIAL
            const nearestStn = MapData.getNearestStation(t.currentKm, t.isNambo);
            const distToNearest = Math.abs(t.currentKm - nearestStn.km);
            const distToCawang = Math.abs(t.currentKm - 13.7);
            const isNearCawang = distToCawang < 2.5; 

            // Update Info Next Station
            const targetStn = this.findNextStation(t);
            if (targetStn) {
                t.nextStationName = targetStn.name;
                t.nextStationDist = Math.abs(t.currentKm - targetStn.km).toFixed(1);
            }

            // --- LOGIKA UTAMA ---

            // 1. CEK APAKAH INI CAWANG? (PLAYER CONTROL)
            if (isNearCawang) {
                this.handlePlayerStation(t, distToCawang);
            } 
            // 2. JIKA BUKAN CAWANG (AUTO / NPC LOGIC)
            else {
                this.handleNPCStation(t, nearestStn, distToNearest);
            }

            // 3. TERAPKAN TASPAT (PEMBATASAN KECEPATAN)
            // Ini dijalankan kalau kereta sedang bergerak (RUNNING/APPROACHING)
            if (t.status !== 'DWELLING' && t.status !== 'NPC_STOP') {
                const limit = this.getSpeedLimit(t, nearestStn.id, distToNearest);
                this.adjustSpeed(t, limit);
            }

            // 4. CLEANUP
            if (t.currentKm < -1 || t.currentKm > 52) t.remove = true; 
            
            changed = true;
        });

        if (this.activeTrains.some(t => t.remove)) {
            this.activeTrains = this.activeTrains.filter(t => !t.remove);
            changed = true;
        }

        if (changed) this.broadcast();
    }

    // --- LOGIKA TASPAT (SPEED LIMITS) ---
    getSpeedLimit(t, nearestId, distToNearest) {
        let km = t.currentKm;
        let limit = 80; // Default Speed Lintas

        // 1. LINTAS JAKK - JAY (KM 0 - 1.4) -> Max 40
        if (km >= 0 && km <= 1.5) return 40;

        // 2. GAMBIR (KM 5.8) -> Sinyal Kuning/Belok -> Max 40-70
        // Kita simulasikan melambat saat melintas Gambir
        if (nearestId === 'GMR' && distToNearest < 0.8) return 45;

        // 3. MANGGARAI (KM 9.9) -> Max 40-50
        if (nearestId === 'MRI' && distToNearest < 1.0) return 40;

        // 4. PASAR MINGGU (KM 17.0) -> Masuk dibatasi 40
        if (nearestId === 'PSM' && distToNearest < 0.8) return 40;

        // 5. UNIV INDONESIA (KM 24.5) -> Cek Tepat Waktu
        if (nearestId === 'UI' && distToNearest < 1.0) {
            // Cek jadwal sederhana (simulasi)
            // Kalau dia ngebut/lancar, paksa 40.
            if (t.currentSpeedKmh > 60) return 40; 
        }

        // 6. AREA DEPOK (DPB - DP) (KM 28.2 - 29.8) -> Max 50
        // Dari masuk Depok Baru sampai keluar Depok Lama
        if (km >= 28.0 && km <= 30.5) return 50;

        // 7. CITAYAM (KM 34.8) -> Max 50
        if (nearestId === 'CTA' && distToNearest < 1.0) return 50;

        // 8. MASUK BOGOR (KM 50.8) -> Max 30 + Tahan Sinyal
        if (nearestId === 'BOO' && distToNearest < 1.2) {
            // Khusus Bogor, makin dekat makin pelan
            if (distToNearest < 0.5) return 20; 
            return 30;
        }

        // --- SPEED LINTAS UMUM ---
        // Jika tidak kena TASPAT khusus, pakai speed normal
        return 80; 
    }

    // --- LOGIKA NPC (STASIUN NON-CAWANG) ---
    handleNPCStation(t, nearestStn, dist) {
        // Jangan berhenti di Gambir (GMR) kecuali KLB tertentu (kita anggap KRL bablas)
        if (nearestStn.id === 'GMR') {
            t.status = 'RUNNING';
            t.info = `Melintas Langsung ${nearestStn.name}`;
            return;
        }

        // Logika Berhenti Otomatis
        // Jika jarak < 50 meter dan belum berhenti
        if (dist < 0.05 && t.status === 'RUNNING') {
            
            // KHUSUS BOGOR: TAHAN 1 MENIT
            if (nearestStn.id === 'BOO' && !t.isHeldAtBogor) {
                t.status = 'NPC_STOP';
                t.npcDwellTimer = 60; // Tahan 1 menit (60 detik)
                t.isHeldAtBogor = true;
                t.info = "Menunggu Sinyal Masuk Bogor";
                return;
            }

            // Stasiun Biasa: Berhenti 20 detik
            t.status = 'NPC_STOP';
            t.npcDwellTimer = 20; 
            t.info = `Berhenti di ${nearestStn.name}`;
        }

        // Proses Menunggu (Dwell)
        if (t.status === 'NPC_STOP') {
            if (t.npcDwellTimer > 0) {
                t.npcDwellTimer--;
                if(nearestStn.id === 'BOO') t.info = `Antrian Masuk BOO (${t.npcDwellTimer}s)`;
                else t.info = `Berhenti ${nearestStn.name} (${t.npcDwellTimer}s)`;
            } else {
                // Selesai Berhenti -> Jalan Lagi
                t.status = 'RUNNING';
                // Dorong dikit biar gak kejebak loop berhenti di stasiun yg sama
                if (t.track_id === 1) t.currentKm -= 0.1; 
                else t.currentKm += 0.1;
                
                t.info = `Lepas ${nearestStn.name}`;
            }
        } else {
            // Sedang Lari
            t.status = 'RUNNING';
            if (dist < 1.0) t.info = `Mendekati ${nearestStn.name}`;
            else t.info = `Petak ${nearestStn.name}`;
        }
    }

    // --- LOGIKA PLAYER (STASIUN CAWANG) ---
    handlePlayerStation(t, distToCawang) {
        // State Machine Cawang (Sama seperti sebelumnya)
        // RUNNING -> APPROACHING -> ENTERING -> DWELLING -> DEPARTING -> RUNNING

        if (t.status === 'RUNNING') t.status = 'APPROACHING';

        if (t.status === 'APPROACHING') {
            t.distanceToSignal = (distToCawang * 1000) - 300; 
            const sigName = t.track_id === 1 ? 'J1_IN' : 'J2_IN';
            const signalStatus = this.interlocking.signals[sigName].status;

            if (t.distanceToSignal <= 0) {
                if (signalStatus === 'GREEN' || signalStatus === 'YELLOW') {
                    t.status = 'ENTERING';
                    t.currentBlock = (t.track_id === 1) ? 'TRACK_1' : 'TRACK_2';
                    if(this.interlocking.signals[sigName]) this.interlocking.signals[sigName].status = 'RED';
                    this.io.emit('signal_update', { id: sigName, status: 'RED' });
                } else {
                    // Paksa berhenti di sinyal
                    t.currentSpeedKmh = Math.max(0, t.currentSpeedKmh - 5); 
                    t.info = `Menunggu Sinyal Masuk Cawang`;
                }
            } else {
                 // Kurangi speed jelang sinyal
                 if(t.currentSpeedKmh > 40) t.currentSpeedKmh -= 1;
            }
        }
        else if (t.status === 'ENTERING') {
            if (t.currentSpeedKmh > 15) t.currentSpeedKmh -= 1.5;
            if (distToCawang < 0.05) {
                t.status = 'DWELLING';
                t.currentSpeedKmh = 0;
                t.dwellTimer = 25; 
                t.info = "Berhenti di Cawang";
                this.checkArrival(t);
            }
        }
        else if (t.status === 'DWELLING') {
            if (t.dwellTimer > 0) {
                t.dwellTimer--;
                t.info = `Boarding Cawang... (${t.dwellTimer}s)`;
            } else {
                const sigOut = t.track_id === 1 ? 'J1_OUT' : 'J2_OUT';
                const signalStatus = this.interlocking.signals[sigOut].status;
                if (signalStatus === 'GREEN' || signalStatus === 'YELLOW') {
                    t.status = 'DEPARTING';
                    t.currentSpeedKmh = 5; 
                    t.currentBlock = 'BLOCK_NEXT';
                    if(this.interlocking.signals[sigOut]) this.interlocking.signals[sigOut].status = 'RED';
                    this.io.emit('signal_update', { id: sigOut, status: 'RED' });
                } else {
                    t.info = "Menunggu Sinyal Keluar Cawang";
                }
            }
        }
        else if (t.status === 'DEPARTING') {
            // Akselerasi
            if (t.currentSpeedKmh < 80) t.currentSpeedKmh += 2;
            // Lepas otoritas Cawang > 1.5 KM
            if (distToCawang > 1.5) {
                t.status = 'RUNNING';
                t.currentBlock = 'LINTAS';
                this.completedTrains.push(t.train_id);
            }
        }
    }

    findNextStation(t) {
        const map = t.isNambo ? MapData.NAMBO_BRANCH : MapData.STATION_MAP;
        if (t.track_id === 1) return [...map].reverse().find(s => s.km < t.currentKm);
        else return map.find(s => s.km > t.currentKm);
    }

    adjustSpeed(train, targetSpeed) {
        // Akselerasi/Deselerasi Realistis (KRL itu responsif)
        if (train.currentSpeedKmh < targetSpeed) {
            train.currentSpeedKmh += 1.0; 
        } else if (train.currentSpeedKmh > targetSpeed) {
            // Ngerem lebih pakem daripada ngegas
            train.currentSpeedKmh -= 1.5; 
        }
    }

    checkArrival(t) {
        // Logic Arrival Cawang (Sama)
        const schArr = this.timeToSeconds(t.schedule_arrival);
        const actArr = this.timeToSeconds(this.gameTimeStr);
        const diff = actArr - schArr;
        let status = 'ONTIME';
        if (diff < -120) status = 'EARLY';
        if (diff > 180) status = 'LATE';
        t.arrivalStatus = status;
    }

    timeToSeconds(timeStr) {
        if (!timeStr) return 0;
        const parts = timeStr.split(':');
        return (parseInt(parts[0]) * 3600) + (parseInt(parts[1]) * 60) + (parts[2] ? parseInt(parts[2]) : 0);
    }

    broadcast() {
        this.io.emit('train_update', this.activeTrains);
    }
}

module.exports = TrainManager;