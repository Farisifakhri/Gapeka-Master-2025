const Level1 = require('../levels/Level1'); 
const fs = require('fs');

class GameManager {
    constructor(io) {
        this.io = io;
        this.currentLevel = null;
        this.currentScenarioId = 0;
        
        // JADWAL REAL (Disalin dari data Anda)
        this.realTimeScheduleDB = [
            { no: "223", name: "KA Pangrango", route: "SUKABUMI-BOGOR", time: "06:23" },
            { no: "224", name: "KA Pangrango", route: "BOGOR-SUKABUMI", time: "08:14" },
            { no: "225", name: "KA Pangrango", route: "SUKABUMI-BOGOR", time: "11:43" },
            { no: "226", name: "KA Pangrango", route: "BOGOR-SUKABUMI", time: "13:09" },
            { no: "227", name: "KA Pangrango", route: "SUKABUMI-BOGOR", time: "16:03" },
            { no: "228", name: "KA Pangrango", route: "BOGOR-SUKABUMI", time: "17:29" },
            { no: "229", name: "KA Pangrango", route: "SUKABUMI-BOGOR", time: "20:28" },
            { no: "230", name: "KA Pangrango", route: "BOGOR-SUKABUMI", time: "22:01" }
        ];

        this.initSocketListeners();
    }

    initSocketListeners() {
        this.io.on('connection', (socket) => {
            console.log('Player connected:', socket.id);
            socket.emit('show_menu');

            socket.on('select_level', (id) => this.loadScenario(parseInt(id), socket));
            
            socket.on('game_action', (payload) => {
                if (this.currentLevel?.handleInput) this.currentLevel.handleInput(payload.action, payload.data);
            });
            
            // Fitur Back to Menu
            socket.on('request_menu', () => {
                if(this.currentLevel) this.currentLevel.stop();
                socket.emit('show_menu');
            });
        });
    }

    loadScenario(id, socket) {
        console.log(`Loading Scenario ${id}`);
        if (this.currentLevel) this.currentLevel.stop();

        // Selalu pakai Map Maseng (Level1) untuk sekarang
        this.currentLevel = new Level1(this.io);
        this.currentScenarioId = id;

        let gapeka = [];
        let title = "";

        switch(id) {
            case 1: // Tutorial Dasar
                title = "TUTORIAL: DASAR";
                gapeka = [{
                    "ka_no": "224", "ka_name": "KA Pangrango", "route": ["MSG"], "status": "NOT_STARTED",
                    "schedule": [{ "station_id": "MSG", "arr_time": 5, "dep_time": 30, "action": "STOP" }]
                }];
                break;
            case 2: // Crossing
                title = "TUTORIAL: PERSILANGAN";
                gapeka = [
                    { "ka_no": "KA-S1", "ka_name": "KA Sukabumi (Jalur 2)", "status": "NOT_STARTED", "schedule": [{ "station_id": "MSG", "arr_time": 10, "dep_time": 60, "action": "STOP", "track_hint": "T2" }] },
                    { "ka_no": "KA-S2", "ka_name": "KA Bogor (Jalur 1)", "status": "NOT_STARTED", "schedule": [{ "station_id": "MSG", "arr_time": 25, "dep_time": 65, "action": "STOP", "track_hint": "T1" }] }
                ];
                break;
            case 3: // Random
                const event = this.getRandomEvent();
                title = `EVENT: ${event.name}`;
                gapeka = event.gapeka;
                break;
            case 4: // Real Time
                title = "MODE: REAL TIME (WIB)";
                gapeka = this.generateRealTimeGapeka();
                if(this.currentLevel.trainManager) this.currentLevel.trainManager.setRealTimeMode(true);
                break;
        }

        this.currentLevel.trainManager.loadGapeka(gapeka);
        this.currentLevel.start();

        // Update Client
        socket.emit('init_map', this.currentLevel.getMapData());
        socket.emit('hide_menu');
        this.io.emit('update_hud_info', { mode: title });
    }

    getRandomEvent() {
        const events = [
            { name: "KA Inspeksi (KAIS)", code: "KLB-KAIS", action: "PASS" },
            { name: "KA Ukur Rel", code: "KLB-UKUR", action: "STOP" },
            { name: "KA Barang Kricak", code: "KLB-KRICAK", action: "STOP" }
        ];
        const sel = events[Math.floor(Math.random() * events.length)];
        return {
            name: sel.name,
            gapeka: [{ "ka_no": sel.code, "ka_name": sel.name, "status": "NOT_STARTED", "schedule": [{ "station_id": "MSG", "arr_time": 15, "dep_time": 40, "action": sel.action }] }]
        };
    }

    generateRealTimeGapeka() {
        const now = new Date();
        const curMins = (now.getHours() * 60) + now.getMinutes();
        let schedule = [];

        this.realTimeScheduleDB.forEach(t => {
            const [h, m] = t.time.split(':').map(Number);
            const tMins = (h * 60) + m;
            const diff = curMins - tMins;

            // Jika jadwal di masa depan (max 60 menit)
            if (diff < 0 && Math.abs(diff) <= 60) {
                schedule.push(this.makeRealTimeObj(t, 0, false));
            }
            // Jika jadwal LEWAT tapi < 5 menit (Late Spawn)
            else if (diff >= 0 && diff <= 5) {
                schedule.push(this.makeRealTimeObj(t, 1, true));
            }
        });
        return schedule;
    }

    makeRealTimeObj(db, delay, isLate) {
        return {
            "ka_no": db.no,
            "ka_name": `${db.name}${isLate ? ' [TERLAMBAT]' : ''}`,
            "status": "NOT_STARTED",
            "real_time_schedule": db.time,
            "is_late_spawn": isLate,
            "schedule": [{ "station_id": "MSG", "arr_time": delay, "dep_time": 999, "action": "STOP" }]
        };
    }
}
module.exports = GameManager;