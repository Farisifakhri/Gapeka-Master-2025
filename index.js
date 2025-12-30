const gameLoop = require('./src/core/GameLoop');
const level1 = require('./src/levels/Level1');

// 1. Load Level
level1.init();

// 2. Start Engine
gameLoop.start();