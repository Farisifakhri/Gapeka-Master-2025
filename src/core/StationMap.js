// src/core/StationMap.js

class StationMap {
    constructor(stationsData) {
        this.stations = [];

        // --- VALIDASI & KONVERSI DATA JSON ---

        // 1. Jika data langsung Array [...]
        if (Array.isArray(stationsData)) {
            this.stations = stationsData;
        } 
        
        // 2. Jika formatnya Object { stations: [...] }
        else if (stationsData && Array.isArray(stationsData.stations)) {
            this.stations = stationsData.stations;
        } 
        
        // 3. Jika formatnya Object Map { controlled_stations: { "RW": {...}, ... } }
        // (INI KASUS DATA AA SEKARANG)
        else if (stationsData && stationsData.controlled_stations) {
            console.log("[StationMap] Mendeteksi format 'controlled_stations'. Mengkonversi ke Array...");
            
            // Kita ubah Object { RW: {}, BOI: {} } menjadi Array [ {}, {} ]
            // Sekalian kita pastikan ID-nya terisi (mengambil dari key "RW", "BOI")
            this.stations = Object.entries(stationsData.controlled_stations).map(([key, value]) => {
                return {
                    id: key, // Set ID dari key object (misal: "RW")
                    ...value // Masukkan sisa datanya
                };
            });
        } 
        
        // 4. Format tidak dikenali
        else {
            console.error("[StationMap] ERROR: Format data stasiun tidak dikenali!", stationsData);
            this.stations = [];
        }

        console.log(`[StationMap] Berhasil memuat ${this.stations.length} stasiun/blok.`);
    }

    getStations() {
        return this.stations;
    }

    getStationById(id) {
        return this.stations.find(s => s.id === id);
    }

    findSignal(signalId) {
        // Loop mencari sinyal di dalam setiap stasiun
        for (const station of this.stations) {
            if (station.signals && Array.isArray(station.signals)) {
                const signal = station.signals.find(s => s.id === signalId);
                if (signal) return signal;
            }
            // Kadang sinyal ada di dalam tracks? (Tergantung struktur JSON)
            // Tapi biasanya di root object station.
        }
        return null;
    }
}

module.exports = StationMap;