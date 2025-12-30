const stationsData = require('../../data/stations.json');
const gapekaData = require('../../data/gapeka_lvl1.json');
const gameLoop = require('../core/GameLoop');

class Level1 {
    constructor() {
        this.station = stationsData;
        this.trains = gapekaData;
        this.activeTrains = [];
    }

    init() {
        console.log(`\n--- LEVEL 1: STASIUN ${this.station.name} ---`);
        console.log(`Misi: Atur persilangan/penyusulan KA Commuter & KA Barang`);
        console.log(`Kondisi: Jalur 1 (Peron), Jalur 2 (Langsung)\n`);

        // Dengar detak waktu dari GameLoop
        gameLoop.on('tick', (currentTime) => {
            this.checkSchedule(currentTime);
            this.updateTrains(currentTime);
        });
    }

    // Cek GAPEKA, apakah ada KA yang harus muncul?
    checkSchedule(time) {
        const trainToSpawn = this.trains.find(t => t.schedule.arrival === time);
        if (trainToSpawn) {
            console.log(`[RADAR] ⚠️ KA ${trainToSpawn.ka_id} (${trainToSpawn.name}) memanggil Stasiun ${this.station.name}.`);
            console.log(`[REQUEST] PPKA, minta aman masuk jalur berapa?`);
            this.activeTrains.push(trainToSpawn);
            
            // SIMULASI PLAYER MEMILIH JALUR (Nanti ini inputan user)
            this.simulatePlayerAction(trainToSpawn); 
        }
    }

    // Simulasi Otak PPKA (Bagian yang Aa Fakhri minta)
    simulatePlayerAction(train) {
        let jalurPilihan = 0;

        // LOGIC PEMILIHAN JALUR
        if (train.mustStop) {
            // Jika KA harus berhenti (Penumpang), WAJIB cari jalur yang hasPlatform = true
            const peronTrack = this.station.tracks.find(t => t.hasPlatform === true);
            if(peronTrack.status === 'FREE') {
                jalurPilihan = peronTrack.id;
                peronTrack.status = 'OCCUPIED'; // Kunci jalur
            }
        } else {
            // Jika KA Barang/Langsung, cari jalur lurus (tipe straight)
            const directTrack = this.station.tracks.find(t => t.type === 'straight');
            jalurPilihan = directTrack.id;
            directTrack.status = 'OCCUPIED';
        }

        if (jalurPilihan !== 0) {
            console.log(`[ACTION] PPKA memberikan Jalur ${jalurPilihan} untuk KA ${train.ka_id}. Sinyal AMAN (Hijau/Kuning).`);
        } else {
            console.log(`[DANGER] Tidak ada jalur tersedia! KA ${train.ka_id} tertahan di Sinyal Masuk!`);
        }
    }

    updateTrains(time) {
        // Disini nanti logic keberangkatan (Departure)
    }
}

module.exports = new Level1();