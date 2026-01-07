const gapekaData = require('../../data/gapeka_lvl1.json');
const MapData = require('./StationMap');

class TrainManager {
    constructor(io, stationData, interlocking) { 
        this.io = io;
        this.station = stationData;
        this.interlocking = interlocking; 
        this.activeTrains = [];
        this.completedTrains = [];
        this.gameTimeStr = "05:00:00"; 
    }

    updateTrains(gameTime, interlocking) {
        this.gameTimeStr = gameTime;
        this.interlocking = interlocking; 
        
        this.spawnCheck(gameTime);
        this.updatePhysics();
        this.checkAudioTriggers(); // <-- FITUR BARU
    }

    // --- 1. SPAWN LOGIC ---
    spawnCheck(currentTime) {
        const currentSeconds = this.timeToSeconds(currentTime);

        gapekaData.forEach(train => {
            if (this.completedTrains.includes(train.train_id)) return;
            if (this.activeTrains.find(t => t.train_id === train.train_id)) return;

            const schAtCawang = this.timeToSeconds(train.schedule_arrival);
            
            // Logic Lintas Hari (00:xx)
            let diff = schAtCawang - currentSeconds;
            if (schAtCawang < 10800 && currentSeconds > 75600) { 
                 diff += 86400; // Jadwal pagi (besok), sekarang malam
            }

            // Spawn Window (+/- 60 Menit)
            if (diff >= -3600 && diff <= 300) {
                let avgSpeedMs = 13.8; 
                let distanceDiffKm = (diff * avgSpeedMs) / 1000; 
                
                let startKm;
                if (train.track_id === 1) { 
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
                    npcDwellTimer: 0,
                    isHeldAtBogor: false,
                    remove: false,
                    
                    // Flags Audio & UI
                    playedAnnounceArr: false,
                    playedAnnounceDep: false,
                    playedAnnounceLS: false,
                    hasStoppedAtCawang: false,
                    hideOnSchedule: false
                });
                this.broadcast();
            }
        });
    }

    // --- 2. PHYSICS & MOVEMENT ---
    updatePhysics() {
        let changed = false;
        
        this.activeTrains.forEach(t => {
            if (t.status === 'NPC_STOP' || t.status === 'DWELLING') t.currentSpeedKmh = 0;

            let deltaKm = (t.currentSpeedKmh / 3600); 
            if (t.track_id === 1) t.currentKm -= deltaKm; 
            else t.currentKm += deltaKm; 

            const nearestStn = MapData.getNearestStation(t.currentKm, t.isNambo);
            const distToNearest = Math.abs(t.currentKm - nearestStn.km);
            const distToCawang = Math.abs(t.currentKm - 13.7);
            const isNearCawang = distToCawang < 2.5; 

            // Update Next Station Info
            const targetStn = this.findNextStation(t);
            if (targetStn) {
                t.nextStationName = targetStn.name;
                t.nextStationDist = Math.abs(t.currentKm - targetStn.km).toFixed(1);
            }

            // --- LOGIKA HAPUS JADWAL (AUTO-HIDE) ---
            if (t.status === 'RUNNING' && distToCawang > 0.5 && t.hasStoppedAtCawang) {
                t.hideOnSchedule = true; 
            }
            if (t.status === 'DWELLING' && distToCawang < 0.1) {
                t.hasStoppedAtCawang = true;
            }

            // --- STATE MACHINE ---
            if (isNearCawang) {
                this.handlePlayerStation(t, distToCawang);
            } else {
                this.handleNPCStation(t, nearestStn, distToNearest);
            }

            // --- TASPAT ---
            if (t.status !== 'DWELLING' && t.status !== 'NPC_STOP') {
                const limit = this.getSpeedLimit(t, nearestStn.id, distToNearest);
                this.adjustSpeed(t, limit);
            }

            // Cleanup
            if (t.currentKm < -1 || t.currentKm > 52) t.remove = true; 
            changed = true;
        });

        if (this.activeTrains.some(t => t.remove)) {
            this.activeTrains = this.activeTrains.filter(t => !t.remove);
            changed = true;
        }

        if (changed) this.broadcast();
    }

    // --- 3. AUDIO TRIGGER ---
    checkAudioTriggers() {
        const currSeconds = this.timeToSeconds(this.gameTimeStr);

        this.activeTrains.forEach(t => {
            const schArr = this.timeToSeconds(t.schedule_arrival);
            const isGoods = t.train_id.includes("KA") || t.train_id.includes("KLB");

            // Fix Cross Day calc for audio
            let diffArr = schArr - currSeconds;
            if (diffArr < -40000) diffArr += 86400; // Jadwal besok

            // A. KRL TIBA (1 Menit Sebelum)
            if (!isGoods && !t.playedAnnounceArr && diffArr <= 60 && diffArr > 0) {
                this.io.emit('play_audio', { type: 'ARR_KRL', train: t });
                t.playedAnnounceArr = true; 
            }

            // B. KRL BERANGKAT (1 Menit Setelah Lepas)
            if (!isGoods && !t.playedAnnounceDep && t.hasStoppedAtCawang && t.status === 'RUNNING') {
                this.io.emit('play_audio', { type: 'DEP_KRL', train: t });
                t.playedAnnounceDep = true;
            }

            // C. KA BARANG/LS (2 Menit Sebelum)
            if (isGoods && !t.playedAnnounceLS && diffArr <= 120 && diffArr > 0) {
                this.io.emit('play_audio', { type: 'ARR_LS', train: t });
                t.playedAnnounceLS = true;
            }
        });
    }

    // --- HELPER LOGIC ---
    getSpeedLimit(t, nearestId, distToNearest) {
        let km = t.currentKm;
        if (km >= 0 && km <= 1.5) return 40; // JAKK-JAY
        if (nearestId === 'GMR' && distToNearest < 0.8) return 45;
        if (nearestId === 'MRI' && distToNearest < 1.0) return 40;
        if (nearestId === 'PSM' && distToNearest < 0.8) return 40;
        if (nearestId === 'UI' && distToNearest < 1.0 && t.currentSpeedKmh > 60) return 40;
        if (km >= 28.0 && km <= 30.5) return 50; // DEPOK AREA
        if (nearestId === 'CTA' && distToNearest < 1.0) return 50;
        if (nearestId === 'BOO' && distToNearest < 1.2) return 30;
        return 80; 
    }

    handleNPCStation(t, nearestStn, dist) {
        if (nearestStn.id === 'GMR') { t.info = `LS Gambir`; return; } // Gambir LS
        
        if (dist < 0.05 && t.status === 'RUNNING') {
            t.status = 'NPC_STOP';
            t.npcDwellTimer = (nearestStn.id === 'BOO' && !t.isHeldAtBogor) ? 60 : 20;
            if(nearestStn.id === 'BOO') t.isHeldAtBogor = true;
            t.info = `Berhenti ${nearestStn.name}`;
        }

        if (t.status === 'NPC_STOP') {
            if (t.npcDwellTimer > 0) t.npcDwellTimer--;
            else {
                t.status = 'RUNNING';
                if (t.track_id === 1) t.currentKm -= 0.1; else t.currentKm += 0.1;
            }
        }
    }

    handlePlayerStation(t, distToCawang) {
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
                    t.currentSpeedKmh = Math.max(0, t.currentSpeedKmh - 5); 
                    t.info = `Menunggu Sinyal Masuk`;
                }
            } else {
                 if(t.currentSpeedKmh > 40) t.currentSpeedKmh -= 1;
            }
        }
        else if (t.status === 'ENTERING') {
            if (t.currentSpeedKmh > 15) t.currentSpeedKmh -= 1.5;
            if (distToCawang < 0.05) {
                t.status = 'DWELLING';
                t.currentSpeedKmh = 0;
                t.dwellTimer = 25; 
                this.checkArrival(t);
            }
        }
        else if (t.status === 'DWELLING') {
            if (t.dwellTimer > 0) {
                t.dwellTimer--;
                t.info = `Boarding... (${t.dwellTimer})`;
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
                    t.info = "Tunggu Sinyal Keluar";
                }
            }
        }
        else if (t.status === 'DEPARTING') {
            if (t.currentSpeedKmh < 80) t.currentSpeedKmh += 2;
            if (distToCawang > 1.5) {
                t.status = 'RUNNING';
                t.currentBlock = 'LINTAS';
            }
        }
    }

    findNextStation(t) {
        const map = t.isNambo ? MapData.NAMBO_BRANCH : MapData.STATION_MAP;
        if (t.track_id === 1) return [...map].reverse().find(s => s.km < t.currentKm);
        else return map.find(s => s.km > t.currentKm);
    }

    adjustSpeed(train, targetSpeed) {
        if (train.currentSpeedKmh < targetSpeed) train.currentSpeedKmh += 1.0; 
        else if (train.currentSpeedKmh > targetSpeed) train.currentSpeedKmh -= 1.5; 
    }

    checkArrival(t) {
        const schArr = this.timeToSeconds(t.schedule_arrival);
        const actArr = this.timeToSeconds(this.gameTimeStr);
        let diff = actArr - schArr;
        if (diff < -40000) diff += 86400; 

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

    broadcast() { this.io.emit('train_update', this.activeTrains); }
    log(msg) { console.log(msg); }
}

module.exports = TrainManager;