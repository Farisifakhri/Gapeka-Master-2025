// src/core/StationMap.js

const STATION_MAP = [
    { id: "DU",  name: "Duri",          km: 0.0,  type: "TERMINUS" },
    { id: "GRG", name: "Grogol",        km: 1.5,  type: "HALTE" },
    { id: "PSG", name: "Pesing",        km: 3.7,  type: "HALTE" },
    { id: "TKO", name: "Taman Kota",    km: 5.2,  type: "HALTE" },
    { id: "BOI", name: "Bojong Indah",  km: 7.8,  type: "HALTE" },
    { id: "RW",  name: "Rawa Buaya",    km: 10.0, type: "STATION" }, // Bisa susul
    { id: "KDS", name: "Kalideres",     km: 12.5, type: "HALTE" },
    { id: "PI",  name: "Poris",         km: 14.0, type: "HALTE" },
    { id: "BPR", name: "Batu Ceper",    km: 15.7, type: "JUNCTION" }, // KA Bandara
    { id: "TTH", name: "Tanah Tinggi",  km: 17.5, type: "HALTE" },
    { id: "TNG", name: "Tangerang",     km: 19.3, type: "TERMINUS" }
];

module.exports = {
    STATION_MAP,
    
    // Cari stasiun terdekat (untuk hitung jarak arrival)
    getNearestStation: (currentKm) => {
        return STATION_MAP.reduce((prev, curr) => 
            Math.abs(curr.km - currentKm) < Math.abs(prev.km - currentKm) ? curr : prev
        );
    },

    // Cek apakah kereta berada di area "kritis" (Interlocking Area)
    getInterlockingArea: (km) => {
        if (km >= 18.8 && km <= 19.3) return 'TNG_AREA'; // Tangerang
        if (km >= 15.0 && km <= 16.5) return 'BPR_AREA'; // Batu Ceper
        if (km >= 9.5 && km <= 10.5)  return 'RW_AREA';  // Rawa Buaya
        if (km >= 0.0 && km <= 1.0)   return 'DU_AREA';  // Duri
        return null; // Di petak jalan (LINTAS)
    }
};