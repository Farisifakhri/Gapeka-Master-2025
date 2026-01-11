const gapekaData = require('../../data/gapeka_lvl1.json');
const MapData = require('./StationMap');

// === DATABASE RANGKAIAN (SF10 & SF6) ===
const ROLLING_STOCK = {
    COMMUTER: [
        { id: "TM 6101F", sf: "SF10", depo: "BUD", status: "ACTIVE" }, 
        { id: "TM 6105F", sf: "SF10", depo: "BUD", status: "ACTIVE" }, 
        { id: "TM 6106F", sf: "SF10", depo: "BUD", status: "ACTIVE" }, 
        { id: "TM 6107F", sf: "SF10", depo: "BUD", status: "ACTIVE" }, 
        { id: "TM 6108F", sf: "SF10", depo: "BUD", status: "ACTIVE" },
        { id: "TM 6116F", sf: "SF10", depo: "BUD", status: "SPARE" },
        { id: "TM 6117F", sf: "SF10", depo: "BUD", status: "SPARE" },
        { id: "TM 6118F", sf: "SF10", depo: "BUD", status: "SPARE" } 
    ],
    AIRPORT: [
        { id: "EA 203 TS1", sf: "SF6" }, { id: "EA 203 TS2", sf: "SF6" },
        { id: "EA 203 TS3", sf: "SF6" }, { id: "EA 203 TS4", sf: "SF6" },
        { id: "EA 203 TS5", sf: "SF6" }
    ]
};

const JPL_LIST = [
    { id: "JPL_RW", name: "JPL Rawa Buaya", km: 10.0 },
    { id: "JPL_DW", name: "JPL Darma Wanita", km: 9.1 },
    { id: "JPL_TKO", name: "JPL Taman Kota", km: 5.2 },
    { id: "JPL_PJG", name: "JPL Panjang", km: 4.5 },
    { id: "JPL_KDY", name: "JPL Kedoya", km: 3.9 },
    { id: "JPL_DM", name: "JPL Daan Mogot", km: 3.6 }
];

class TrainManager {
    constructor(io, interlocking) { 
        this.io = io;
        this.interlocking = interlocking; 
        this.activeTrains = [];
        this.initialCheckDone = false; 
    }

    updateTrains(gameTime) {
        if (!this.initialCheckDone) {
            this.catchUpTrains(gameTime);
            this.initialCheckDone = true;
        }
        this.spawnCheck(gameTime);
        this.updatePhysics();
    }

    // === 1. CATCH UP LOGIC (Sinkronisasi Waktu) ===
    catchUpTrains(currentTime) {
        console.log(`[SYSTEM] Sinkronisasi Jadwal pada ${currentTime}...`);
        const currentMinutes = this.timeToMinutes(currentTime);

        gapekaData.forEach(train => {
            const departureMinutes = this.timeToMinutes(train.schedule_departure_tng);
            const diff = currentMinutes - departureMinutes;

            if (diff > 0 && diff < 35 && train.status === 'NOT_DEPARTED') {
                const estimatedDistance = (diff / 60) * 45; 
                const isDownstream = train.route === "TNG-DU";
                let startKm = isDownstream ? (19.3 - estimatedDistance) : (0.0 + estimatedDistance);

                if (startKm > 0.5 && startKm < 19.0) {
                    this.spawnTrain(train, startKm, 75, true);
                    console.log(`[CATCH-UP] Restore KA ${train.train_id} di KM ${startKm.toFixed(1)}`);
                }
            }
        });
    }

    // === 2. SPAWN LOGIC (Jadwal Normal) ===
    spawnCheck(currentTime) {
        const currentShortTime = currentTime.slice(0, 5);
        gapekaData.forEach(train => {
            if (train.status !== 'ACTIVE' && train.status !== 'FINISHED' && 
                train.schedule_departure_tng === currentShortTime &&
                !this.activeTrains.find(t => t.id === train.train_id)) {
                
                const isDownstream = train.route === "TNG-DU"; 
                this.spawnTrain(train, isDownstream ? 19.3 : 0.0, 0, false);
            }
        });
    }

