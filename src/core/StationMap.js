// src/core/StationMap.js

const STATION_MAP = [
    { id: "JAKK", name: "Jakarta Kota", km: 0.0 },
    { id: "JAY",  name: "Jayakarta",    km: 1.4 },
    { id: "MGB",  name: "Mangga Besar", km: 2.4 }, // Tambahan
    { id: "SW",   name: "Sawah Besar",  km: 3.5 }, // Tambahan
    { id: "JUA",  name: "Juanda",       km: 4.6 }, // Tambahan
    { id: "GMR",  name: "Gambir",       km: 5.8 }, // Melintas Langsung (biasanya)
    { id: "GDD",  name: "Gondangdia",   km: 7.0 }, // Tambahan
    { id: "CKI",  name: "Cikini",       km: 8.5 }, // Tambahan
    { id: "MRI",  name: "Manggarai",    km: 9.9 }, // Titik Temu
    { id: "TEB",  name: "Tebet",        km: 12.5 },
    { id: "CW",   name: "Cawang",       km: 13.7 }, // POSISI KITA
    { id: "DRN",  name: "Duren Kalibata", km: 15.2 },
    { id: "PSM",  name: "Pasar Minggu", km: 17.0 },
    { id: "LA",   name: "Lenteng Agung", km: 21.9 },
    { id: "UP",   name: "Univ. Pancasila", km: 23.0 },
    { id: "UI",   name: "Univ. Indonesia", km: 24.5 },
    { id: "POC",  name: "Pondok Cina",  km: 25.6 },
    { id: "DPB",  name: "Depok Baru",   km: 28.2 },
    { id: "DP",   name: "Depok",        km: 29.8 }, // Dipo Utama
    { id: "CTA",  name: "Citayam",      km: 34.8 }, 
    { id: "BJD",  name: "Bojong Gede",  km: 40.0 },
    { id: "CLE",  name: "Cilebut",      km: 44.2 },
    { id: "BOO",  name: "Bogor",        km: 50.8 }
];

// Percabangan Nambo
const NAMBO_BRANCH = [
    { id: "CTA",  name: "Citayam",      km: 34.8 },
    { id: "PDR",  name: "Pondok Rajeg", km: 38.5 },
    { id: "CBI",  name: "Cibinong",     km: 41.5 },
    { id: "GRG",  name: "Gunung Putri", km: 45.0 },
    { id: "NMO",  name: "Nambo",        km: 47.5 }
];

module.exports = {
    STATION_MAP,
    NAMBO_BRANCH,
    getNearestStation: (currentKm, isNambo = false) => {
        const map = isNambo ? NAMBO_BRANCH : STATION_MAP;
        return map.reduce((prev, curr) => 
            Math.abs(curr.km - currentKm) < Math.abs(prev.km - currentKm) ? curr : prev
        );
    },
    isNearCawang: (km) => {
        return Math.abs(km - 13.7) < 2.5; 
    },
    getStationKm: (stationId) => {
        const s1 = STATION_MAP.find(s => s.id === stationId);
        if(s1) return s1.km;
        const s2 = NAMBO_BRANCH.find(s => s.id === stationId);
        if(s2) return s2.km;
        return 0;
    }
};