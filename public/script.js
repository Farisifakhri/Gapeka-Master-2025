const socket = io();
const audioPlayer = document.getElementById('audio-player'); 

// --- SETUP VOICE ---
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
const recognition = new SpeechRecognition();
recognition.lang = 'id-ID'; 
recognition.continuous = true; 

function startSystem() {
    document.getElementById('start-overlay').style.display = 'none';
    const amb = document.getElementById('sfx-ambience');
    if(amb) { amb.volume = 0.2; amb.play().catch(e=>console.log(e)); }
    try { recognition.start(); } catch(e){}
}

// --- AUDIO EVENT ---
socket.on('play_audio', (data) => {
    let src = '';
    if (data.type === 'ARR_KRL') src = 'assets/announce_arrival_krl.mp3';
    else if (data.type === 'DEP_KRL') src = 'assets/announce_departure.mp3';
    else if (data.type === 'ARR_LS') src = 'assets/announce_ls.mp3';
    
    if (src && audioPlayer) {
        audioPlayer.src = src;
        audioPlayer.play().catch(e => console.log("Audio Error:", e));
        console.log(`📢 PLAYING: ${src}`);
    }
});

// --- CLOCK ---
socket.on('time_update', (data) => {
    document.getElementById('clock').innerText = data.time;
});

// --- SIGNALS ---
socket.on('init_signals', (signals) => {
    for (const [key, val] of Object.entries(signals)) { updateLampUI(key, val.status); }
});
socket.on('signal_update', (data) => { updateLampUI(data.id, data.status); });

function updateLampUI(signalId, status) {
    const lampEl = document.getElementById(`lamp-${signalId}`);
    if (lampEl) {
        lampEl.className = `lamp ${status}`;
        if (status === 'GREEN') lampEl.style.boxShadow = "0 0 15px #2ecc71";
        else if (status === 'YELLOW') lampEl.style.boxShadow = "0 0 15px #f1c40f";
        else lampEl.style.boxShadow = "none";
    }
}

async function reqRoute(routeId) {
    await fetch('/api/interlocking/request-route', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ routeId })
    });
}

// --- SCHEDULE TABLE (FILTERED) ---
socket.on('train_update', (trains) => {
    const tbody = document.getElementById('schedule-body');
    tbody.innerHTML = '';

    // FILTER: Hapus kereta yang sudah berangkat (hideOnSchedule)
    // SORT: Urutkan berdasarkan waktu
    const displayTrains = trains
        .filter(t => !t.hideOnSchedule)
        .sort((a, b) => a.schedule_arrival.localeCompare(b.schedule_arrival))
        .slice(0, 3);

    if (displayTrains.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:30px; color:#666;">TIDAK ADA JADWAL</td></tr>`;
        return;
    }

    displayTrains.forEach((t, index) => {
        const tr = document.createElement('tr');
        
        let rowStyle = index === 0 ? 'background: rgba(46, 204, 113, 0.15); border-left: 5px solid #2ecc71;' : 'opacity: 0.7;';
        let fontStyle = index === 0 ? 'font-size: 1.2rem; font-weight: bold;' : 'font-size: 1rem;';
        
        let speed = Math.round(t.currentSpeedKmh || 0);
        let speedColor = speed === 0 ? '#e74c3c' : (speed > 70 ? '#f1c40f' : '#fff');
        let badgeColor = (t.sf === 'SF12') ? 'badge-sf12' : ((t.sf === 'SF10') ? 'badge-sf10' : 'badge-sf8');

        tr.style = rowStyle;
        tr.innerHTML = `
            <td style="color:#fff; ${fontStyle}">${t.train_id}</td>
            <td style="${fontStyle}">
                <div style="margin-bottom: 2px;">${t.route}</div>
                <div style="font-size:0.75em; color:#f39c12;"><i class="fas fa-map-marker-alt"></i> ${t.info || 'Lintas'}</div>
            </td>
            <td style="text-align:center;"><span style="background:#444; color:#fff; padding:4px 8px; border-radius:4px;">${t.track_id}</span></td>
            <td><span style="color:${speedColor}; font-weight:bold;">${speed}</span> km/h</td>
            <td>
                <div style="display:flex; flex-direction:column;">
                    <span style="font-weight:bold; color:#fff;">${t.nextStationName || '-'}</span>
                    <span style="font-size:0.8em; color:#2ecc71;">${t.nextStationDist || 0} km</span>
                </div>
            </td>
            <td style="font-family:'Share Tech Mono'; color:#f1c40f; ${fontStyle}">${t.schedule_arrival}</td>
            <td>
                <div style="display:flex; flex-direction:column;">
                    <span style="font-weight:bold; color:${t.status === 'DWELLING' ? '#e74c3c' : '#3498db'}">${t.status === 'DWELLING' ? 'STOP' : t.status}</span>
                    <span class="badge-sf ${badgeColor}" style="font-size:0.7em;">${t.sf}</span>
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