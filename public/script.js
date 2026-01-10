const socket = io();

// Element DOM
const clockEl = document.getElementById('game-clock');
const stationsContainer = document.getElementById('stations-container');
const trainList = document.getElementById('train-list');
const logList = document.getElementById('log-list');

// --- 1. INISIALISASI SINYAL DARI SERVER ---
socket.on('init_signals', (data) => {
    stationsContainer.innerHTML = ''; // Bersihkan loading

    // Loop setiap stasiun (TNG, BPR, RW, DU)
    Object.entries(data).forEach(([id, station]) => {
        const card = document.createElement('div');
        card.className = 'station-card';
        
        // Header Stasiun
        let html = `
            <div class="station-header">
                <span>${station.name}</span>
                <span class="station-code">${id}</span>
            </div>
            <div class="signal-group">
        `;

        // Loop Sinyal di dalam Stasiun
        Object.entries(station.signals).forEach(([sigKey, sigData]) => {
            const statusClass = sigData.status.toLowerCase(); // 'red' or 'green'
            html += `
                <div class="signal-btn ${statusClass}" 
                     id="btn-${sigData.id}"
                     onclick="toggleSignal('${id}', '${sigKey}')">
                    <span>${sigData.label}</span>
                    <div class="status-indicator"></div>
                </div>
            `;
        });

        html += `</div>`;
        card.innerHTML = html;
        stationsContainer.appendChild(card);
    });
});

// --- 2. UPDATE SINYAL REALTIME ---
socket.on('signal_update', (data) => {
    // Cari tombol yang ID-nya sesuai data dari server
    // data.signalId di server = "TNG_OUT_1", di HTML id="btn-TNG_OUT_1"
    // Tapi di loop init kita pakai data.signals[key].id
    
    // Perhatikan: di script.js init, kita pakai ID dari JSON stations.json
    // Contoh JSON: "OUT_1": { "id": "TNG_OUT_1", ... }
    
    // Kita cari tombol spesifik
    // Karena logic toggleSignal mengirim stationId & signalKey,
    // server membalas dengan status baru.
    
    // Agar aman, kita refresh UI tombol berdasarkan ID unik
    const btn = document.getElementById(`btn-${data.signalId}`); 
    // Tapi tunggu, data.signalId dari server adalah KEY (misal 'OUT_1') atau ID unik?
    // Cek Interlocking.js -> setSignal -> return true
    // Level1.js -> emit 'signal_update' -> { stationId, signalId, status }
    // signalId disini adalah KEY (contoh: 'OUT_1').
    
    // Jadi kita harus cari tombol berdasarkan kombinasi Station + Key
    // Namun di render awal kita pakai ID unik dari JSON.
    // Mari kita perbaiki selectornya nanti. 
    
    // SOLUSI: Kita refresh kelas warna saja
    // Karena kita tidak punya ID unik di event ini, kita cari elemen manual atau reload
    // Tapi biar cepat, kita cari elemen yang punya onclick parameter pas.
    
    const buttons = document.querySelectorAll('.signal-btn');
    buttons.forEach(b => {
        const onClickAttr = b.getAttribute('onclick');
        if (onClickAttr.includes(`'${data.stationId}', '${data.signalId}'`)) {
            // Update warna
            if (data.status === 'GREEN') {
                b.classList.remove('red');
                b.classList.add('green');
            } else {
                b.classList.remove('green');
                b.classList.add('red');
            }
        }
    });
});

// --- 3. UPDATE MONITOR KERETA ---
socket.on('train_update', (trains) => {
    trainList.innerHTML = '';
    
    trains.forEach(t => {
        const row = document.createElement('tr');
        
        // Kelas warna berdasarkan tipe
        const typeClass = t.type === 'AIRPORT_TRAIN' ? 'type-AIRPORT' : '';
        const statusClass = `status-${t.status.split('_')[0]}`; // RUNNING, BRAKING

        row.innerHTML = `
            <td class="${typeClass}"><strong>${t.id}</strong></td>
            <td>KM ${t.currentKm.toFixed(1)} <small>(${t.nextStation})</small></td>
            <td>${t.speed.toFixed(0)} km/h</td>
            <td class="${statusClass}">${t.info || t.status}</td>
        `;
        trainList.appendChild(row);
    });
});

// --- 4. JAM & LOG ---
socket.on('time_update', (time) => {
    clockEl.innerText = time;
});

socket.on('notification', (msg) => {
    const li = document.createElement('li');
    li.innerText = `[${clockEl.innerText}] ${msg}`;
    logList.prepend(li);
    
    // Hapus log lama biar gak penuh
    if (logList.children.length > 20) logList.lastChild.remove();
});

// --- FUNGSI INTERAKSI ---
function toggleSignal(stationId, signalId) {
    // Cek status sekarang lewat class di tombol
    // Ini cara 'lazy', idealnya tanya state ke server/lokal variable
    // Tapi untuk game sederhana ini oke.
    
    // Kita kirim request TOGGLE ke server.
    // Server butuh status BARU.
    // Jadi kita harus tau status LAMA.
    
    // Kita cari tombolnya
    // const btn = event.currentTarget; // agak tricky kalau dipanggil inline
    // Kita set default aja: Kalau diklik -> coba jadi GREEN. Kalau udah GREEN -> jadi RED.
    
    // Tapi tunggu, backend Interlocking.js cuma terima 'setSignal(..., newStatus)'
    // Jadi frontend harus tentukan statusnya.
    
    // Cari tombolnya di DOM
    const buttons = document.querySelectorAll('.signal-btn');
    let currentStatus = 'RED';
    
    buttons.forEach(b => {
        const onClickAttr = b.getAttribute('onclick');
        if (onClickAttr.includes(`'${stationId}', '${signalId}'`)) {
            if (b.classList.contains('green')) currentStatus = 'GREEN';
        }
    });

    const newStatus = currentStatus === 'RED' ? 'GREEN' : 'RED';
    
    // Kirim ke server
    socket.emit('toggle_signal', {
        stationId: stationId,
        signalId: signalId,
        status: newStatus
    });
}