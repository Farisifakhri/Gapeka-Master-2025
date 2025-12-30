const interlockingTable = require('../../data/interlocking_table.json');

class InterlockingSystem {
    constructor(stationData) {
        this.station = stationData; // Mengambil data state stasiun (Tracks, Switches, Signals)
        this.activeRoutes = []; // Menyimpan rute yang sedang terkunci
    }

    /**
     * FUNGSI UTAMA: PERMINTAAN PEMBENTUKAN RUTE
     * @param {string} routeId - ID Rute dari JSON (misal: 'ROUTE_A_J1')
     */
    requestRoute(routeId) {
        const routeDef = interlockingTable.routes[routeId];
        
        if (!routeDef) {
            return { success: false, reason: "Rute tidak terdaftar dalam Interlocking Table." };
        }

        console.log(`[VPI] Memproses Permintaan Rute: ${routeDef.description}...`);

        // 1. CHECK: TRACK OCCUPANCY (Apakah jalur tujuan kosong?)
        const destTrack = this.station.tracks.find(t => t.id === routeDef.destination_track);
        if (destTrack.status === 'OCCUPIED') {
            return { success: false, reason: `SAFETY ALERT: Jalur ${destTrack.id} masih ada kereta!` };
        }

        // 2. CHECK: CONFLICTING ROUTES (Apakah ada rute lain yang bentrok?)
        const isConflict = this.activeRoutes.some(r => routeDef.conflicting_routes.includes(r));
        if (isConflict) {
            return { success: false, reason: "SAFETY ALERT: Ada rute berlawanan yang sedang aktif!" };
        }

        // 3. CHECK & LOCK: SWITCHES (Wesel)
        // Jika aman, kita gerakkan wesel dan kunci.
        try {
            this._setAndLockSwitches(routeDef.required_switches);
        } catch (error) {
            return { success: false, reason: `WESEL ERROR: ${error.message}` };
        }

        // 4. ACTION: CLEAR SIGNAL (Buka Sinyal)
        this._setSignal(routeDef.start_signal, routeDef.signal_aspect);
        
        // 5. REGISTER ROUTE (Simpan rute ini sebagai aktif)
        this.activeRoutes.push(routeId);
        
        // Update Status Jalur jadi RESERVED (Sudah dipesan)
        destTrack.status = 'RESERVED';

        return { 
            success: true, 
            message: `Rute Terbentuk. Sinyal ${routeDef.start_signal} menyala ${routeDef.signal_aspect}.` 
        };
    }

    /**
     * INTERNAL: Mengatur Wesel
     */
    _setAndLockSwitches(requiredSwitches) {
        for (const [weselId, position] of Object.entries(requiredSwitches)) {
            // Cari objek wesel di data stasiun (logic dummy pencarian)
            // Di real implementation, ini mengubah state Wesel
            console.log(`[VPI] Menggerakkan Wesel ${weselId} ke posisi ${position}... KLIK-KLAK.`);
            console.log(`[VPI] Wesel ${weselId} TERKUNCI (Locked).`);
        }
    }

    /**
     * INTERNAL: Mengatur Sinyal
     */
    _setSignal(signalId, aspect) {
        // Cari objek sinyal dan ubah warnanya
        this.station.signals[signalId] = aspect; // Update state sinyal
        console.log(`[VPI] Sinyal ${signalId} berubah aspek menjadi ${aspect}.`);
    }

    /**
     * FUNGSI: MEMBUBARKAN RUTE (Setelah KA Lewat)
     */
    releaseRoute(routeId) {
        // Hapus dari daftar activeRoutes
        this.activeRoutes = this.activeRoutes.filter(id => id !== routeId);
        
        // Kembalikan Sinyal ke Merah
        const routeDef = interlockingTable.routes[routeId];
        this._setSignal(routeDef.start_signal, "RED");
        
        // Buka Kunci Wesel (Logic disederhanakan)
        console.log(`[VPI] Rute ${routeId} dibubarkan. Wesel tidak lagi terkunci.`);
    }
}

module.exports = InterlockingSystem;