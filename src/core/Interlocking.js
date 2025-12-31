const interlockingTable = require('../../data/interlocking_table.json');

class InterlockingSystem {
    constructor(stationData) {
        this.station = stationData;
        this.activeRoutes = [];
    }

    requestRoute(routeId, forcedAspect = null) {
        const routeDef = interlockingTable.routes[routeId];
        if (!routeDef) return { success: false, reason: "Rute tidak valid" };

        if (this.station.signals[routeDef.signal_id].aspect !== 'RED') {
            return { success: false, reason: "Rute sudah terbentuk." };
        }

        const finalAspect = forcedAspect || routeDef.aspect;

        // Set Sinyal
        this.station.signals[routeDef.signal_id].aspect = finalAspect;
        this.activeRoutes.push(routeId);

        console.log(`[INTERLOCKING] Rute ${routeId} terbentuk. Sinyal ${routeDef.signal_id} -> ${finalAspect}`);
        
        return { 
            success: true, 
            message: `Sinyal Aman (${finalAspect})`,
            signalUpdate: { id: routeDef.signal_id, aspect: finalAspect }
        };
    }

    normalizeSignal(signalId) {
        if (this.station.signals[signalId]) {
            this.station.signals[signalId].aspect = 'RED';
            return true;
        }
        return false;
    }
}

module.exports = InterlockingSystem;