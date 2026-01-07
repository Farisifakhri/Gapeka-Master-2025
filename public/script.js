// public/script.js

const socket = io();

// --- SETUP AUDIO ---
const audioAmbience = document.getElementById('sfx-ambience');
// const audioAnnounce = document.getElementById('sfx-announce'); // Jika ada file announcer

// --- SETUP VOICE RECOGNITION ---
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
const recognition = new SpeechRecognition();
recognition.lang = 'id-ID'; 
recognition.continuous = true; 
recognition.interimResults = false;

// --- FUNGSI START SYSTEM (Dipanggil tombol Start) ---
function startSystem() {
    document.getElementById('start-overlay').style.display = 'none';
    
    // Play Ambience (Suara Stasiun)
    if(audioAmbience) {
        audioAmbience.volume = 0.2; 
        audioAmbience.loop = true;
        audioAmbience.play().catch(e => console.log("Audio Error:", e));
    }
    
    startListening();
}

function startListening() {
    try {
        recognition.start();
        updateMicUI(true, "LISTENING...");
    } catch (e) { console.error("Mic Error:", e); }
}

// Handler Hasil Suara
recognition.onresult = (event) => {
    const last = event.results.length - 1;
    const command = event.results[last][0].transcript.toLowerCase();
    
    updateMicUI(true, `CMD: "${command}"`);
    processVoiceCommand(command);
    
    // Reset status UI setelah 2 detik
    setTimeout(() => updateMicUI(true, "LISTENING..."), 2000);
};

// Auto Restart Mic kalau mati (Biar always listening)
recognition.onend = () => { recognition.start(); };

function updateMicUI(isActive, text) {
    const container = document.querySelector('.voice-status');
    const txt = document.getElementById('voice-text');
    if(isActive) {
        container.classList.add('voice-active');
        txt.innerText = text;
    } else {
        container.classList.remove('voice-active');
        txt.innerText = "VOICE: OFF";
    }
}

// --- LOGIKA PEMROSESAN SUARA ---
function processVoiceCommand(cmd) {
    let routeId = null;
    let forcedAspect = null;

    // Deteksi Warna Sinyal
    if (cmd.includes('kuning') || cmd.includes('hati')) forcedAspect = 'YELLOW';
    else if (cmd.includes('hijau') || cmd.includes('aman')) forcedAspect = 'GREEN';
    else if (cmd.includes('merah') || cmd.includes('stop')) forcedAspect = 'RED';

    // Deteksi Jalur & Aksi
    if (cmd.includes('satu') || cmd.includes('1')) {
        if (cmd.includes('masuk')) routeId = 'ROUTE_IN_J1';
        else if (cmd.includes('berangkat') || cmd.includes('keluar')) routeId = 'ROUTE_OUT_J1';
    }
    else if (cmd.includes('dua') || cmd.includes('2')) {
        if (cmd.includes('masuk')) routeId = 'ROUTE_IN_J2';
        else if (cmd.includes('berangkat') || cmd.includes('keluar')) routeId = 'ROUTE_OUT_J2';
    }

    if (routeId) {
        reqRoute(routeId, forcedAspect);
    }
}

// --- KOMUNIKASI SOCKET.IO ---

// 1. Update Jam Digital
socket.on('time_update', (data) => {
    document.getElementById('clock').innerText = data.time;
});

// 2. Inisialisasi Lampu Sinyal
socket.on('init_signals', (signals) => {
    for (const [key, val] of Object.entries(signals)) {
        updateLampUI(key, val.status);
    }
});

// 3. Update Lampu Sinyal (Realtime)
socket.on('signal_update', (data) => {
    updateLampUI(data.id, data.status);
});

// Helper Ganti Warna Lampu di UI
function updateLampUI(signalId, status) {
    const lampEl = document.getElementById(`lamp-${signalId}`);
    if (lampEl) {
        // Hapus kelas lama, tambah kelas baru (RED/YELLOW/GREEN)
        lampEl.className = `lamp ${status}`;
        
        // Efek Glow
        if (status === 'GREEN') lampEl.style.boxShadow = "0 0 15px #2ecc71";
        else if (status === 'YELLOW') lampEl.style.boxShadow = "0 0 15px #f1c40f";
        else lampEl.style.boxShadow = "none";
    }
}

