/**
 * GAPEKA MASTER 2025 - MAIN CLIENT SCRIPT
 * Style: OCC / Cyberpunk Interface with Tutorial System
 */

const socket = io();
const canvas = document.getElementById('railway-map');
const ctx = canvas.getContext('2d');
const mapContainer = document.getElementById('map-container');

// --- UI ELEMENTS ---
const mainMenu = document.getElementById('main-menu');
const gameLayer = document.getElementById('game-layer');
const clockEl = document.getElementById('game-clock');
const modeLabel = document.getElementById('mode-label');
const pingVal = document.getElementById('ping-val');
const schedList = document.getElementById('sched-list'); // Tabel Jadwal

// --- TUTORIAL ELEMENTS ---
const tutorialModal = document.getElementById('tutorial-modal');
const tutTitle = document.getElementById('tut-title');
const tutMsg = document.getElementById('tut-msg');

// --- GAME STATE ---
let stations = [];
let trains = [];
let signals = {};
let switches = {};

// --- VIEWPORT CAMERA ---
let scale = 1.2; 
let offsetX = 0;
let offsetY = 0;

// ==========================================
// 1. SOCKET LISTENERS
// ==========================================

socket.on('connect', () => {
    // Ping Monitor
    setInterval(() => {
        const start = Date.now();
        socket.emit('ping', () => {
            if(pingVal) pingVal.innerText = Date.now() - start;
        });
    }, 2000);
});

socket.on('show_menu', () => {
    mainMenu.classList.remove('closed');
    gameLayer.classList.add('hidden');
    if(tutorialModal) tutorialModal.classList.add('hidden'); // Tutup tutorial jika balik ke menu
});

socket.on('hide_menu', () => {
    mainMenu.classList.add('closed');
    gameLayer.classList.remove('hidden');
    
    // Tunggu transisi UI selesai baru resize canvas
    setTimeout(() => {
        resizeCanvas();
        centerCamera();
    }, 200);
});

socket.on('init_map', (data) => {
    stations = data;
    requestAnimationFrame(render);
});

socket.on('game_update', (data) => {
    // Sync Data dari Server
    trains = data.trains;
    signals = data.signals;
    switches = data.switches;
    
    // Update Jam Game (MM:SS)
    const min = Math.floor(data.time / 60).toString().padStart(2, '0');
    const sec = (data.time % 60).toString().padStart(2, '0');
    if(clockEl) clockEl.innerText = `${min}:${sec}`;

    // Update Papan Jadwal Live
    updateScheduleBoard();
});

socket.on('update_hud_info', (data) => {
    if(modeLabel) modeLabel.innerText = data.mode;
});

socket.on('notification', (msg) => {
    showToast(msg);
});

// --- LISTENER POP-UP TUTORIAL ---
socket.on('tutorial_popup', (data) => {
    if(tutorialModal && tutTitle && tutMsg) {
        tutTitle.innerText = data.title;
        tutMsg.innerText = data.message;
        tutorialModal.classList.remove('hidden');
    }
});

// ==========================================
// 2. USER INTERACTION
// ==========================================

// Fungsi Global (dipanggil dari HTML onclick)
window.selectLevel = (id) => socket.emit('select_level', id);
window.showMainMenu = () => socket.emit('request_menu');

window.toggleDebug = () => {
    alert(`DEBUG INFO:\nTrains: ${trains.length}\nSwitches: ${Object.keys(switches).length}`);
};

window.centerCamera = () => {
    // Pusatkan kamera ke koordinat rata-rata stasiun (Maseng ~ 400,300)
    offsetX = canvas.width/2 - 400;
    offsetY = canvas.height/2 - 300;
};

// Fungsi Tutup Modal Tutorial
window.closeTutorial = () => {
    if(tutorialModal) tutorialModal.classList.add('hidden');
};

// Mouse Click Event (Klik Wesel & Sinyal)
canvas.addEventListener('mousedown', (e) => {
    const rect = canvas.getBoundingClientRect();
    const mouseX = (e.clientX - rect.left - offsetX) / scale;
    const mouseY = (e.clientY - rect.top - offsetY) / scale;

    // A. Cek Klik Wesel
    stations.forEach(st => {
        if(st.switches) {
            st.switches.forEach(sw => {
                // Cari posisi wesel (berada di ujung track normal/reverse)
                const tr = st.tracks.find(t => t.id === sw.normal_to || t.id === sw.reverse_to);
                if(tr && tr.start) {
                    const dist = Math.hypot(mouseX - tr.start.x, mouseY - tr.start.y);
                    // Radius klik 25px
                    if(dist < 25) {
                        console.log(`Klik Wesel: ${sw.id}`);
                        socket.emit('game_action', { action: 'toggle_switch', data: { switchId: sw.id } });
                    }
                }
            });
        }
    });

    // B. Cek Klik Sinyal
    if(signals) {
        stations.forEach(st => {
            if(st.signals) {
                st.signals.forEach(sig => {
                    if(sig.position) {
                        const dist = Math.hypot(mouseX - sig.position.x, mouseY - sig.position.y);
                        // Radius klik 25px
                        if(dist < 25) {
                            console.log(`Klik Sinyal: ${sig.id}`);
                            socket.emit('game_action', { action: 'set_signal', data: { signalId: sig.id } });
                        }
                    }
                });
            }
        });
    }
});

