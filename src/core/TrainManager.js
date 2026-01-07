const gapekaData = require('../../data/gapeka_lvl1.json');
const MapData = require('./StationMap');

class TrainManager {
    constructor(io, stationData, interlocking) { 
        this.io = io;
        this.station = stationData;
        this.interlocking = interlocking; 
        this.activeTrains = [];
        this.completedTrains = [];
        this.gameTimeStr = "16:00:00"; 
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

    spawnCheck(currentTime) {
        const currentSeconds = this.timeToSeconds(currentTime);

        gapekaData.forEach(train => {
            if (this.completedTrains.includes(train.train_id)) return;
            if (this.activeTrains.find(t => t.train_id === train.train_id)) return;

            const schAtCawang = this.timeToSeconds(train.schedule_arrival);
            
            // Cek Jendela Waktu Spawn (+/- 60 menit dari Cawang)
            if (currentSeconds >= schAtCawang - 3600 && currentSeconds < schAtCawang + 300) {
                
                let timeDiff = schAtCawang - currentSeconds; 
                let avgSpeedMs = 13.8; 
                let distanceDiffKm = (timeDiff * avgSpeedMs) / 1000; 
                
                let startKm;
                const trackId = train.track_id;

                if (trackId === 1) { 
                    // Arah Kota (KM Besar -> Kecil)
                    startKm = 13.7 + distanceDiffKm;
                    if (startKm < 13.9) return; // Jangan spawn kalau sudah lewat Cawang
                } else {
                    // Arah Bogor (KM Kecil -> Besar)
                    startKm = 13.7 - distanceDiffKm;
                    if (startKm > 13.5) return; // Jangan spawn kalau sudah lewat Cawang
                }

                if (startKm < -2 || startKm > 56) return;

                const isNambo = train.route.includes("NMO");
                const originStation = train.route.split('-')[0];

                this.activeTrains.push({
                    ...train,
                    ka_id: train.train_id,
                    status: 'RUNNING',
                    currentKm: startKm,
                    currentSpeedKmh: 60, // Speed awal
                    isNambo: isNambo,
                    distanceToSignal: 99999,
                    info: `Laju dari ${originStation}`,
                    nextStationName: '...',
                    nextStationDist: 0,
                    currentBlock: 'LINTAS',
                    arrivalStatus: null,
                    dwellTimer: 0,
                    remove: false
                });
                
                this.log(`[SPAWN] KA ${train.train_id} di KM ${startKm.toFixed(1)}`);
                this.broadcast();
            }
        });
    }

    updatePhysics() {
        let changed = false;
        
        this.activeTrains.forEach(t => {
            // 1. UPDATE POSISI
            let deltaKm = (t.currentSpeedKmh / 3600); 
            
            if (t.track_id === 1) t.currentKm -= deltaKm; // Ke KM 0
            else t.currentKm += deltaKm; // Ke KM 50

            // 2. HITUNG NEXT STATION (PENGGANTI OKUPANSI)
            // Cari stasiun terdekat di depan
            const targetStn = this.findNextStation(t);
            if (targetStn) {
                t.nextStationName = targetStn.name;
                t.nextStationDist = Math.abs(t.currentKm - targetStn.km).toFixed(1);
            }

            // 3. UPDATE INFO LOKASI (GPS SINKRONISASI)
            const nearest = MapData.getNearestStation(t.currentKm, t.isNambo);
            const distToNearest = Math.abs(t.currentKm - nearest.km);

            if (t.status === 'RUNNING' || t.status === 'APPROACHING') {
                if (distToNearest < 0.4) {
                    t.info = `Melintas ${nearest.name}`;
                } else if (distToNearest < 1.5) {
                    t.info = `Lepas ${nearest.name}`;
                } else {
                    t.info = `Petak ${nearest.id}-${targetStn ? targetStn.id : '?'}`;
                }
            }

            // 4. LOGIKA INTERLOCKING CAWANG (KM 13.7)
            const distToCawang = Math.abs(t.currentKm - 13.7);
            const isNearCawang = distToCawang < 2.5; 

            // FASE DEKATI CAWANG
            if (isNearCawang && t.status === 'RUNNING') {
                t.status = 'APPROACHING';
            }

            // FASE PENGEREMAN
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
                        t.currentSpeedKmh = Math.max(0, t.currentSpeedKmh - 3); 
                        t.info = `Menunggu Sinyal Masuk`;
                    }
                } else {
                    // Decelerate halus
                    if (t.currentSpeedKmh > 40) t.currentSpeedKmh -= 0.8;
                }
            }

            // FASE MASUK
            else if (t.status === 'ENTERING') {
                if (t.currentSpeedKmh > 15) t.currentSpeedKmh -= 1.5;
                if (distToCawang < 0.05) {
                    t.status = 'DWELLING';
                    t.currentSpeedKmh = 0;
                    t.dwellTimer = 25; 
                    t.info = "Berhenti Sempurna";
                    this.checkArrival(t);
                }
            }

            // FASE DWELLING
            else if (t.status === 'DWELLING') {
                if (t.dwellTimer > 0) {
                    t.dwellTimer--;
                    t.info = `Boarding... (${t.dwellTimer}s)`;
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
                        t.info = "Menunggu Sinyal Keluar";
                    }
                }
            }

            // FASE BERANGKAT
            else if (t.status === 'DEPARTING') {
                if (t.currentSpeedKmh < 80) t.currentSpeedKmh += 2;
                if (distToCawang > 1.0) {
                    t.status = 'RUNNING';
                    t.currentBlock = 'LINTAS';
                    this.completedTrains.push(t.train_id); // Anggap selesai setelah lepas Cawang (biar list gak penuh)
                    // Atau hapus baris ini kalau mau tracking sampai ujung
                }
            }
            
            // SPEED ZONES (LINTASAN)
            else if (t.status === 'RUNNING') {
                if (t.currentKm >= 9.8 && t.currentKm <= 13.7) this.adjustSpeed(t, 75); 
                else if (t.currentKm > 13.7 && t.currentKm <= 17.0) this.adjustSpeed(t, 70);
                else if (t.currentKm > 17.0 && t.currentKm <= 29.8) this.adjustSpeed(t, 75);
                else if (t.currentKm > 29.8) this.adjustSpeed(t, 80);
                else this.adjustSpeed(t, 75);
            }

            // CLEANUP
            if (t.currentKm < -2 || t.currentKm > 56) t.remove = true; 
            
            changed = true;
        });

        if (this.activeTrains.some(t => t.remove)) {
            this.activeTrains = this.activeTrains.filter(t => !t.remove);
            changed = true;
        }

        if (changed) this.broadcast();
    }

    // Cari stasiun berikutnya berdasarkan arah
    findNextStation(t) {
        const map = t.isNambo ? MapData.NAMBO_BRANCH : MapData.STATION_MAP;
        
        if (t.track_id === 1) { 
            // Arah Kota (Cari KM yang lebih KECIL dari currentKm)
            // Reverse map dulu biar nemu yang paling dekat
            return [...map].reverse().find(s => s.km < t.currentKm);
        } else {
            // Arah Bogor (Cari KM yang lebih BESAR dari currentKm)
            return map.find(s => s.km > t.currentKm);
        }
    }

    adjustSpeed(train, targetSpeed) {
        if (train.currentSpeedKmh < targetSpeed) train.currentSpeedKmh += 0.8;
        else if (train.currentSpeedKmh > targetSpeed) train.currentSpeedKmh -= 0.8;
    }

    checkArrival(t) {
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