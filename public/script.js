const socket = io();

// --- AUDIO ASSETS ---
const audioAmbience = document.getElementById('sfx-ambience');

// --- VOICE RECOGNITION SETUP ---
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
const recognition = new SpeechRecognition();
recognition.lang = 'id-ID'; 
recognition.continuous = true; 
recognition.interimResults = false;

// --- START SYSTEM ---
function startSystem() {
    document.getElementById('start-overlay').style.display = 'none';
    audioAmbience.volume = 0.5; 
    audioAmbience.play().catch(e => console.log("Audio Error:", e));
    startListening();
}

function startListening() {
    try {
        recognition.start();
        updateMicUI(true, "LISTENING...");
    } catch (e) { console.error("Mic Error:", e); }
}

recognition.onresult = (event) => {
    const last = event.results.length - 1;
    const command = event.results[last][0].transcript.toLowerCase();
    
    updateMicUI(true, `CMD: "${command}"`);
    processVoiceCommand(command);
    
    setTimeout(() => updateMicUI(true, "LISTENING..."), 2000);
};

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

// === LOGIKA PEMROSESAN SUARA ===
function processVoiceCommand(cmd) {
    let routeId = null;
    let forcedAspect = null; // null = Auto (ikut sistem)

    // 1. CEK WARNA/ASPEK (Override)
    if (cmd.includes('kuning') || cmd.includes('hati') || cmd.includes('semboyan 6') || cmd.includes('enam')) {
        forcedAspect = 'YELLOW';
    } 
    else if (cmd.includes('hijau') || cmd.includes('aman') || cmd.includes('semboyan 5') || cmd.includes('lima')) {
        forcedAspect = 'GREEN';
    }

    // 2. CEK JALUR & AKSI
    // Jalur 1
    if (cmd.includes('satu') || cmd.includes('1')) {
        if (cmd.includes('masuk')) routeId = 'ROUTE_IN_J1';
        else if (cmd.includes('berangkat') || cmd.includes('keluar')) routeId = 'ROUTE_OUT_J1';
    }
    // Jalur 2
    else if (cmd.includes('dua') || cmd.includes('2')) {
        if (cmd.includes('masuk')) routeId = 'ROUTE_IN_J2';
        else if (cmd.includes('berangkat') || cmd.includes('keluar')) routeId = 'ROUTE_OUT_J2';
    }

    // 3. KIRIM KE API
    if (routeId) {
        console.log(`🎤 Suara: ${routeId} | Aspek: ${forcedAspect || 'AUTO'}`);
        reqRoute(routeId, forcedAspect);
    }
}

// --- SOCKET LOGIC ---

socket.on('time_update', (data) => {
    document.getElementById('clock').innerText = data.time;
});

socket.on('init_signals', (signals) => {
    for (const [key, val] of Object.entries(signals)) {
        updateLampUI(key, val.aspect);
    }
});

socket.on('signal_update', (data) => {
    updateLampUI(data.id, data.aspect);
});

function updateLampUI(signalId, aspect) {
    const lampEl = document.getElementById(`lamp-${signalId}`);
    if (lampEl) lampEl.className = `lamp ${aspect}`;
}

// REQUEST ROUTE (Kirim aspek jika ada)
async function reqRoute(routeId, aspect = null) {
    try {
        // Efek visual tombol (biar kelihatan dipencet)
        console.log("Mengirim Request:", routeId, aspect);
        
        const payload = { routeId };
        if (aspect) payload.forcedAspect = aspect;

        const res = await fetch('/api/interlocking/request-route', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(payload)
        });
        const d = await res.json();
        if(d.status === 'failed') console.warn(d.reason);
    } catch(e) { console.error(e); }
}

socket.on('train_update', (trains) => {
    const tbody = document.getElementById('schedule-body');
    tbody.innerHTML = '';

    if (trains.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:30px; color:#555;">TIDAK ADA AKTIVITAS KERETA</td></tr>';
        return;
    }

    trains.forEach(t => {
        const tr = document.createElement('tr');
        let loadColor = '#2ecc71'; 
        if(t.passengerLoad > 40) loadColor = '#f1c40f'; 
        if(t.passengerLoad > 80) loadColor = '#ff6b6b'; 

        let stClass = '';
        if(t.status === 'APPROACHING') stClass = 'st-APPROACHING';
        if(t.status === 'DWELLING') stClass = 'st-DWELLING';
        if(t.status === 'DEPARTING') stClass = 'st-DEPARTING';

        tr.innerHTML = `
            <td style="font-weight:bold; color:#fff;">${t.ka_id}</td>
            <td style="font-size:0.9rem; color:#aaa;">${t.name}</td>
            <td><span style="background:#333; padding:2px 6px; border-radius:3px;">${t.track_dest}</span></td>
            <td><span class="speed-box">${t.displaySpeed}</span> <span class="speed-unit">km/h</span></td>
            <td>
                <div style="display:flex; justify-content:space-between;">
                    <span class="load-text" style="color:${loadColor}">${t.passengerLoad}%</span>
                </div>
                <div class="load-bar-container">
                    <div class="load-bar" style="width:${t.passengerLoad}%; background:${loadColor};"></div>
                </div>
            </td>
            <td style="font-family:'Share Tech Mono'; font-size:1rem;">
                Arr: ${t.schedule.arrival}<br> Dep: ${t.schedule.departure}
            </td>
            <td class="${stClass}">${t.info}</td>
        `;
        tbody.appendChild(tr);
    });
});