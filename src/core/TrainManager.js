const gapekaData = require('../../data/gapeka_lvl1.json');
const MapData = require('./StationMap');

class TrainManager {
    constructor(io, interlocking) { 
        this.io = io;
        this.interlocking = interlocking; 
        this.activeTrains = [];
        this.completedTrains = [];
        this.gameTimeStr = "04:00:00"; // Start pagi hari
    }

    // Dipanggil oleh GameLoop setiap detik (tick)
    updateTrains(gameTime) {
        this.gameTimeStr = gameTime;
        
        // 1. Cek Jadwal (Spawn Kereta)
        this.spawnCheck(gameTime);
        
        // 2. Gerakkan Kereta & Cek Sinyal
        this.updatePhysics();
    }

    // --- 1. SPAWN LOGIC (Start dari Tangerang) ---
    spawnCheck(currentTime) {
        // Format jam "HH:MM"
        const currentShortTime = currentTime.slice(0, 5);

        gapekaData.forEach(train => {
            // Cek apakah kereta belum berangkat, belum ada di map, dan jamnya pas
            if (train.status === 'NOT_DEPARTED' && 
                train.schedule_departure_tng === currentShortTime &&
                !this.activeTrains.find(t => t.id === train.train_id)) {
                
                // Spawn Kereta di Stasiun Tangerang (KM 19.3)
                const newTrain = {
                    id: train.train_id,
                    name: `KA ${train.train_id}`,
                    type: train.type, // 'COMMUTER' atau 'AIRPORT_TRAIN'
                    route: train.route,
                    
                    // FISIKA
                    currentKm: 19.3,    // Posisi Awal (Tangerang)
                    speed: 0,           // Diam
                    maxSpeed: train.type === 'AIRPORT_TRAIN' ? 85 : 80,
                    
                    // STATE
                    status: 'BOARDING', // Status awal
                    currentBlock: 'TNG_PLATFORM',
                    targetSignalId: null, // Sinyal yang sedang dihadapi
                    
                    // INFO UI
                    destination: 'Duri',
                    nextStation: 'Tanah Tinggi',
                    info: 'Persiapan Berangkat'
                };

                this.activeTrains.push(newTrain);
                
                // Update status di JSON memori (biar gak spawn dobel)
                train.status = 'READY_AT_PLATFORM'; 
                
                this.io.emit('notification', `🔔 KA ${train.train_id} Siap di Jalur Stasiun Tangerang!`);
                console.log(`[SPAWN] ${newTrain.name} muncul di Tangerang.`);
            }
        });
    }

    // --- 2. PHYSICS & MOVEMENT (Arah TNG -> DU) ---
    updatePhysics() {
        this.activeTrains.forEach(t => {
            // A. Tentukan Sinyal di Depan (Lookahead)
            this.checkSignalAhead(t);

            // B. Logika Pergerakan (State Machine)
            if (t.status === 'BOARDING') {
                // Nunggu Dispatcher kasih sinyal keluar TNG
                if (this.isSignalGreen(t.targetSignalId)) {
                    t.status = 'ACCELERATING';
                    t.info = 'Berangkat Tangerang';
                    this.io.emit('notification', `${t.name} berangkat dari Tangerang!`);
                }
            }
            else if (t.status === 'ACCELERATING' || t.status === 'RUNNING') {
                // Akselerasi sampai batas kecepatan
                if (t.speed < t.maxSpeed) t.speed += 0.5;
                
                // Kalau ada sinyal merah di depan dalam jarak 1.5km, mulai ngerem
                if (t.distanceToSignal < 1.5 && !this.isSignalGreen(t.targetSignalId)) {
                    t.status = 'BRAKING';
                } else {
                    t.status = 'RUNNING';
                }
            }
            else if (t.status === 'BRAKING') {
                // Pengereman
                if (t.speed > 0) t.speed -= 0.8; 
                
                // Kalau berhenti total
                if (t.speed <= 0) {
                    t.speed = 0;
                    t.status = 'WAITING_SIGNAL';
                    t.info = 'Menunggu Sinyal Aman...';
                }
                
                // Kalau tiba-tiba dikasih hijau pas lagi ngerem, gas lagi
                if (this.isSignalGreen(t.targetSignalId)) {
                    t.status = 'ACCELERATING';
                }
            }
            else if (t.status === 'WAITING_SIGNAL') {
                // Diam depan sinyal merah
                if (this.isSignalGreen(t.targetSignalId)) {
                    // Validasi Jalur sebelum jalan lagi
                    const validasi = this.validateRouting(t);
                    if (validasi.valid) {
                        t.status = 'ACCELERATING';
                        t.info = 'Lanjut Jalan';
                    } else {
                        // Kena Penalti/Game Over kalau salah jalur
                        t.info = `⛔ ${validasi.msg}`;
                    }
                }
            }

            // C. Update Posisi KM (Mundur dari 19.3 ke 0)
            // Konversi speed (km/h) ke (km/tick). Asumsi 1 tick = 1 detik simulasi.
            const deltaKm = (t.speed / 3600); 
            t.currentKm -= deltaKm; 

            // D. Update Info Stasiun Terdekat
            const nearest = MapData.getNearestStation(t.currentKm);
            t.nextStation = nearest.name;

            // E. Cek Finish (Tiba di Duri KM 0)
            if (t.currentKm <= 0.2 && t.status !== 'FINISHED') {
                this.handleArrivalDuri(t);
            }
        });

        // Hapus kereta yang sudah selesai dinas
        this.activeTrains = this.activeTrains.filter(t => t.status !== 'FINISHED');

        // Broadcast ke Frontend
        this.io.emit('train_update', this.activeTrains);
    }