    spawnTrain(trainData, startKm, initialSpeed, isCatchUp) {
        let assignedSet = null, sf = "SF10";
        // Cek Rolling Stock Assignment
        if (trainData.train_set) {
            const cleanId = trainData.train_set.split('(')[0].trim();
            assignedSet = cleanId;
            const stockData = ROLLING_STOCK.COMMUTER.find(s => s.id === cleanId);
            if (stockData) sf = stockData.sf;
        }
        // Randomizer
        if (!assignedSet) {
            const pool = trainData.type === 'COMMUTER' ? ROLLING_STOCK.COMMUTER : ROLLING_STOCK.AIRPORT;
            const random = pool[Math.floor(Math.random() * pool.length)];
            assignedSet = random.id;
            sf = random.sf;
        }

        const isDownstream = trainData.route === "TNG-DU"; 
        const newTrain = {
            id: trainData.train_id,
            name: `KA ${trainData.train_id}`,
            type: trainData.type, 
            direction: isDownstream ? 'DOWN' : 'UP',
            currentKm: startKm,    
            speed: initialSpeed, 
            trainSetId: assignedSet,
            sf: sf,
            status: isCatchUp ? 'RUNNING' : 'DEPARTING', 
            targetSignalId: null,
            signalAspect: 'RED', 
            distanceToSignal: 99,
            passedJpls: [],
            dwellTimer: 0,
            isDwelling: false,
            trackId: isDownstream ? '1' : '3',
            destination: trainData.destination === 'MRI' ? 'Manggarai' : (isDownstream ? 'Duri' : 'Tangerang'),
            nextStation: MapData.getNearestStation(startKm).name,
            info: isCatchUp ? 'Melanjutkan Perjalanan' : 'Persiapan'
        };

        this.activeTrains.push(newTrain);
        trainData.status = 'ACTIVE'; 
        
        if (!isCatchUp) this.io.emit('notification', `📢 ${newTrain.name} (${newTrain.trainSetId}) Siap Berangkat.`);
    }

