const fs = require('fs');
const path = require('path');

// --- 1. KONFIGURASI WAKTU & RUTE ---
const ROUTE_CONFIG = {
    // Lin Utama
    'BOO-JAKK': { start: '04:03', end: '22:30', travel: 85 }, 
    'JAKK-BOO': { start: '05:20', end: '24:00', travel: 85 }, 
    'DP-JAKK':  { start: '04:05', end: '21:00', travel: 55 }, 
    'JAKK-DP':  { start: '06:00', end: '23:59', travel: 55 }, 
    
    // Nambo & Manggarai
    'NMO-JAKK': { start: '04:55', end: '21:00', travel: 95 },
    'JAKK-NMO': { start: '05:15', end: '20:00', travel: 95 },
    'MRI-BOO':  { start: '05:10', end: '20:00', travel: 60 }, 
};

// DWELL TIME
const DWELL = {
    'JAKK': [15, 25], 
    'BOO': [15, 20],  
    'NMO': [20, 30],
    'DP': [10, 20],
    'MRI': [5, 10]
};

// --- 2. TRAFFIC CONTROLLER (40 Rangkaian Logic) ---
function getTargetCount(timeMins) {
    if (timeMins >= 315 && timeMins < 615) return 40;  // Pagi
    if (timeMins >= 615 && timeMins < 930) return 32;  // Siang
    if (timeMins >= 930 && timeMins < 1200) return 40; // Sore
    if (timeMins >= 1200 && timeMins < 1350) return 30;// Malam
    return 15; // Late Night
}

// [REVISI] Headway Manusiawi (5-7 Menit)
function getHeadway(timeMins, activeCount) {
    const target = getTargetCount(timeMins);
    
    // Jika jumlah kereta kurang dari target, genjot dispatch
    // TAPI JANGAN 3 MENIT (Keteteran)
    // Kita set 5-7 menit.
    if (activeCount < target) return [5, 7];
    
    // Jika sudah sesuai target, santai aja (10-15 menit)
    return [10, 15];
}

// --- 3. ARMADA (TOTAL 40 SET) ---
const FLEET = [
    ...Array.from({length: 18}, (_, i) => ({ id: `JR205-${100+i}`, sf: 'SF12', pos: 'BOO' })),
    ...Array.from({length: 12}, (_, i) => ({ id: `JR205-${200+i}`, sf: 'SF10', pos: 'DP' })),
    ...Array.from({length: 5}, (_, i) => ({ id: `TM-${6000+i}`, sf: 'SF8', pos: 'NMO' })),
    ...Array.from({length: 3}, (_, i) => ({ id: `INKA-${800+i}`, sf: 'SF12', pos: 'JAKK' })),
    ...Array.from({length: 2}, (_, i) => ({ id: `TM-${7000+i}`, sf: 'SF8', pos: 'MRI' }))
];

// --- 4. KA BARANG (TETAP) ---
const FIXED_FREIGHT_TRAINS = [
    { train_id: "KA 2502", schedule_arrival: "00:30", track_id: 1, route: "KKS-SBI", sf: "LOK+15GD", train_set: "CC 206 13 45", info: "KA BAJA (Isi)" },
    { train_id: "KA 2632", schedule_arrival: "02:15", track_id: 1, route: "NMO-SBI", sf: "LOK+20GD", train_set: "CC 206 15 01", info: "KA SEMEN (Isi)" },
    { train_id: "KA 2501", schedule_arrival: "03:00", track_id: 2, route: "SBI-KKS", sf: "LOK+15GD", train_set: "CC 206 13 45", info: "KA BAJA (Ksg)" },
    { train_id: "KLB-LOK", schedule_arrival: "10:30", track_id: 2, route: "JNG-BOO", sf: "LOK", train_set: "CC 206 13 100", info: "Kirim Lok (LS)" },
    { train_id: "KLB-BALIK", schedule_arrival: "11:30", track_id: 1, route: "BOO-CPN", sf: "LOK", train_set: "CC 206 13 100", info: "Balik Dipo (LS)" },
    { train_id: "KA 2654", schedule_arrival: "15:30", track_id: 2, route: "CGD-NMO", sf: "LOK+20GD", train_set: "CC 206 13 55", info: "KA BATUBARA (Isi)" },
    { train_id: "KA 2660", schedule_arrival: "22:15", track_id: 2, route: "CGD-GMR", sf: "LOK+20GD", train_set: "CC 206 13 88", info: "KA SEMEN (LS)" },
    { train_id: "KA 2672", schedule_arrival: "23:15", track_id: 2, route: "NMO-CGD", sf: "LOK+20GD", train_set: "CC 206 13 99", info: "KA BATUBARA (Ksg)" },
    { train_id: "KLB-KOS", schedule_arrival: "23:45", track_id: 2, route: "JNG-NMO", sf: "LOK+10GD", train_set: "CC 206 15 01", info: "KA BARANG (Ksg)" },
    { train_id: "KLB-MPJR-1", schedule_arrival: "23:55", track_id: 2, route: "MRI-CPT", sf: "MPJR", train_set: "MTT 08-275", info: "Perawatan Jalan Rel" },
    { train_id: "KLB-MPJR-2", schedule_arrival: "04:15", track_id: 1, route: "CPT-MRI", sf: "MPJR", train_set: "MTT 08-275", info: "Selesai Dinas" }
];

