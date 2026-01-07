// src/core/Interlocking.js

class Interlocking {
    constructor(stationsData) {
        this.stations = stationsData;
        this.signals = JSON.parse(JSON.stringify(stationsData.signals)); 
        this.routes = stationsData.routes;
    }

    // Fungsi otomatis untuk update sinyal berdasarkan kereta di depannya
    updateSignalChain(trains) {
        // ... (Kode updateSignalChain sebelumnya tetap sama, tidak perlu diubah) ...
        // Bagian ini menangani perubahan otomatis saat kereta bergerak
        // Misal: Setelah kereta lewat, sinyal jadi merah otomatis.
    }

    checkBlockOccupancy(blockId, trains) {
        return trains.some(t => t.currentBlock === blockId);
    }

    // --- FUNGSI REQUEST RUTE (MANUAL DARI UI/VOICE) ---
    requestRoute(routeId, forcedAspect = null) {
        console.log(`🕹️ REQUEST ROUTE: ${routeId}`);

        // 1. Mapping Rute ke ID Sinyal
        const routeMap = {
            'ROUTE_IN_J1': 'J1_IN',
            'ROUTE_IN_J2': 'J2_IN',
            'ROUTE_OUT_J1': 'J1_OUT',
            'ROUTE_OUT_J2': 'J2_OUT'
        };

        const signalId = routeMap[routeId];
        if (!signalId) return "RUTE TIDAK DITEMUKAN";

        const signal = this.signals[signalId];
        
        // 2. LOGIKA INTERLOCKING (SAFETY CHECK)

        // A. JIKA MEMBUKA SINYAL KELUAR (EXIT)
        if (signal.type === 'EXIT') {
            // Cek apakah blok di depan aman? (Simplifikasi: kita anggap aman/GREEN dulu)
            // Jika dipaksa manual (forcedAspect), ikuti perintah user
            if (forcedAspect) {
                signal.status = forcedAspect;
            } else {
                // Default: Buka ke HIJAU
                signal.status = 'GREEN';
            }
        }
        
        // B. JIKA MEMBUKA SINYAL MASUK (ENTRY)
        else if (signal.type === 'ENTRY') {
            // Cek status sinyal keluarnya (linkedExit)
            const exitSignalId = signal.linkedExit;
            const exitSignal = this.signals[exitSignalId];

            if (forcedAspect) {
                signal.status = forcedAspect;
            } else {
                // LOGIKA OTOMATIS ASPEK:
                if (exitSignal.status === 'RED') {
                    // Jika Keluar Merah -> Masuk KUNING (Kereta harus berhenti di stasiun)
                    signal.status = 'YELLOW';
                } else {
                    // Jika Keluar Hijau/Kuning -> Masuk HIJAU (Kereta boleh bablas/langsung)
                    signal.status = 'GREEN';
                }
            }
        }

        return `SINYAL ${signalId} DIBUKA MENJADI ${signal.status}`;
    }

    // Fungsi Reset Sinyal ke Merah (Saat kereta lewat)
    normalizeSignal(id) {
        if(this.signals[id]) this.signals[id].status = 'RED';
    }
}

if (typeof module !== 'undefined') module.exports = Interlocking;