// ==========================================
// 3. UI UPDATER
// ==========================================

function updateScheduleBoard() {
    if(!schedList) return;

    if(trains.length === 0) {
        schedList.innerHTML = '<div class="sched-row empty">-- MENUNGGU SINYAL MASUK --</div>';
        return;
    }

    // Render baris tabel
    schedList.innerHTML = trains.map(t => {
        // Tentukan status teks
        let statusText = "STOP";
        let statusClass = "";
        
        if(t.status === 'MOVING' || t.speed > 0 || t.currentSpeed > 0) {
            // Gunakan displaySpeed dari server (60 km/h)
            statusText = `RUN ${t.displaySpeed || 0} km/h ▶`; 
            statusClass = "moving"; // CSS animasi kedip
        } else if (t.status === 'STOPPED_AT_STATION') {
            statusText = "BOARDING";
            statusClass = "";
        }

        return `
            <div class="sched-row">
                <span style="color:var(--neon-cyan)">${t.id}</span>
                <span>${t.name}</span>
                <span class="${statusClass}">${statusText}</span>
            </div>
        `;
    }).join('');
}

// Update Jam Real-Time di Menu Utama
setInterval(() => {
    const el = document.getElementById('real-date');
    if(el) {
        const now = new Date();
        el.innerText = now.toLocaleString('id-ID', {
            weekday: 'short', day: 'numeric', month: 'short',
            hour: '2-digit', minute:'2-digit'
        }).toUpperCase();
    }
}, 1000);

function showToast(msg) {
    const container = document.getElementById('toast-container');
    if(!container) return;
    
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `<i class="fas fa-info-circle"></i> ${msg}`;
    container.appendChild(toast);
    
    // Hapus otomatis setelah 3 detik
    setTimeout(() => toast.remove(), 3000);
}

// ==========================================
// 4. RENDER ENGINE (CANVAS)
// ==========================================

function resizeCanvas() {
    if(mapContainer) {
        canvas.width = mapContainer.clientWidth;
        canvas.height = mapContainer.clientHeight;
    }
}
window.addEventListener('resize', resizeCanvas);