    // --- 3. SIGNAL CHECKING ---
    checkSignalAhead(train) {
        // Tentukan kereta ada di petak mana berdasarkan KM
        const area = MapData.getInterlockingArea(train.currentKm);
        
        // Reset jarak sinyal (default jauh)
        train.distanceToSignal = 99;

        if (area === 'TNG_AREA' && train.status === 'BOARDING') {
            // Asumsi KRL selalu start di Jalur 1 untuk game level 1
            train.targetSignalId = 'TNG_OUT_1'; 
            train.distanceToSignal = 0; 
        }
        else if (area === 'BPR_AREA' && train.currentKm > 15.7) {
            // Mendekati Batu Ceper dari arah Tangerang
            train.targetSignalId = 'BPR_IN_TNG'; 
            train.distanceToSignal = train.currentKm - 15.7;
        }
        else if (area === 'RW_AREA' && train.currentKm > 10.0) {
            // Mendekati Rawa Buaya
            // Disini logic dispatch harus milih jalur lewat UI
            // Kita cek sinyal mana yang HIJAU, itu yang jadi target logika kereta
            if (this.isSignalGreen('RW_IN_1')) train.targetSignalId = 'RW_IN_1'; // Lurus
            else if (this.isSignalGreen('RW_IN_2')) train.targetSignalId = 'RW_IN_2'; // Belok
            else train.targetSignalId = 'RW_IN_1'; // Default liat sinyal utama
            
            train.distanceToSignal = train.currentKm - 10.0;
        }
        else if (area === 'DU_AREA' && train.currentKm > 0.5) {
            // Mendekati Duri
            if (this.isSignalGreen('DU_IN_J5')) train.targetSignalId = 'DU_IN_J5';
            else if (this.isSignalGreen('DU_IN_J4')) train.targetSignalId = 'DU_IN_J4';
            else train.targetSignalId = 'DU_IN_J5';

            train.distanceToSignal = train.currentKm - 0.5;
        }
        else {
            train.targetSignalId = null; // Di Lintas (Petak Jalan)
        }
    }

    // Helper cek status sinyal dari Interlocking
    isSignalGreen(signalId) {
        if (!signalId) return true; // Kalau gak ada sinyal (di lintas), anggap hijau
        
        // Ambil station ID dari kode sinyal (RW_IN_1 -> RW)
        const parts = signalId.split('_'); 
        const stationId = parts[0]; 

        // Panggil Interlocking
        const status = this.interlocking.getSignalStatus(stationId, signalId);
        return status === 'GREEN' || status === 'YELLOW';
    }

    // --- 4. ROUTING VALIDATOR (LOGIKA DURI & RW) ---
    validateRouting(train) {
        // Validasi saat kereta mau masuk sinyal yang sudah hijau
        const signalId = train.targetSignalId;
        if (!signalId) return { valid: true };

        // A. CEK RAWA BUAYA (RW)
        if (signalId.startsWith('RW')) {
            // Jalur 2 (RW_IN_2) Khusus KA Bandara
            if (signalId === 'RW_IN_2' && train.type === 'COMMUTER') {
                // KRL masuk jalur susul? Boleh tapi kasih peringatan
                return { valid: true, msg: 'Warning: KRL masuk jalur susul' };
            }
            // Jalur 1 (RW_IN_1) Utama KRL
            if (signalId === 'RW_IN_1' && train.type === 'AIRPORT_TRAIN') {
                // KA Bandara masuk jalur 1? Boleh kalau gak nyusul
                return { valid: true, msg: 'KA Bandara masuk jalur utama' };
            }
        }

        // B. CEK DURI (DU) - INI KRUSIAL
        if (signalId.startsWith('DU')) {
            // DU_IN_J5 = Jalur 5 (KRL Only)
            if (signalId === 'DU_IN_J5' && train.type === 'AIRPORT_TRAIN') {
                return { valid: false, msg: 'SALAH JALUR! KA Bandara Dilarang Masuk Jalur 5!' };
            }
            
            // DU_IN_J4 = Jalur 4 (KA Bandara Only)
            if (signalId === 'DU_IN_J4' && train.type === 'COMMUTER') {
                return { valid: false, msg: 'SALAH JALUR! KRL Dilarang Masuk Jalur 4!' };
            }
        }

        return { valid: true };
    }

    handleArrivalDuri(t) {
        t.speed = 0;
        t.status = 'FINISHED';
        t.currentKm = 0;
        this.completedTrains.push(t.id);
        
        // Cek Poin
        if (t.type === 'COMMUTER') {
            this.io.emit('notification', `✅ ${t.name} Selesai Dinas di Jalur 5 Duri.`);
        } else {
            this.io.emit('notification', `✈️ ${t.name} (Bandara) Lanjut ke Manggarai.`);
        }
    }
}

module.exports = TrainManager;