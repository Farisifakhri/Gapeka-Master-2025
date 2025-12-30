const InterlockingSystem = require('./src/core/Interlocking');

const mockStation = {
    tracks: [
        { id: 1, status: 'FREE' },     
        { id: 2, status: 'OCCUPIED' } 
    ],
    signals: {
        "S_IN_SERANG": "RED"
    }
};

const vpi = new InterlockingSystem(mockStation);

console.log("=== TEST 1: MASUK JALUR 2 (ADA KERETA) ===");
// Harusnya GAGAL karena Jalur 2 Occupied
const result1 = vpi.requestRoute('ROUTE_A_J2');
console.log(`Hasil: ${result1.success ? "BERHASIL" : "GAGAL"} -> ${result1.reason}`);

console.log("\n=== TEST 2: MASUK JALUR 1 (KOSONG) ===");
// Harusnya BERHASIL
const result2 = vpi.requestRoute('ROUTE_A_J1');
console.log(`Hasil: ${result2.success ? "BERHASIL" : "GAGAL"} -> ${result2.message}`);

console.log("\n=== TEST 3: MEMAKSA MASUK JALUR 2 SAAT JALUR 1 AKTIF (CONFLICT) ===");
const result3 = vpi.requestRoute('ROUTE_A_J2');
console.log(`Hasil: ${result3.success ? "BERHASIL" : "GAGAL"} -> ${result3.reason}`);