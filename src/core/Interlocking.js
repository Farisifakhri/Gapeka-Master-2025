class Interlocking {
    constructor(stationsData) {
        this.stations = stationsData;
        this.signals = JSON.parse(JSON.stringify(stationsData.signals)); 
        this.routes = stationsData.routes;
    }

    // UPDATE SINYAL OTOMATIS (MENGALIR)
    updateSignalChain(trains) {
        // Kita definisikan urutan sinyal dari Blok Terjauh mundur ke Sinyal Muka
        // Urutan: BLOK -> KELUAR -> MASUK -> MUKA
        const chainJ1 = ['J1_BLK', 'J1_OUT', 'J1_IN', 'J1_PRE'];
        const chainJ2 = ['J2_BLK', 'J2_OUT', 'J2_IN', 'J2_PRE'];

        this.processChain(chainJ1, trains);
        this.processChain(chainJ2, trains);
    }

    processChain(order, trains) {
        // Loop setiap sinyal dalam rantai
        for (let i = 0; i < order.length; i++) {
            const currentId = order[i];
            const currentSig = this.signals[currentId];
            
            if (!currentSig) continue;

            // 1. CEK FISIK: Ada kereta gak di blok ini?
            // (Blok Sinyal Muka biasanya sama dengan blok Sinyal Masuk utk deteksi)
            let blockToCheck = currentSig.blockId;
            const isOccupied = this.checkBlockOccupancy(blockToCheck, trains);

            if (isOccupied) {
                currentSig.status = 'RED'; // Mutlak Merah
            } else {
                // 2. CEK SINYAL DEPANNYA (LOOK AHEAD)
                // Kalau blok kosong, aspek tergantung sinyal di depannya
                
                const nextSigId = currentSig.nextSignal;
                
                if (!nextSigId) {
                    // Ujung Dunia (Gak ada sinyal lagi) -> HIJAU
                    currentSig.status = 'GREEN';
                } else {
                    const nextSig = this.signals[nextSigId];
                    if (nextSig) {
                        if (nextSig.status === 'RED') {
                            currentSig.status = 'YELLOW'; // Depan Merah -> Kita Kuning
                        } else if (nextSig.status === 'YELLOW') {
                            currentSig.status = 'GREEN';  // Depan Kuning -> Kita Hijau
                        } else {
                            currentSig.status = 'GREEN';  // Depan Hijau -> Kita Hijau
                        }
                    } else {
                        currentSig.status = 'GREEN'; // Fallback
                    }
                }
            }
        }
    }

    checkBlockOccupancy(blockId, trains) {
        return trains.some(t => t.currentBlock === blockId);
    }

    // REQUEST RUTE MANUAL (OVERRIDE DARI UI)
    requestRoute(routeId, forcedAspect = null) {
        const routeMap = {
            'ROUTE_IN_J1': 'J1_IN', 'ROUTE_IN_J2': 'J2_IN',
            'ROUTE_OUT_J1': 'J1_OUT', 'ROUTE_OUT_J2': 'J2_OUT'
        };
        const signalId = routeMap[routeId];
        
        if (this.signals[signalId]) {
            // Paksa buka (Hijau dulu, nanti dikoreksi updateSignalChain)
            // Kecuali dipaksa aspek tertentu (misal minta kuning)
            this.signals[signalId].status = forcedAspect || 'GREEN'; 
            return `SINYAL ${signalId} DIBUKA MANUAL.`;
        }
        return "GAGAL";
    }
}

module.exports = Interlocking;