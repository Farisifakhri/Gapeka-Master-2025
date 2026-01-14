// src/core/TrainManager.js

class TrainManager {
    constructor(io, map, interlocking) {
        this.io = io;
        this.map = map;
        this.interlocking = interlocking;
        this.trains = [];
        this.schedule = [];
        this.isRealTime = false;
    }

    loadGapeka(data) {
        this.schedule = data;
        this.trains = [];
        this.isRealTime = false;
        console.log(`[TrainManager] Data Gapeka dimuat: ${this.schedule.length} jadwal.`);
    }

    setRealTimeMode(active) { this.isRealTime = active; }

    update(gameTime) {
        const now = new Date();
        const timeStr = now.toTimeString().slice(0, 5); // "HH:MM"

        // --- 1. SPAWN LOGIC ---
        this.schedule.forEach(ka => {
            if (ka.status !== 'NOT_STARTED') return;

            let spawn = false;
            if (ka.is_late_spawn) spawn = true;
            else if (this.isRealTime && ka.real_time_schedule === timeStr) spawn = true;
            else if (!this.isRealTime && gameTime >= ka.schedule[0].arr_time) spawn = true;

            if (spawn) this.spawnTrain(ka);
        });

        // --- 2. MOVEMENT LOGIC ---
        // Hapus kereta yang sudah 'ARRIVED'
        this.trains = this.trains.filter(t => t.status !== 'ARRIVED');
        this.trains.forEach(t => this.updateMovement(t));
    }

    spawnTrain(ka) {
        ka.status = 'RUNNING';
        
        const trackId = ka.schedule[0].track_hint || 'T2'; 
        const station = this.map.getStationById('MSG') || this.map.getStations()[0];
        const track = station ? station.tracks.find(t => t.id === trackId) : null;
        
        const startX = track ? track.start.x : 0;
        const startY = track ? track.start.y : 0;
        const endX = track ? track.end.x : 1000;

        // Tentukan apakah kereta ini 'PASS' (Langsung) atau 'STOP' (Berhenti)
        const action = ka.schedule[0].action || 'STOP';

        const train = {
            id: ka.ka_no,
            name: ka.ka_name,
            position: { x: startX, y: startY },
            
            // Target berhenti (di tengah/ujung peron)
            targetX: endX - 50, // Berhenti sedikit sebelum ujung rel
            
            currentTrackId: trackId,
            
            // Kecepatan
            maxVisualSpeed: 1.5, // Pixel/frame (Agak lambat biar realistis)
            currentSpeed: 0,     // Mulai dari 0 (akselerasi nanti)
            displaySpeed: 60,    // Info di UI (km/h)
            
            status: 'MOVING',
            action: action // 'STOP' atau 'PASS'
        };
        
        this.trains.push(train);
        console.log(`[TrainManager] KA ${train.name} Masuk Jalur ${trackId}`);
        this.io.emit('notification', `KA ${train.name} MEMASUKI STASIUN`);
    }

    updateMovement(train) {
        if (train.status === 'MOVING') {
            const dx = train.targetX - train.position.x;
            const distance = Math.abs(dx);

            // LOGIKA PENGEREMAN (DECELERATION)
            if (train.action === 'STOP') {
                if (distance < 200) {
                    // Mulai ngerem pelan-pelan saat jarak < 200px
                    // Rumus: Kecepatan menurun seiring jarak mengecil
                    train.currentSpeed = Math.max(0.2, train.maxVisualSpeed * (distance / 200));
                    
                    // Update tampilan km/h biar ikut turun (efek visual)
                    train.displaySpeed = Math.floor(60 * (distance / 200));
                } else {
                    // Kecepatan Penuh
                    train.currentSpeed = train.maxVisualSpeed;
                    train.displaySpeed = 60;
                }
            } else {
                // Kalau KA Langsung (PASS), gas terus
                train.currentSpeed = train.maxVisualSpeed;
                train.displaySpeed = 60;
            }

            // Gerakkan Kereta
            if (distance > 2) {
                train.position.x += Math.sign(dx) * train.currentSpeed; 
            } else {
                // Sampai di titik berhenti
                if(train.action === 'STOP') {
                    train.status = 'STOPPED_AT_STATION'; // Status baru: Berhenti di stasiun
                    train.displaySpeed = 0;
                    this.io.emit('notification', `KA ${train.name} TIBA DI PERON`);
                } else {
                    // Kalau PASS, langsung dianggap selesai setelah lewat
                    train.status = 'ARRIVED';
                }
            }
        }
        
        // Kalau sudah berhenti di stasiun, tunggu perintah berangkat (sinyal hijau)
        // (Nanti logika keberangkatan ditambahkan di sini jika sinyal dibuka)
    }

    getAllTrains() { return this.trains; }
}

module.exports = TrainManager;