function render() {
    // Bersihkan Layar
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // 0. Gambar Grid Background (Efek Radar)
    drawGrid();

    // Cek Data
    if(!stations || stations.length === 0) {
        requestAnimationFrame(render);
        return;
    }

    ctx.save();
    // Terapkan Zoom & Pan Camera
    ctx.translate(offsetX, offsetY);
    ctx.scale(scale, scale);

    // --- LOOP STASIUN ---
    stations.forEach(st => {
        
        // 1. GAMBAR PERON (PLATFORM)
        ctx.fillStyle = '#1e293b'; 
        st.tracks.forEach(t => {
            if(t.type === 'MAIN' || t.type === 'SIDING') {
                // Gambar persegi panjang di bawah rel
                ctx.fillRect(t.start.x, t.start.y - 20, t.length || 400, 40);
            }
        });
        
        // Label Nama Stasiun (Watermark)
        if(st.tracks.length > 0) {
            const centerT = st.tracks[0];
            ctx.fillStyle = 'rgba(255,255,255,0.03)';
            ctx.font = 'bold 80px Orbitron';
            ctx.textAlign = 'left';
            ctx.fillText(st.id, centerT.start.x, centerT.start.y + 120);
        }

        // 2. GAMBAR REL (TRACKS)
        st.tracks.forEach(t => {
            // A. Base (Batu Balas)
            ctx.lineWidth = 10;
            ctx.lineCap = 'butt';
            ctx.strokeStyle = '#334155';
            ctx.beginPath(); ctx.moveTo(t.start.x, t.start.y); ctx.lineTo(t.end.x, t.end.y); ctx.stroke();

            // B. Rails (Besi) - Double Line
            ctx.lineWidth = 1;
            ctx.strokeStyle = '#94a3b8';
            // Rel Atas
            ctx.beginPath(); ctx.moveTo(t.start.x, t.start.y - 3); ctx.lineTo(t.end.x, t.end.y - 3); ctx.stroke();
            // Rel Bawah
            ctx.beginPath(); ctx.moveTo(t.start.x, t.start.y + 3); ctx.lineTo(t.end.x, t.end.y + 3); ctx.stroke();

            // C. Highlight Jalur Aktif (Jika Wesel Mengarah ke Sini)
            if(switches && t.id === 'T1' && switches['W1'] === 'REVERSE') {
                // Glow Kuning
                ctx.shadowColor = '#fbbf24'; ctx.shadowBlur = 15;
                ctx.strokeStyle = '#fbbf24'; ctx.lineWidth = 2;
                ctx.beginPath(); ctx.moveTo(t.start.x, t.start.y); ctx.lineTo(t.end.x, t.end.y); ctx.stroke();
                ctx.shadowBlur = 0; // Reset glow
            }
        });

        // 3. GAMBAR WESEL (SWITCHES)
        if(st.switches) {
            st.switches.forEach(sw => {
                // Cari koordinat wesel (biasanya di ujung track)
                const tr = st.tracks.find(t => t.id === sw.normal_to || t.id === sw.reverse_to);
                if(tr) {
                    const isActive = (switches && switches[sw.id] === 'REVERSE');
                    
                    // Node Lingkaran
                    ctx.fillStyle = '#0f172a';
                    ctx.beginPath(); ctx.arc(tr.start.x, tr.start.y, 7, 0, Math.PI*2); ctx.fill();
                    
                    // Outline Warna (Kuning=Belok, Biru=Lurus)
                    ctx.strokeStyle = isActive ? '#fbbf24' : '#0ea5e9';
                    ctx.lineWidth = 2;
                    ctx.stroke();

                    // ID Wesel
                    ctx.fillStyle = isActive ? '#fbbf24' : '#64748b';
                    ctx.font = '10px Rajdhani';
                    ctx.fillText(sw.id, tr.start.x - 10, tr.start.y - 12);
                }
            });
        }

        // 4. GAMBAR SINYAL
        if(st.signals) {
            st.signals.forEach(sig => {
                const sData = signals[sig.id] || sig;
                let color = '#ef4444'; // Merah Default
                if(sData.aspect === 'GREEN') color = '#10b981';
                if(sData.aspect === 'YELLOW') color = '#f59e0b';

                if(sig.position) {
                    const x = sig.position.x;
                    const y = sig.position.y;

                    // Tiang Sinyal
                    ctx.strokeStyle = '#64748b'; ctx.lineWidth = 3;
                    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - 25); ctx.stroke();

                    // Box Lampu
                    ctx.fillStyle = '#000';
                    ctx.fillRect(x - 7, y - 32, 14, 14);

                    // Cahaya Lampu (Glow)
                    ctx.shadowColor = color; ctx.shadowBlur = 15;
                    ctx.fillStyle = color;
                    ctx.beginPath(); ctx.arc(x, y - 25, 4, 0, Math.PI*2); ctx.fill();
                    ctx.shadowBlur = 0;

                    // Nama Sinyal
                    ctx.fillStyle = '#94a3b8'; ctx.font = '10px monospace';
                    ctx.fillText(sig.id, x - 10, y + 10);
                }
            });
        }
    });

    // 5. GAMBAR KERETA (TRAINS)
    trains.forEach(t => {
        ctx.save();
        ctx.translate(t.position.x, t.position.y);
        
        // Status di atas kereta (SPEED 60 km/h)
        if(t.status === 'MOVING' || t.status === 'STOPPED_AT_STATION') {
            ctx.fillStyle = '#facc15'; // Kuning
            ctx.font = 'bold 10px monospace';
            ctx.textAlign = 'center';
            // Tampilkan Speed dari Server
            const speedText = (t.displaySpeed > 0) ? `${t.displaySpeed} km/h ▶` : "STOPPED";
            ctx.fillText(speedText, 0, -22); 
        }

        // Body Kereta (Kapsul)
        ctx.fillStyle = '#ef4444'; 
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1;
        
        ctx.beginPath();
        const rw = 40, rh = 16, r = 4;
        const rx = -20, ry = -8;
        ctx.moveTo(rx + r, ry);
        ctx.lineTo(rx + rw - r, ry);
        ctx.quadraticCurveTo(rx + rw, ry, rx + rw, ry + r);
        ctx.lineTo(rx + rw, ry + rh - r);
        ctx.quadraticCurveTo(rx + rw, ry + rh, rx + rw - r, ry + rh);
        ctx.lineTo(rx + r, ry + rh);
        ctx.quadraticCurveTo(rx, ry + rh, rx, ry + rh - r);
        ctx.lineTo(rx, ry + r);
        ctx.quadraticCurveTo(rx, ry, rx + r, ry);
        ctx.closePath();
        ctx.fill(); ctx.stroke();

        // Kaca Kabin
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(8, -6, 10, 12); 

        // Nama KA
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 10px Rajdhani';
        ctx.textAlign = 'left';
        const shortName = t.name.replace('KA ', ''); 
        ctx.fillText(shortName.substring(0, 8), -18, 4);

        ctx.restore();
    });

    ctx.restore();
    requestAnimationFrame(render);
}

function drawGrid() {
    ctx.strokeStyle = 'rgba(14, 165, 233, 0.05)';
    ctx.lineWidth = 1;
    const gridSize = 50;
    const startX = offsetX % gridSize;
    const startY = offsetY % gridSize;

    ctx.beginPath();
    for(let x = startX; x < canvas.width; x += gridSize) {
        ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height);
    }
    for(let y = startY; y < canvas.height; y += gridSize) {
        ctx.moveTo(0, y); ctx.lineTo(canvas.width, y);
    }
    ctx.stroke();
}