// --- HELPER FUNCTIONS ---
function timeToMins(timeStr) {
    const [h, m] = timeStr.split(':').map(Number);
    return h * 60 + m;
}

function minsToTime(mins) {
    let h = Math.floor(mins / 60) % 24;
    let m = mins % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function addMinutes(timeStr, mins) {
    return minsToTime(timeToMins(timeStr) + mins);
}

function getRandomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

// --- MAIN GENERATOR ---

const schedule = [];
let trainCounter = 1000;

const trainState = {};
FLEET.forEach(t => {
    trainState[t.id] = { pos: t.pos, readyAt: 0, sf: t.sf };
});

const lastDispatch = {};
for (const route in ROUTE_CONFIG) lastDispatch[route] = -999;

console.log(`🚀 Generasi Jadwal: Headway Manusiawi (5-7 Menit)...`);

// Loop 04:00 (240) - 24:00 (1440)
for (let t = 240; t <= 1441; t++) {
    
    let idleCount = Object.values(trainState).filter(u => t >= u.readyAt && u.readyAt < 9000).length;
    let currentActive = FLEET.length - idleCount;

    // [MODIFIED] Headway Relaxed
    const hwRange = getHeadway(t, currentActive);
    const dynamicHeadway = getRandomInt(hwRange[0], hwRange[1]);

    const routes = Object.keys(ROUTE_CONFIG).sort(() => Math.random() - 0.5);

    for (const route of routes) {
        const config = ROUTE_CONFIG[route];
        const startMins = timeToMins(config.start);
        const endMins = timeToMins(config.end);

        if (t < startMins || t > endMins) continue;

        const isLastTrain = (t === endMins);
        
        if (isLastTrain || (t - lastDispatch[route]) >= dynamicHeadway) {
            
            let [origin, dest] = route.split('-');

            if (t > 1350 && origin === 'JAKK') {
                const rand = Math.random();
                if (rand < 0.6) dest = 'DP'; 
                else dest = 'BOO'; 
            }

            const unitId = Object.keys(trainState).find(id => {
                const u = trainState[id];
                return u.pos === origin && t >= u.readyAt && u.readyAt < 9000;
            });

            if (unitId) {
                const unit = trainState[unitId];
                lastDispatch[route] = t;

                let timeToCawang = 0;
                if (origin === 'JAKK') timeToCawang = 25;
                else if (origin === 'MRI') timeToCawang = 10;
                else if (origin === 'BOO') timeToCawang = 60;
                else if (origin === 'DP') timeToCawang = 30;
                else if (origin === 'NMO') timeToCawang = 35;

                const arrivalAtCawang = t + timeToCawang;
                const arrivalAtDest = t + config.travel; 

                let trackId = (origin === 'JAKK' || origin === 'MRI') ? 2 : 1;
                let kaNum = trainCounter++;

                schedule.push({
                    train_id: String(kaNum),
                    schedule_arrival: minsToTime(arrivalAtCawang), 
                    schedule_departure: minsToTime(arrivalAtCawang + 1),
                    track_id: trackId,
                    route: `${origin}-${dest}`,
                    sf: unit.sf,
                    train_set: unitId,
                    info: (isLastTrain) ? "KA Terakhir" : "Normal" // Info lebih simpel
                });

                unit.pos = dest;
                
                let turnTime = getRandomInt(10, 20);
                if (DWELL[dest]) turnTime = getRandomInt(DWELL[dest][0], DWELL[dest][1]);

                if (t > 1350 && (dest === 'BOO' || dest === 'DP')) {
                    unit.readyAt = 9999; 
                } else {
                    unit.readyAt = arrivalAtDest + turnTime;
                }
            }
        }
    }
}

// GABUNG BARANG
FIXED_FREIGHT_TRAINS.forEach(ft => {
    ft.schedule_departure = addMinutes(ft.schedule_arrival, 0); 
    schedule.push(ft);
});

schedule.sort((a, b) => {
    let tA = timeToMins(a.schedule_arrival);
    let tB = timeToMins(b.schedule_arrival);
    if (tA < 240) tA += 1440; 
    if (tB < 240) tB += 1440;
    return tA - tB;
});

const outputPath = path.join(__dirname, '../data/gapeka_lvl1.json');
fs.writeFileSync(outputPath, JSON.stringify(schedule, null, 2));

console.log(`✅ Sukses! Jadwal 40 Kereta dengan Headway 5-7 Menit.`);