// Fungsi Request Rute ke Server (Fetch API)
async function reqRoute(routeId, aspect = null) {
    try {
        const payload = { routeId };
        if (aspect) payload.forcedAspect = aspect;
        
        await fetch('/api/interlocking/request-route', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(payload)
        });
        
        // Feedback visual sederhana di console client
        console.log(`Requested: ${routeId} -> ${aspect || 'AUTO'}`);
    } catch(e) { console.error(e); }
}

// ... (Kode Socket Init sama) ...

// 4. UPDATE TABEL JADWAL (REVISI)
socket.on('train_update', (trains) => {
    const tbody = document.getElementById('schedule-body');
    tbody.innerHTML = '';

    const displayTrains = trains.slice(0, 3);

    if (displayTrains.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:30px; color:#666;">TIDAK ADA JADWAL</td></tr>`;
        return;
    }

    displayTrains.forEach((t, index) => {
        const tr = document.createElement('tr');
        
        let rowStyle = index === 0 ? 
            'background: rgba(46, 204, 113, 0.15); border-left: 5px solid #2ecc71;' : 
            'opacity: 0.7;';
        
        let fontStyle = index === 0 ? 'font-size: 1.2rem; font-weight: bold;' : 'font-size: 1rem;';

        // WARNA SPEED
        let speed = Math.round(t.currentSpeedKmh || 0);
        let speedColor = '#fff';
        if(speed === 0) speedColor = '#e74c3c'; // Merah kalo berhenti
        else if(speed > 70) speedColor = '#f1c40f'; // Kuning kalo ngebut

        // BADGE SF
        let sfClass = t.sf || 'SF8';
        let badgeColor = 'badge-sf8';
        if(sfClass === 'SF12') badgeColor = 'badge-sf12';
        if(sfClass === 'SF10') badgeColor = 'badge-sf10';

        tr.style = rowStyle;
        tr.innerHTML = `
            <td style="color:#fff; ${fontStyle}">${t.train_id}</td>
            
            <td style="${fontStyle}">
                <div style="margin-bottom: 2px;">${t.route}</div>
                <div style="font-size:0.75em; color:#f39c12; letter-spacing: 0.5px;">
                    <i class="fas fa-map-marker-alt" style="margin-right:4px;"></i>${t.info || 'Dilintas'}
                </div>
            </td>
            
            <td style="text-align:center;">
                <span style="background:#444; color:#fff; padding:4px 8px; border-radius:4px; font-weight:bold;">${t.track_id}</span>
            </td>
            
            <td>
                <span class="speed-box" style="color:${speedColor}">${speed}</span> 
                <span class="speed-unit">km/h</span>
            </td>
            
            <td>
                <div style="display:flex; flex-direction:column;">
                    <span style="font-size:0.9em; color:#aaa;">MENUJU:</span>
                    <span style="font-weight:bold; color:#fff;">${t.nextStationName || '-'}</span>
                    <span style="font-size:0.8em; color:#2ecc71;">${t.nextStationDist || 0} km lagi</span>
                </div>
            </td>
            
            <td style="font-family:'Share Tech Mono'; color:#f1c40f; ${fontStyle}">
                ${t.schedule_departure || t.schedule_arrival}
            </td>
            
            <td>
                <div style="display:flex; flex-direction:column; gap:2px;">
                    <span style="font-weight:bold; color:${t.status === 'DWELLING' ? '#e74c3c' : '#3498db'}">
                        ${t.status === 'DWELLING' ? 'BERHENTI' : t.status}
                    </span>
                    <span class="badge-sf ${badgeColor}" style="font-size:0.7em; width:fit-content;">${sfClass}</span>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });

    for(let i = displayTrains.length; i < 3; i++) {
         const tr = document.createElement('tr');
         tr.innerHTML = `<td colspan="7" style="height:65px; background:rgba(0,0,0,0.1); border-bottom: 1px solid #333;">&nbsp;</td>`;
         tbody.appendChild(tr);
    }
});