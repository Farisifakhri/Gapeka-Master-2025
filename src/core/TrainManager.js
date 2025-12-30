const gapekaData = require('../../data/gapeka_lvl1.json');

class TrainManager {
    constructor(io, stationData) {
        this.io = io; // Koneksi ke frontend
        this.station = stationData; // Data status sinyal & track
        this.activeTrains = []; // Array kereta yang sedang jalan
    }

    // Fungsi ini dipanggil setiap detik oleh GameLoop
    onTick(gameTime) {
        // 1. Cek Jadwal: Apakah ada kereta yang harus muncul jam segini?
        this.checkSchedule(gameTime);

        // 2. Gerakkan Kereta: Update posisi semua kereta aktif
        this.updateMovements();
    }

    checkSchedule(time) {
        // Cari kereta di GAPEKA yang jadwal kedatangannya == jam game sekarang
        const trainToSpawn = gapekaData.find(t => t.schedule.arrival === time);
        
        // Cek apakah kereta ini sudah ada di map? (Biar gak double spawn)
        const isAlreadyActive = this.activeTrains.find(t => t.ka_id === trainToSpawn?.ka_id);

        if (trainToSpawn && !isAlreadyActive) {
            console.log(`[TRAIN] 🚂 KA ${trainToSpawn.ka_id} (${trainToSpawn.name}) memasuki petak blok!`);
            
            // Masukkan ke array activeTrains
            this.activeTrains.push({
                ...trainToSpawn,
                position: 0,        // 0% = Baru masuk layar kiri
                speed: 1,           // Kecepatan default
                status: 'RUNNING' 
            });
        }
    }

    updateMovements() {
        if (this.activeTrains.length === 0) return;

        // Loop setiap kereta yang ada di layar
        this.activeTrains.forEach((train, index) => {
            
            // --- LOGIC SINYAL MASUK ---
            // Kita anggap sinyal masuk ada di posisi 80% layar
            // Sinyal yang dicek adalah 'in_serang' (S20B) sesuai data stations.json
            const signalId = "in_serang"; 
            const signalAspect = this.station.signals[signalId] ? this.station.signals[signalId].aspect : 'RED';
            
            // Logic Berhenti
            if (train.position >= 75 && train.position < 80) {
                // Kereta mendekati sinyal. Cek warnanya.
                if (signalAspect === 'RED') {
                    train.speed = 0; // TAHAN!
                    // console.log(`KA ${train.ka_id} Menunggu Sinyal Aman...`);
                } else {
                    train.speed = 0.5; // Jalan pelan masuk wesel (Kuning/Hijau)
                }
            } else if (train.position >= 80) {
                // Sudah lewat sinyal (Masuk Emplasemen)
                train.speed = 0.5; 
            } else {
                // Masih di petak jalan (Jauh dari sinyal)
                train.speed = 1; 
            }

            // Update Posisi X
            train.position += train.speed;

            // Hapus kereta jika sudah lewat layar ( > 110%)
            if (train.position > 120) {
                console.log(`[TRAIN] KA ${train.ka_id} Selesai / Meninggalkan stasiun.`);
                this.activeTrains.splice(index, 1);
            }
        });

        // Lapor posisi terbaru ke Frontend
        this.io.emit('train_update', this.activeTrains);
    }
}

module.exports = TrainManager;