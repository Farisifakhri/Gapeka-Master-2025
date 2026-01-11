const socket = io();

// DATA STASIUN (Updated)
const STATIONS = [
    { id: 'TNG', name: 'Tangerang', km: 19.3 },
    { id: 'TTH', name: 'Tanah Tinggi', km: 17.5 },
    { id: 'BPR', name: 'Batu Ceper', km: 15.7 },
    { id: 'PI',  name: 'Poris', km: 14.0 },
    { id: 'KDS', name: 'Kalideres', km: 12.5 },
    { id: 'RW',  name: 'Rawa Buaya', km: 10.0, controlled: true },
    { id: 'B1',  name: 'Blok RW-BOI', km: 8.9, type: 'block' }, 
    { id: 'BOI', name: 'Bojong Indah', km: 7.8, controlled: true },
    { id: 'B2',  name: 'Blok BOI-TKO', km: 6.5, type: 'block' }, 
    { id: 'TKO', name: 'Taman Kota', km: 5.2, controlled: true },
    { id: 'B3',  name: 'Blok TKO-PSG', km: 4.5, type: 'block' }, 
    { id: 'PSG', name: 'Pesing', km: 3.7, controlled: true },
    { id: 'GRG', name: 'Grogol', km: 1.5 },
    { id: 'DU',  name: 'Duri', km: 0.0 }
];

function kmToPercent(km) { return ((19.3 - km) / 19.3) * 95 + 2; }

function initMap() {
    const layer = document.getElementById('stations-layer');
    layer.innerHTML = '';
    STATIONS.forEach(st => {
        const div = document.createElement('div');
        div.className = st.type === 'block' ? 'station-marker block-marker' : `station-marker ${st.controlled ? 'controlled' : ''}`;
        div.innerText = st.type === 'block' ? '🚦' : st.id;
        div.title = st.name;
        div.style.left = `${kmToPercent(st.km)}%`;
        layer.appendChild(div);
    });
    const map = document.querySelector('.map-container');
    const siding = document.createElement('div');
    siding.className = 'track-line siding-line';
    siding.style.left = `${kmToPercent(10.5)}%`;
    siding.style.width = `${kmToPercent(9.0) - kmToPercent(10.5)}%`;
    siding.style.top = '65%';
    map.appendChild(siding);
}

socket.on('time_update', (t) => document.getElementById('game-time').innerText = t);

socket.on('signal_update', (d) => {
    const btn = document.getElementById(`btn-${d.signalId}`);
    if (btn) {
        btn.classList.remove('red', 'green', 'yellow');
        btn.classList.add(d.status.toLowerCase());
    }
});

socket.on('train_update', (trains) => {
    const layer = document.getElementById('trains-layer');
    const tbody = document.getElementById('train-table-body');
    layer.innerHTML = ''; tbody.innerHTML = '';
    
    if(trains.length===0) tbody.innerHTML = `<tr><td colspan="4" style="text-align:center">Menunggu Jadwal...</td></tr>`;

    trains.forEach(t => {
        const el = document.createElement('div');
        el.className = `train-marker ${t.type==='AIRPORT'?'airport':''}`;
        el.style.left = `${kmToPercent(t.currentKm)}%`;
        el.style.top = (t.trackId==='2' && t.currentKm<=10.5 && t.currentKm>=9.0) ? '65%' : '48%';
        el.innerText = t.id.replace('KA ','');
        el.title = `${t.name}\nSpeed: ${t.speed.toFixed(0)} km/h`;
        layer.appendChild(el);

        // UI STATUS COLOR
        let statusClass = '';
        if (t.info && t.info.includes('Kuning')) statusClass = 'status-caution';
        else if (t.status === 'BRAKING' || t.status === 'WAITING_SIGNAL') statusClass = 'status-warn';
        else statusClass = 'status-ok';

        const row = `<tr>
            <td><strong>${t.name}</strong><br><small>${t.trainSetId||''}</small></td>
            <td>KM ${t.currentKm.toFixed(1)}</td>
            <td>${t.speed.toFixed(0)} km/h</td>
            <td class="${statusClass}">${t.info || t.status}</td>
        </tr>`;
        tbody.innerHTML += row;
    });
});

socket.on('notification', (msg) => {
    const list = document.getElementById('notification-list');
    const li = document.createElement('li');
    li.innerText = `[${new Date().toLocaleTimeString()}] ${msg}`;
    list.prepend(li);
    if(list.children.length>15) list.lastChild.remove();
});

// LOGIC TOMBOL 3 WARNA: RED -> YELLOW -> GREEN -> RED
function toggleSignal(stId, sigId) {
    const btn = document.getElementById(`btn-${sigId}`);
    let next = 'YELLOW';
    
    if (btn.classList.contains('yellow')) next = 'GREEN';
    else if (btn.classList.contains('green')) next = 'RED';
    
    socket.emit('toggle_signal', { stationId: stId, signalId: sigId, targetStatus: next });
}

initMap();