    // === 3. PHYSICS ENGINE (REALISTIS KRL) ===
    updatePhysics() {
        this.activeTrains.forEach(t => {
            if (t.status === 'FINISHED') return;

            // A. Tentukan Batas Kecepatan (Taspat)
            let speedLimit = this.getSpeedLimit(t.currentKm, t.type);

            // B. Cek Sinyal & JPL
            this.checkSignalAhead(t);
            if (t.currentKm <= 11.0 && t.currentKm >= 3.0) this.checkJplCrossing(t);

            // C. Hitung Target Speed
            let targetSpeed = speedLimit;
            let statusInfo = "Berjalan Normal"; 

            // Aspek Kuning = Max 40 km/h
            if (t.signalAspect === 'YELLOW') {
                targetSpeed = Math.min(targetSpeed, 40); 
                statusInfo = "Aspek Kuning (Hati-hati)"; 
            }
            // Jalur Belok Rawa Buaya = Max 30 km/h
            if (t.trackId === '2' && t.currentKm >= 9.0 && t.currentKm <= 11.0) {
                targetSpeed = 30;
                statusInfo = "Masuk Jalur Belok";
            }

            // D. Smooth Braking Stasiun
            const distToStation = this.getDistanceToNextStation(t);
            const isAirportSkipping = t.type === 'AIRPORT' && !['Batu Ceper', 'Rawa Buaya', 'Duri', 'Tangerang'].includes(t.nextStation);

            if (distToStation < 2.5 && !isAirportSkipping) {
                if (distToStation < 0.05) targetSpeed = 0;       // Stop Pas
                else if (distToStation < 0.3) targetSpeed = 25;  // Merayap
                else if (distToStation < 0.5) targetSpeed = 50;  // Rem Sedang
                else if (distToStation < 1.0) targetSpeed = 70;  // Coasting
            }

            // E. Auto Dwell (Berhenti di Stasiun)
            if (this.shouldAutoDwell(t) && t.speed <= 5) {
                t.speed = 0;
                t.isDwelling = true;
                t.dwellTimer++;
                const duration = t.type === 'AIRPORT' ? 0 : 30; // 30 detik stop
                
                if (t.dwellTimer < duration) {
                    t.info = `Berhenti ${t.nextStation} (${duration - Math.floor(t.dwellTimer)}s)`;
                    return; // Skip kalkulasi gerakan
                } else {
                    t.isDwelling = false;
                    t.dwellTimer = 0;
                    // FIX DOUBLE STOP: Dorong 0.1 KM keluar zona stasiun
                    if (t.direction === 'DOWN') t.currentKm -= 0.1; else t.currentKm += 0.1;
                    t.status = 'ACCELERATING'; 
                }
            }

            // F. Eksekusi Gerakan (Akselerasi/Deselerasi)
            if (['RUNNING', 'TRANSIT', 'DEPARTING', 'ACCELERATING'].includes(t.status)) {
                if (!t.isDwelling) t.info = statusInfo;

                // --- AKSELERASI BERTINGKAT ---
                if (t.speed < targetSpeed) {
                    let acc = 0;
                    if (t.speed < 35) acc = 2.2;      // 0-35: Tarikan Kuat
                    else if (t.speed < 60) acc = 1.2; // 35-60: Menengah
                    else acc = 0.5;                   // 60+: Berat
                    
                    t.speed += acc;
                    // SPEED LIMITER (Clamping)
                    if (t.speed > targetSpeed) t.speed = targetSpeed;
                }
                
                // --- DESELERASI (Coasting/Braking) ---
                else if (t.speed > targetSpeed) {
                    if (t.speed - targetSpeed > 20) t.speed -= 2.5; // Rem agak dalam
                    else t.speed -= 1.0; // Coasting
                }

                // REM DARURAT SINYAL MERAH
                if (t.distanceToSignal < 1.0 && t.signalAspect === 'RED') {
                    t.status = 'BRAKING';
                }
                
                // AUTO RESET SINYAL (Block Occupied)
                if (t.distanceToSignal < 0 && t.distanceToSignal > -0.1 && t.targetSignalId) {
                     this.interlocking.setSignal(t.targetStationId, t.targetSignalId, 'RED');
                     this.io.emit('signal_update', { stationId: t.targetStationId, signalId: t.targetSignalId, status: 'RED' });
                     t.targetSignalId = null;
                }
            }
            else if (t.status === 'BRAKING') {
                if (t.speed > 0) t.speed -= 4.5; // Emergency Brake (Pakem)
                if (t.speed <= 0) {
                    t.speed = 0;
                    t.status = 'WAITING_SIGNAL';
                    t.info = `Menunggu Sinyal`;
                }
                
                // Lepas Rem jika Sinyal Hijau/Kuning
                if (t.signalAspect === 'GREEN') { t.status = 'ACCELERATING'; t.info = 'Sinyal Aman'; }
                else if (t.signalAspect === 'YELLOW') { t.status = 'ACCELERATING'; t.info = 'Sinyal Kuning'; }
            }
            else if (t.status === 'WAITING_SIGNAL') {
                if (t.signalAspect === 'GREEN') { t.status = 'ACCELERATING'; t.info = 'Sinyal Aman'; }
                else if (t.signalAspect === 'YELLOW') { t.status = 'ACCELERATING'; t.info = 'Sinyal Kuning'; }
            }

            if (t.speed < 0) t.speed = 0;
            
            // Update Posisi
            const deltaKm = (t.speed / 3600);
            if (t.direction === 'DOWN') t.currentKm -= deltaKm; else t.currentKm += deltaKm;
            
            // Update Info Stasiun
            const nearest = MapData.getNearestStation(t.currentKm);
            if (nearest) t.nextStation = nearest.name;

            // Finish Check
            if (t.direction === 'DOWN' && t.currentKm <= 0.0) this.handleFinish(t);
            if (t.direction === 'UP' && t.currentKm >= 19.3) this.handleFinish(t);
        });

        // Filter Kereta Finish
        this.activeTrains = this.activeTrains.filter(t => t.status !== 'FINISHED');
        this.io.emit('train_update', this.activeTrains);
    }

