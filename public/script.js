const socket = io();

// === LISTENER SOCKET.IO ===

// 1. Update Jam Game
socket.on('time_update', (data) => {
    document.getElementById('clock').innerText = data.time;
});

// 2. Update Sinyal
socket.on('signal_update', (data) => {
    // Reset Sinyal ke Merah dulu (Fail-safe visual)
    if (data.status === 'IDLE') {
        document.getElementById('sig-j1').className = 'signal RED';
        document.getElementById('sig-j2').className = 'signal RED';
    } 
    // Nyalakan Sinyal sesuai status backend
    else {
        if (data.routeId === 'ROUTE_A_J1') 
            document.getElementById('sig-j1').className = `signal ${data.signalAspect}`;
        if (data.routeId === 'ROUTE_A_J2') 
            document.getElementById('sig-j2').className = `signal ${data.signalAspect}`;
    }
});

// 3. Update Posisi Kereta (RENDER VISUAL KERETA)
socket.on('train_update', (trains) => {
    const layer = document.getElementById('train-layer');
    layer.innerHTML = ''; // Bersihkan layer setiap frame

    trains.forEach(t => {
        const trainContainer = document.createElement('div');
        trainContainer.className = 'train-container ' + t.type;
        
        // --- LOGIKA POSISI (Sesuai SVG Schematic) ---
        // X Position: Persen horizontal
        trainContainer.style.left = t.position + '%';
        
        // Y Position: Menentukan Jalur
        // Default: Tengah (Petak Blok) -> Y = 100px (50% dari height 200px)
        let topPos = 100; 
        
        // AREA WESEL & EMPLASEMEN (Antara 10% s.d. 90% peta)
        // Di SVG, wesel mulai membelah di 10% dan menyatu lagi di 90%
        if (t.position > 10 && t.position < 90) {
            
            // Masuk Jalur 1 (Atas)
            // Y = 50px (25% dari height)
            if (t.type === 'COMMUTER' || t.type === 'PASSENGER') {
                topPos = 50; 
            } 
            
            // Masuk Jalur 2 (Bawah)
            // Y = 150px (75% dari height)
            if (t.type === 'FREIGHT') {
                topPos = 150; 
            }
        }

        trainContainer.style.top = topPos + 'px';

        // --- RENDER BENTUK KERETA ---
        
        // 1. Label Nomor KA
        const label = document.createElement('div');
        label.className = 'train-label';
        label.innerText = t.ka_id;
        trainContainer.appendChild(label);

        // 2. Gerbong
        if (t.type === 'COMMUTER') {
            // Render 3 Gerbong KRL
            for(let i=0; i<3; i++) {
                const car = document.createElement('div');
                car.className = 'car';
                trainContainer.appendChild(car);
            }
        } else if (t.type === 'FREIGHT') {
            // Render 1 Lokomotif
            const loco = document.createElement('div');
            loco.className = 'loco';
            trainContainer.appendChild(loco);
            // Render 4 Gerbong Barang
            for(let i=0; i<4; i++) {
                const wagon = document.createElement('div');
                wagon.className = 'wagon';
                trainContainer.appendChild(wagon);
            }
        }

        layer.appendChild(trainContainer);
    });
});

// === FUNGSI REQUEST KE SERVER ===

async function requestRoute(routeId) {
    try {
        const res = await fetch('/api/route', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ routeId })
        });
        const d = await res.json();
        
        if(d.status === 'failed') {
            alert("⚠️ " + d.reason); // Alert Error
        }
    } catch (e) {
        console.error(e);
    }
}

async function releaseRoute(routeId) {
    await fetch('/api/release-route', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ routeId })
    });
}