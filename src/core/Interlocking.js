const stationsData = require('../../data/stations.json');

class Interlocking {
    constructor() {
        // Load data stasiun yang bisa dikendalikan (TNG, BPR, RW, DU)
        this.stations = stationsData.controlled_stations;
        this.initSignals();
    }

    initSignals() {
        console.log("🚦 Sistem Interlocking Tangerang Line Aktif.");
        // Reset semua sinyal ke MERAH saat server nyala
        for (const stnId in this.stations) {
            const signals = this.stations[stnId].signals;
            for (const sigId in signals) {
                signals[sigId].status = 'RED';
            }
        }
    }

    // Fungsi untuk mengubah status sinyal (dipanggil dari UI/Client)
    setSignal(stationId, signalId, newStatus) {
        if (this.stations[stationId] && this.stations[stationId].signals[signalId]) {
            this.stations[stationId].signals[signalId].status = newStatus;
            console.log(`[WESEL] Sinyal ${signalId} di ${stationId} diganti ke ${newStatus}`);
            return true;
        }
        console.log(`[ERROR] Sinyal tidak ditemukan: ${stationId} - ${signalId}`);
        return false;
    }

    // Fungsi untuk membaca status sinyal (dipanggil oleh Kereta)
    getSignalStatus(stationId, signalId) {
        // Validasi input
        if (!stationId || !signalId) return 'GREEN'; // Default aman di petak jalan

        if (this.stations[stationId] && this.stations[stationId].signals[signalId]) {
            return this.stations[stationId].signals[signalId].status;
        }
        return 'RED'; // Default bahaya jika sinyal tidak dikenal
    }

    // Fungsi helper untuk mengambil semua status sinyal (buat dikirim ke UI)
    getAllSignals() {
        return this.stations;
    }
}

module.exports = Interlocking;