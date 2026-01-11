
const STATION_MAP = [
    { id: "TNG", name: "Tangerang",     km: 19.3, type: "TERMINUS", class: "A" },
    { id: "TTH", name: "Tanah Tinggi",  km: 17.5, type: "STATION" },
    { id: "BPR", name: "Batu Ceper",    km: 15.7, type: "STATION", class: "B" }, // Junction Bandara
    { id: "PI",  name: "Poris",         km: 14.0, type: "STATION" },
    { id: "KDS", name: "Kalideres",     km: 12.5, type: "STATION" },
    { id: "RW",  name: "Rawa Buaya",    km: 10.0, type: "STATION", class: "B" },
    { id: "BOI", name: "Bojong Indah",  km: 7.8,  type: "STATION" },
    { id: "TKO", name: "Taman Kota",    km: 5.2,  type: "STATION" },
    { id: "PSG", name: "Pesing",        km: 3.7,  type: "STATION" },
    { id: "GRG", name: "Grogol",        km: 1.5,  type: "STATION" },
    { id: "DU",  name: "Duri",          km: 0.0,  type: "TERMINUS", class: "A" }
];

module.exports = {
    STATION_MAP,
    getNearestStation: (km) => {
        return STATION_MAP.reduce((prev, curr) => 
            Math.abs(curr.km - km) < Math.abs(prev.km - km) ? curr : prev
        );
    },
    getSignalZone: (km) => {
        if (km >= 8.5 && km <= 10.5) return 'RW_AREA';
        if (km >= 7.5 && km <= 8.0)  return 'BOI_AREA';
        if (km >= 6.3 && km <= 6.7)  return 'BLOCK_BOI_TKO'; // Area Blok Tengah
        if (km >= 5.0 && km <= 5.5)  return 'TKO_AREA';
        if (km >= 3.5 && km <= 4.0)  return 'PSG_AREA';
        return null;
    }
};