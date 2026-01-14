// src/core/Interlocking.js

class Interlocking {
    /**
     * @param {Object} stationMap - Instance dari StationMap
     * @param {Object} interlockingTable - Data aturan interlocking (JSON)
     */
    constructor(stationMap, interlockingTable) {
        this.map = stationMap;
        this.rules = interlockingTable || {}; // Data aturan interlocking
        this.signals = {}; // State sinyal saat ini
        this.activeRoutes = []; // Rute yang sedang terbentuk

        // Inisialisasi status sinyal default (Merah)
        this.initSignals();
    }

    initSignals() {
        // Ambil semua sinyal dari peta stasiun
        const stations = this.map.getStations();
        
        stations.forEach(station => {
            if (station.signals) {
                station.signals.forEach(sig => {
                    this.signals[sig.id] = {
                        id: sig.id,
                        aspect: 'RED', // Default Merah
                        type: sig.type
                    };
                });
            }
        });
    }

    // Mendapatkan status semua sinyal untuk dikirim ke Frontend
    getSignalStates() {
        return this.signals;
    }

    // Mencoba membentuk rute dari Sinyal A ke Sinyal B
    setRoute(startSignalId, endSignalId) {
        console.log(`[Interlocking] Request Route: ${startSignalId} -> ${endSignalId}`);

        // 1. Validasi: Apakah rute ada di tabel interlocking?
        const routeKey = `${startSignalId}-${endSignalId}`;
        const routeRule = this.rules[routeKey];

        if (!routeRule) {
            console.log(`[Interlocking] Rute tidak valid/tidak terdaftar: ${routeKey}`);
            return false;
        }

        // 2. Cek Konflik: Apakah wesel terkunci? Apakah jalur aman?
        if (this.isRouteConflicted(routeRule)) {
            console.log(`[Interlocking] Rute konflik!`);
            return false;
        }

        // 3. Eksekusi: Kunci Wesel & Ubah Sinyal jadi Hijau
        this.activateRoute(routeKey, routeRule);
        return true;
    }

    isRouteConflicted(routeRule) {
        // Logika cek konflik (misal cek apakah wesel sedang dipakai rute lain)
        // Sederhana: return false dulu biar jalan
        return false;
    }

    activateRoute(routeKey, routeRule) {
        // Update status sinyal awal jadi Hijau
        if (this.signals[routeRule.start_signal]) {
            this.signals[routeRule.start_signal].aspect = 'GREEN';
        }
        
        this.activeRoutes.push({
            key: routeKey,
            switches: routeRule.switches // Daftar wesel yang dikunci
        });

        console.log(`[Interlocking] Rute Terbentuk: ${routeKey}`);
        
        // Timer otomatis membatalkan rute (opsional, simulasi lewat)
        setTimeout(() => {
            this.releaseRoute(routeKey, routeRule);
        }, 10000); // Reset setelah 10 detik (contoh)
    }

    releaseRoute(routeKey, routeRule) {
        // Kembalikan sinyal ke Merah
        if (this.signals[routeRule.start_signal]) {
            this.signals[routeRule.start_signal].aspect = 'RED';
        }
        // Hapus dari activeRoutes
        this.activeRoutes = this.activeRoutes.filter(r => r.key !== routeKey);
        console.log(`[Interlocking] Rute Rilis: ${routeKey}`);
    }
}

module.exports = Interlocking;