    // === LOGIKA SINYAL KOMPLIT (2 ARAH + BLOK TENGAH) ===
    checkSignalAhead(train) { 
        train.signalAspect = 'GREEN'; 
        train.distanceToSignal = 99;
        const km = train.currentKm;

        if (train.direction === 'DOWN') { // TNG -> DU (KM Turun)
            // 1. RW (In & Out)
            if (km > 10.0 && km < 11.5) this.assignSignal(train, 'RW', 'RW_IN_TNG_1', 'RW_IN_TNG_2', 10.0);
            else if (km <= 10.0 && km > 9.0) {
                 if (train.trackId === '2') this.assignSignal(train, 'RW', 'RW_OUT_DU_2', null, 9.8);
                 else this.assignSignal(train, 'RW', 'RW_OUT_DU_1', null, 9.8);
            }
            // 2. Blok RW-BOI
            else if (km > 8.9 && km < 9.5) this.assignBlock(train, 'BLOCK_1', 'BLK_RW_BOI', 8.9);
            // 3. BOI
            else if (km > 7.8 && km < 8.5) this.assignSignal(train, 'BOI', 'BOI_IN_TNG', null, 7.8);
            else if (km <= 7.8 && km > 7.0) this.assignSignal(train, 'BOI', 'BOI_OUT_DU', null, 7.6);
            // 4. Blok BOI-TKO
            else if (km > 6.5 && km < 7.0) this.assignBlock(train, 'BLOCK_2', 'BLK_BOI_TKO', 6.5);
            // 5. TKO
            else if (km > 5.2 && km < 5.8) this.assignSignal(train, 'TKO', 'TKO_IN_TNG', null, 5.2);
            else if (km <= 5.2 && km > 4.8) this.assignSignal(train, 'TKO', 'TKO_OUT_DU', null, 5.0);
            // 6. Blok TKO-PSG
            else if (km > 4.5 && km < 4.8) this.assignBlock(train, 'BLOCK_3', 'BLK_TKO_PSG', 4.5);
            // 7. PSG
            else if (km > 3.7 && km < 4.2) this.assignSignal(train, 'PSG', 'PSG_IN_TNG', null, 3.7);
            else if (km <= 3.7 && km > 3.0) this.assignSignal(train, 'PSG', 'PSG_OUT_DU', null, 3.5);

        } else { // DU -> TNG (KM Naik)
            // 1. PSG
            if (km < 3.7 && km > 3.0) this.assignSignal(train, 'PSG', 'PSG_IN_DU', null, 3.7);
            else if (km >= 3.7 && km < 4.2) this.assignSignal(train, 'PSG', 'PSG_OUT_TNG', null, 3.5);
            // 2. Blok PSG-TKO
            else if (km < 4.5 && km > 4.2) this.assignBlock(train, 'BLOCK_3', 'BLK_PSG_TKO', 4.5);
            // 3. TKO
            else if (km < 5.2 && km > 4.8) this.assignSignal(train, 'TKO', 'TKO_IN_DU', null, 5.2);
            else if (km >= 5.2 && km < 6.0) this.assignSignal(train, 'TKO', 'TKO_OUT_TNG', null, 5.0);
            // 4. Blok TKO-BOI
            else if (km < 6.5 && km > 6.0) this.assignBlock(train, 'BLOCK_2', 'BLK_TKO_BOI', 6.5);
            // 5. BOI
            else if (km < 7.8 && km > 7.0) this.assignSignal(train, 'BOI', 'BOI_IN_DU', null, 7.8);
            else if (km >= 7.8 && km < 8.5) this.assignSignal(train, 'BOI', 'BOI_OUT_TNG', null, 7.6);
            // 6. Blok BOI-RW
            else if (km < 8.9 && km > 8.5) this.assignBlock(train, 'BLOCK_1', 'BLK_BOI_RW', 8.9);
            // 7. RW
            else if (km < 10.0 && km > 9.0) {
                 train.targetStationId = 'RW';
                 const s2 = this.interlocking.getSignalStatus('RW', 'RW_IN_DU_2');
                 if (s2 === 'GREEN' || s2 === 'YELLOW') {
                    this.assignSignal(train, 'RW', null, 'RW_IN_DU_2', 10.0);
                } else {
                    this.assignSignal(train, 'RW', 'RW_IN_DU_3', null, 10.0);
                }
            }
            else if (km >= 10.0 && km < 11.0) this.assignSignal(train, 'RW', 'RW_OUT_TNG_3', null, 10.2);
        }
        if (train.distanceToSignal < 0) train.targetSignalId = null;
    }

