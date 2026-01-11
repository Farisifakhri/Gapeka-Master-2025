const stationsData = require('../../data/stations.json');

class Interlocking {
    constructor() {
        this.stations = stationsData.controlled_stations;
        this.initSignals();
    }

    initSignals() {
        console.log("🚦 Sistem Interlocking Tangerang Line Aktif.");
        for (const stnId in this.stations) {
            const signals = this.stations[stnId].signals;
            for (const sigId in signals) {
                signals[sigId].status = 'RED';
            }
        }
    }

    // UPDATE: setSignal sekarang bisa mencari by Key ATAU by ID
    setSignal(stationId, lookupId, newStatus) {
        if (!this.stations[stationId]) {
            console.log(`[ERROR] Stasiun tidak ditemukan: ${stationId}`);
            return false;
        }

        const signals = this.stations[stationId].signals;

        // CARA 1: Cek by Key (Langsung)
        if (signals[lookupId]) {
            signals[lookupId].status = newStatus;
            console.log(`[WESEL] Sinyal ${lookupId} di ${stationId} -> ${newStatus}`);
            return true;
        }

        // CARA 2: Cari by ID (Looping) - Backup jika key beda
        for (const key in signals) {
            if (signals[key].id === lookupId) {
                signals[key].status = newStatus;
                console.log(`[WESEL] Sinyal (ID) ${lookupId} di ${stationId} -> ${newStatus}`);
                return true;
            }
        }

        console.log(`[ERROR] Sinyal tidak ditemukan: ${stationId} - ${lookupId}`);
        return false;
    }

    getSignalStatus(stationId, lookupId) {
        if (!this.stations[stationId]) return 'RED';
        const signals = this.stations[stationId].signals;

        if (signals[lookupId]) return signals[lookupId].status;

        for (const key in signals) {
            if (signals[key].id === lookupId) {
                return signals[key].status;
            }
        }

        return 'RED';
    }

    getAllSignals() {
        return this.stations;
    }
}

module.exports = Interlocking;