    // Helper: Assign Signal (Wesel Logic)
    assignSignal(t, stId, sig1, sig2, signalKm) {
        t.targetStationId = stId;
        if (sig2) { // Logic Wesel
            const s2 = this.interlocking.getSignalStatus(stId, sig2);
            if (s2 === 'GREEN' || s2 === 'YELLOW') {
                t.targetSignalId = sig2; t.signalAspect = s2; t.trackId = '2';
            } else {
                if (sig1) { // Fallback ke sinyal lurus
                    t.targetSignalId = sig1; t.signalAspect = this.interlocking.getSignalStatus(stId, sig1);
                    t.trackId = (t.direction === 'UP') ? '3' : '1';
                }
            }
        } else { // Sinyal Lurus Biasa
            t.targetSignalId = sig1; t.signalAspect = this.interlocking.getSignalStatus(stId, sig1);
        }
        t.distanceToSignal = Math.abs(t.currentKm - signalKm);
    }

    // Helper: Assign Block
    assignBlock(t, blkId, sigId, signalKm) {
        t.targetStationId = blkId; t.targetSignalId = sigId;
        t.signalAspect = this.interlocking.getSignalStatus(blkId, sigId);
        t.distanceToSignal = Math.abs(t.currentKm - signalKm);
    }

    // Helper: Jarak ke Stasiun Depan
    getDistanceToNextStation(train) {
        const stopPoints = [17.5, 15.7, 14.0, 12.5, 10.0, 7.8, 5.2, 3.7, 1.5];
        let minDist = 99;
        stopPoints.forEach(km => {
            const dist = Math.abs(train.currentKm - km);
            let isAhead = (train.direction === 'DOWN' && train.currentKm > km) || (train.direction === 'UP' && train.currentKm < km);
            if (isAhead && dist < minDist) minDist = dist;
        });
        return minDist;
    }

    // Helper: Taspat (Batas Kecepatan)
    getSpeedLimit(km, type) {
        const isBandara = type === 'AIRPORT';
        if (km <= 2.0) return 60; // Duri-Grogol
        if (km > 2.0 && km <= 6.0) return 80; // Area Belokan
        if (km > 6.0 && km <= 16.0) return isBandara ? 100 : 90; // Trek Lurus Panjang
        if (km > 16.0) return 75; // Masuk Tangerang
        return 75;
    }

    // Helper: Auto Dwell Check
    shouldAutoDwell(train) {
        if (train.isDwelling) return true;
        const stopPoints = [17.5, 15.7, 14.0, 12.5, 10.0, 7.8, 5.2, 3.7, 1.5];
        for (let km of stopPoints) {
            if (Math.abs(train.currentKm - km) < 0.05) {
                // Bandara cuma berhenti di BPR (15.7) dan RW (10.0)
                if (train.type === 'AIRPORT') {
                    if (Math.abs(km - 15.7) < 0.1 || Math.abs(km - 10.0) < 0.1) return true;
                    return false; 
                }
                return true; 
            }
        }
        return false;
    }

    handleFinish(t) {
        if (t.status === 'FINISHED') return;
        t.speed = 0; t.status = 'FINISHED';
        this.io.emit('notification', `🏁 ${t.name} Tiba di ${t.destination}.`);
    }

    timeToMinutes(str) { if(!str) return -1; const [h,m]=str.split(':').map(Number); return h*60+m; }
    
    checkJplCrossing(t) { 
        JPL_LIST.forEach(j=>{ 
            if(!t.passedJpls.includes(j.id) && Math.abs(t.currentKm-j.km)<0.3) { 
                this.io.emit('notification',`📢 ${t.name}: S35 di ${j.name}`); t.passedJpls.push(j.id); 
            } 
        }); 
    }
    
    // === DEBUG SPAWN MANUAL (START FROM 0) ===
    forceSpawnDebug() {
        const debugTrain = {
            id: "KLB-TEST", name: "KA UJI COBA", type: "COMMUTER", 
            direction: "DOWN", currentKm: 19.3, speed: 0, // Start 0 biar kerasa tarikan
            trainSetId: "KLB 1", sf: "SF10", status: "DEPARTING", 
            targetSignalId: null, signalAspect: "GREEN", distanceToSignal: 99, 
            passedJpls: [], dwellTimer: 0, isDwelling: false, trackId: "1", 
            destination: "Duri", nextStation: "Tanah Tinggi", info: "Uji Coba Akselerasi"
        };
        this.activeTrains.push(debugTrain);
        this.io.emit('notification', "🛠️ KA UJI COBA Siap Berangkat dari Tangerang!");
    }
}

module.exports = TrainManager;