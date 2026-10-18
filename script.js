const gameContainer = document.getElementById('game-container');
const core = document.getElementById('core');
const scoreEl = document.getElementById('score');
const lightningBtn = document.getElementById('lightning-btn');
const startScreen = document.getElementById('start-screen');
const volumeModal = document.getElementById('volume-modal');
const volumeSlider = document.getElementById('volume-slider');
const volumeDisplay = document.getElementById('volume-display');
const countdownScreen = document.getElementById('countdown-screen');
const countdownText = document.getElementById('countdown-text');
const gameoverScreen = document.getElementById('gameover-screen');
const endTitle = document.getElementById('end-title');
const endMessage = document.getElementById('end-message');
const finalRankEl = document.getElementById('final-rank');
const canvas = document.getElementById('drawing-canvas');
const ctx = canvas.getContext('2d');

let score = 0;
let lives = 5;
let lightningCharges = 0;
let heartObj = null;
let gameActive = false;
let viruses = [];
let gameLoopInterval = null;
let currentSpawnDelay = 1500;
let baseSpeed = 1.9;

let isBossActive = false;
let bossPhase = 1;
let bossEl = null;
let bossX = 0;
let bossY = 0;
let bossSequence = [];
let bossCurrentIndex = 0;

// Sistema de Som (Web Audio API)
let audioCtx = null;
let masterGain = null;
let musicTimer = null;
let beatStep = 0;
let currentVolumeValue = 0.5;
const bassNotes = [110, 110, 146.83, 130.81, 98.0, 110, 164.81, 146.83];

function initAudio() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        masterGain = audioCtx.createGain();
        masterGain.gain.setValueAtTime(currentVolumeValue, audioCtx.currentTime);
        masterGain.connect(audioCtx.destination);
    }
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
}

function updateVolume(val) {
    currentVolumeValue = val / 100;
    volumeDisplay.innerText = val;
    if (masterGain && audioCtx) {
        masterGain.gain.setValueAtTime(currentVolumeValue, audioCtx.currentTime);
    }
}

function toggleVolumeModal() {
    initAudio();
    stopDrawing();
    if (volumeModal.style.display === 'none') {
        volumeModal.style.display = 'flex';
        startScreen.style.display = 'none';
    } else {
        volumeModal.style.display = 'none';
        startScreen.style.display = 'flex';
    }
}

function playCountdownSound(isFinal = false) {
    initAudio();
    if (!audioCtx || !masterGain) return;
    let time = audioCtx.currentTime;
    let osc = audioCtx.createOscillator();
    let gain = audioCtx.createGain();

    osc.type = isFinal ? 'triangle' : 'sine';
    osc.frequency.setValueAtTime(isFinal ? 587.33 : 440, time);
    osc.frequency.exponentialRampToValueAtTime(isFinal ? 880 : 220, time + 0.3);

    gain.gain.setValueAtTime(0.4, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.3);

    osc.connect(gain);
    gain.connect(masterGain);
    osc.start(time);
    osc.stop(time + 0.3);
}

function playScoreTickSound() {
    initAudio();
    if (!audioCtx || !masterGain) return;
    let time = audioCtx.currentTime;
    let osc = audioCtx.createOscillator();
    let gain = audioCtx.createGain();

    osc.type = 'square';
    osc.frequency.setValueAtTime(300 + Math.random() * 400, time);

    gain.gain.setValueAtTime(0.08, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.05);

    osc.connect(gain);
    gain.connect(masterGain);
    osc.start(time);
    osc.stop(time + 0.05);
}

function animateFinalScore(targetScore, labelPrefix) {
    let currentCount = 0;
    let totalSteps = 40;
    let stepTime = 40;

    let scoreInterval = setInterval(() => {
        currentCount += Math.ceil(targetScore / totalSteps) || 1;
        if (currentCount >= targetScore) {
            currentCount = targetScore;
            clearInterval(scoreInterval);
        }
        playScoreTickSound();
        finalRankEl.innerText = `${labelPrefix}: ${currentCount}`;
    }, stepTime);
}

function startMusic() {
    initAudio();
    stopMusic();
    beatStep = 0;
    musicTimer = setInterval(playBeat, 120);
}

function stopMusic() {
    if (musicTimer) {
        clearInterval(musicTimer);
        musicTimer = null;
    }
}

function playBeat() {
    if (!audioCtx || !masterGain) return;
    let time = audioCtx.currentTime;

    if (beatStep % 2 === 0) {
        let osc = audioCtx.createOscillator();
        let gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(130, time);
        osc.frequency.exponentialRampToValueAtTime(30, time + 0.12);

        gain.gain.setValueAtTime(0.7, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + 0.12);

        osc.connect(gain);
        gain.connect(masterGain);
        osc.start(time);
        osc.stop(time + 0.12);
    }

    let noteIndex = Math.floor(beatStep / 2) % bassNotes.length;
    let freq = bassNotes[noteIndex];
    if (isBossActive) freq *= 1.25;

    let bassOsc = audioCtx.createOscillator();
    let bassGain = audioCtx.createGain();
    bassOsc.type = 'sawtooth';
    bassOsc.frequency.setValueAtTime(freq, time);

    let filter = audioCtx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(800, time);

    bassGain.gain.setValueAtTime(0.2, time);
    bassGain.gain.exponentialRampToValueAtTime(0.001, time + 0.18);

    bassOsc.connect(filter);
    filter.connect(bassGain);
    bassGain.connect(masterGain);
    bassOsc.start(time);
    bassOsc.stop(time + 0.18);

    beatStep = (beatStep + 1) % 16;
}

const traceList = [
    { id: 'up', symbol: '⬆️' },
    { id: 'down', symbol: '⬇️' },
    { id: 'diagonal', symbol: '↗️' },
    { id: 'spiral', symbol: '🌀' }
];

let drawing = false;
let strokePoints = [];
let activeFadePoints = [];

function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

function stopDrawing() {
    if (drawing) {
        drawing = false;
        if (strokePoints.length > 2) {
            let recognizedTrace = recognizeTraceFlexible(strokePoints);
            processPlayerDrawing(recognizedTrace);
            activeFadePoints.push({ points: [...strokePoints], alpha: 1.0 });
        }
        strokePoints = [];
    }
}

canvas.addEventListener('pointerdown', (e) => {
    if (!gameActive && !isBossActive) return;
    drawing = true;
    strokePoints = [{ x: e.clientX, y: e.clientY }];
});

window.addEventListener('pointermove', (e) => {
    if (!drawing || (!gameActive && !isBossActive)) return;
    strokePoints.push({ x: e.clientX, y: e.clientY });
});

window.addEventListener('pointerup', stopDrawing);
window.addEventListener('pointercancel', stopDrawing);
window.addEventListener('blur', stopDrawing);

const countdownSteps = ["VAMOS", "PREPARADO", "VAI!"];

function startCountdown() {
    initAudio();
    stopDrawing();
    startScreen.style.display = 'none';
    countdownScreen.style.display = 'flex';

    let step = 0;
    countdownText.innerText = countdownSteps[step];
    playCountdownSound(false);

    let countInterval = setInterval(() => {
        step++;
        if (step < countdownSteps.length) {
            countdownText.innerText = countdownSteps[step];
            playCountdownSound(step === countdownSteps.length - 1);
        } else {
            clearInterval(countInterval);
            countdownScreen.style.display = 'none';
            initGame();
        }
    }, 800);
}

function initGame() {
    score = 0;
    lives = 5;
    lightningCharges = 0;
    updateLightningButton();
    currentSpawnDelay = 1500;
    baseSpeed = 1.9;
    scoreEl.innerText = score;
    updateLifeDisplay();
    gameActive = true;
    isBossActive = false;
    bossPhase = 1;

    document.querySelectorAll('.virus, .heart-corner').forEach(v => v.remove());
    if (bossEl) { bossEl.remove(); bossEl = null; }
    if (heartObj) { heartObj.element.remove(); heartObj = null; }
    viruses = [];
    activeFadePoints = [];
    strokePoints = [];
    drawing = false;

    startMusic();
    scheduleSpawn();
    scheduleHeartSpawn();
    if (gameLoopInterval) cancelAnimationFrame(gameLoopInterval);
    gameLoopInterval = requestAnimationFrame(updateGame);
}

function updateLifeDisplay() {
    for (let i = 1; i <= 5; i++) {
        const block = document.getElementById(`life-${i}`);
        if (block) {
            if (i <= lives) {
                block.classList.remove('lost');
            } else {
                block.classList.add('lost');
            }
        }
    }
}

function updateLightningButton() {
    if (lightningCharges > 0 && isBossActive) {
        lightningBtn.style.display = 'inline-block';
        lightningBtn.innerText = `⚡ USAR RAIO (${lightningCharges})`;
    } else {
        lightningBtn.style.display = 'none';
    }
}

function scheduleSpawn() {
    if (!gameActive || isBossActive) return;
    spawnVirus();
    setTimeout(scheduleSpawn, currentSpawnDelay);
}

function scheduleHeartSpawn() {
    if (!gameActive) return;
    let randomTime = Math.random() * 12000 + 8000;
    setTimeout(() => {
        if (gameActive && !heartObj && lives < 5) {
            spawnCornerHeart();
        }
        scheduleHeartSpawn();
    }, randomTime);
}

function spawnCornerHeart() {
    if (heartObj) return;
    const heartEl = document.createElement('div');
    const t1 = traceList[Math.floor(Math.random() * traceList.length)];
    heartEl.className = 'heart-corner';
    heartEl.innerHTML = `❤️ ${t1.symbol}`;

    const corners = [
        { x: 80, y: 80 },
        { x: window.innerWidth - 80, y: 80 },
        { x: 80, y: window.innerHeight - 80 },
        { x: window.innerWidth - 80, y: window.innerHeight - 80 }
    ];
    let chosenCorner = corners[Math.floor(Math.random() * corners.length)];

    heartEl.style.left = `${chosenCorner.x}px`;
    heartEl.style.top = `${chosenCorner.y}px`;
    gameContainer.appendChild(heartEl);

    heartObj = {
        element: heartEl,
        x: chosenCorner.x,
        y: chosenCorner.y,
        traceSequence: [t1.id]
    };
}

function spawnVirus() {
    if (!gameActive || isBossActive) return;

    const virusEl = document.createElement('div');
    const randType = Math.random();
    let vType, speedMultiplier, symbol, traceSequence = [];

    const t1 = traceList[Math.floor(Math.random() * traceList.length)];
    const t2 = traceList[Math.floor(Math.random() * traceList.length)];
    const t3 = traceList[Math.floor(Math.random() * traceList.length)];

    if (randType < 0.22) {
        vType = 'slow';
        speedMultiplier = 0.6;
        symbol = t1.symbol;
        traceSequence = [t1.id];
        virusEl.className = 'virus virus-slow';
    } else if (randType < 0.42) {
        vType = 'double';
        speedMultiplier = 0.85;
        symbol = `${t1.symbol} ${t2.symbol}`;
        traceSequence = [t1.id, t2.id];
        virusEl.className = 'virus virus-double';
    } else if (randType < 0.60) {
        vType = 'ghost';
        speedMultiplier = 0.8;
        symbol = `👻 ${t1.symbol}${t2.symbol}${t3.symbol}`;
        traceSequence = [t1.id, t2.id, t3.id];
        virusEl.className = 'virus virus-ghost';
    } else if (randType < 0.82) {
        vType = 'bomb';
        speedMultiplier = 0.75;
        symbol = `💣 ${t1.symbol}${t2.symbol}`;
        traceSequence = [t1.id, t2.id];
        virusEl.className = 'virus virus-bomb';
    } else {
        vType = 'normal';
        speedMultiplier = 1.0;
        symbol = t1.symbol;
        traceSequence = [t1.id];
        virusEl.className = 'virus virus-normal';
    }

    virusEl.innerHTML = symbol;

    const width = window.innerWidth;
    const height = window.innerHeight;
    let x, y;

    if (Math.random() < 0.5) {
        x = Math.random() < 0.5 ? -40 : width + 40;
        y = Math.random() * height;
    } else {
        x = Math.random() * width;
        y = Math.random() < 0.5 ? -40 : height + 40;
    }

    virusEl.style.left = `${x}px`;
    virusEl.style.top = `${y}px`;

    gameContainer.appendChild(virusEl);

    viruses.push({
        element: virusEl,
        x: x,
        y: y,
        traceSequence: traceSequence,
        currentIndex: 0,
        type: vType,
        speedMultiplier: speedMultiplier
    });
}

function recognizeTraceFlexible(points) {
    let start = points[0];
    let end = points[points.length - 1];
    let minX = Math.min(...points.map(p => p.x));
    let maxX = Math.max(...points.map(p => p.x));
    let minY = Math.min(...points.map(p => p.y));
    let maxY = Math.max(...points.map(p => p.y));

    let widthBox = maxX - minX;
    let heightBox = maxY - minY;

    let distStartEnd = Math.hypot(start.x - end.x, start.y - end.y);
    let pathLength = 0;
    for (let i = 1; i < points.length; i++) {
        pathLength += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
    }

    if (pathLength > distStartEnd * 1.8 && pathLength > 40) {
        return 'spiral';
    }

    let deltaY = end.y - start.y;
    let deltaX = end.x - start.x;

    if (widthBox > 30 && heightBox > 30 && Math.abs(Math.abs(deltaX) - Math.abs(deltaY)) < Math.max(widthBox, heightBox) * 0.6) {
        return 'diagonal';
    }

    return deltaY < 0 ? 'up' : 'down';
}

function processPlayerDrawing(traceId) {
    triggerCorePulse();
    let centerX = window.innerWidth / 2;
    let centerY = window.innerHeight / 2;

    if (isBossActive) {
        if (bossSequence[bossCurrentIndex] === traceId) {
            bossCurrentIndex++;
            if (bossCurrentIndex < bossSequence.length) {
                showFeedback(`BOSS COMBO (${bossCurrentIndex}/${bossSequence.length})`, "feedback-boss");
            } else {
                handleBossPhaseClear();
            }
        } else {
            showFeedback("ERRO NO BOSS! (-2 VIDAS)", "feedback-bruh");
            loseLife();
            loseLife();
        }
        return;
    }

    if (heartObj && heartObj.traceSequence[0] === traceId) {
        showFeedback("VIDA RECUPERADA! ❤️", "feedback-perfect");
        if (lives < 5) lives++;
        updateLifeDisplay();
        heartObj.element.remove();
        heartObj = null;
        return;
    }

    let matchingViruses = viruses.filter(v => {
        return v.traceSequence && v.traceSequence[v.currentIndex] === traceId;
    });

    if (matchingViruses.length > 0) {
        matchingViruses.sort((a, b) => {
            let distA = Math.hypot(centerX - a.x, centerY - a.y);
            let distB = Math.hypot(centerX - b.x, centerY - b.y);
            return distA - distB;
        });

        let closest = matchingViruses[0];
        closest.currentIndex++;

        let opacityVal = 1 - (closest.currentIndex / closest.traceSequence.length);
        closest.element.style.opacity = Math.max(opacityVal, 0.2);

        if (closest.currentIndex < closest.traceSequence.length) {
            showFeedback("COMBO... (" + closest.currentIndex + "/" + closest.traceSequence.length + ")", "feedback-good");
            return;
        }

        if (closest.type === 'ghost') {
            showFeedback("FANTASMA EXORCIZADO!", "feedback-ghost");
            viruses.forEach(v => v.element.remove());
            viruses = [];
            addScore(100);
            return;
        }

        if (closest.type === 'bomb') {
            lightningCharges++;
            updateLightningButton();
            showFeedback("RAIO ENERGÉTICO CARREGADO! ⚡", "feedback-lightning");
            viruses = viruses.filter(v => {
                let d = Math.hypot(closest.x - v.x, closest.y - v.y);
                if (d < 220) {
                    v.element.remove();
                    return false;
                }
                return true;
            });
            addScore(80);
            closest.element.remove();
            return;
        }

        handleHit(closest);
    } else {
        wrongAction();
    }
}

function handleHit(virus) {
    showFeedback("PERFEITO!", "feedback-perfect");
    createParticles(virus.x, virus.y);
    virus.element.remove();
    viruses = viruses.filter(v => v !== virus);
    addScore(50);
}

function wrongAction() {
    showFeedback("ERRADO!", "feedback-bruh");
    core.classList.add('damaged');
    setTimeout(() => core.classList.remove('damaged'), 200);
}

function addScore(pts) {
    score += pts;
    if (score > 1000) score = 1000;
    scoreEl.innerText = score;

    if (score >= 1000 && !isBossActive) {
        triggerBossEncounter();
    }
}

function triggerBossEncounter() {
    isBossActive = true;
    viruses.forEach(v => v.element.remove());
    viruses = [];
    if (heartObj) { heartObj.element.remove(); heartObj = null; }

    bossEl = document.createElement('div');
    bossEl.className = 'boss';
    bossEl.innerHTML = `🤖 <b>BOSS FINAL</b><br>Fase ${bossPhase}/3`;
    bossX = window.innerWidth / 2;
    bossY = window.innerHeight / 2 - 120;
    bossEl.style.left = `${bossX}px`;
    bossEl.style.top = `${bossY}px`;
    gameContainer.appendChild(bossEl);

    generateBossSequence();
    updateLightningButton();
    showFeedback("O BOSS APARECEU!", "feedback-boss");
}

function generateBossSequence() {
    bossSequence = [];
    let length = bossPhase === 1 ? 4 : (bossPhase === 2 ? 6 : 8);
    for (let i = 0; i < length; i++) {
        let randTrace = traceList[Math.floor(Math.random() * traceList.length)];
        bossSequence.push(randTrace.id);
    }
    bossCurrentIndex = 0;
    showBossSequenceSymbols();
}

function showBossSequenceSymbols() {
    let symbols = bossSequence.map(id => {
        let found = traceList.find(t => t.id === id);
        return found ? found.symbol : '';
    }).join(' ');
    bossEl.innerHTML = `🤖 <b>SEQUÊNCIA</b><br>${symbols}`;
}

function handleBossPhaseClear() {
    bossPhase++;
    if (bossPhase > 3) {
        winGame();
    } else {
        showFeedback(`FASE ${bossPhase - 1} SUPERADA!`, "feedback-boss");
        generateBossSequence();
        updateLightningButton();
    }
}

function triggerLightningBolt() {
    if (lightningCharges <= 0 || !isBossActive) return;
    lightningCharges--;
    updateLightningButton();
    showFeedback("RAIO DISPARADO CONTRA O BOSS! ⚡", "feedback-lightning");
    handleBossPhaseClear();
}

function loseLife() {
    lives--;
    updateLifeDisplay();
    core.classList.add('damaged');
    setTimeout(() => core.classList.remove('damaged'), 200);

    if (lives <= 0) {
        gameOver();
    }
}

function gameOver() {
    gameActive = false;
    isBossActive = false;
    stopDrawing();
    stopMusic();
    if (bossEl) { bossEl.remove(); bossEl = null; }
    document.querySelectorAll('.virus, .heart-corner').forEach(v => v.remove());

    endTitle.innerText = "FALHA NO SISTEMA!";
    endMessage.innerText = "Você perdeu toda a integridade do núcleo.";
    gameoverScreen.style.display = 'flex';
    finalRankEl.innerText = `Pontuação Final: 0`;
    animateFinalScore(score, "Pontuação Final");
}

function winGame() {
    gameActive = false;
    isBossActive = false;
    stopDrawing();
    stopMusic();
    if (bossEl) { bossEl.remove(); bossEl = null; }
    document.querySelectorAll('.virus, .heart-corner').forEach(v => v.remove());

    endTitle.innerText = "SISTEMA SALVO!";
    endMessage.innerText = "Você derrotou o Boss e restaurou o sistema com sucesso!";
    gameoverScreen.style.display = 'flex';
    finalRankEl.innerText = `Pontuação Final: 0`;
    animateFinalScore(score, "Pontuação Final");

    if (typeof confetti === 'function') {
        confetti({
            particleCount: 150,
            spread: 80,
            origin: { y: 0.6 }
        });
    }
}

function resetGame() {
    gameoverScreen.style.display = 'none';
    startScreen.style.display = 'flex';
}

function showFeedback(text, className) {
    let fb = document.createElement('div');
    fb.className = `rhythm-feedback ${className}`;
    fb.innerText = text;
    gameContainer.appendChild(fb);
    setTimeout(() => fb.remove(), 600);
}

function triggerCorePulse() {
    core.classList.add('pulse');
    setTimeout(() => core.classList.remove('pulse'), 100);
}

function createParticles(x, y) {
    for (let i = 0; i < 8; i++) {
        let p = document.createElement('div');
        p.className = 'particle';
        p.style.left = `${x}px`;
        p.style.top = `${y}px`;
        gameContainer.appendChild(p);

        let angle = Math.random() * Math.PI * 2;
        let speed = Math.random() * 4 + 2;
        let vx = Math.cos(angle) * speed;
        let vy = Math.sin(angle) * speed;

        let px = x;
        let py = y;
        let alpha = 1;

        let pInterval = setInterval(() => {
            px += vx;
            py += vy;
            alpha -= 0.05;
            p.style.left = `${px}px`;
            p.style.top = `${py}px`;
            p.style.opacity = alpha;

            if (alpha <= 0) {
                clearInterval(pInterval);
                p.remove();
            }
        }, 20);
    }
}

function updateGame() {
    if (!gameActive) return;

    let centerX = window.innerWidth / 2;
    let centerY = window.innerHeight / 2;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Desenhar traços ativos que desaparecem gradualmente
    for (let i = activeFadePoints.length - 1; i >= 0; i--) {
        let fade = activeFadePoints[i];
        if (fade.points.length < 2) continue;

        ctx.beginPath();
        ctx.moveTo(fade.points[0].x, fade.points[0].y);
        for (let j = 1; j < fade.points.length; j++) {
            ctx.lineTo(fade.points[j].x, fade.points[j].y);
        }
        ctx.strokeStyle = `rgba(0, 255, 204, ${fade.alpha})`;
        ctx.lineWidth = 4;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.shadowColor = '#00ffcc';
        ctx.shadowBlur = 10;
        ctx.stroke();

        fade.alpha -= 0.04;
        if (fade.alpha <= 0) {
            activeFadePoints.splice(i, 1);
        }
    }

    // Desenhar o traço atual do jogador em tempo real
    if (drawing && strokePoints.length > 1) {
        ctx.beginPath();
        ctx.moveTo(strokePoints[0].x, strokePoints[0].y);
        for (let i = 1; i < strokePoints.length; i++) {
            ctx.lineTo(strokePoints[i].x, strokePoints[i].y);
        }
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 5;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.shadowColor = '#ffffff';
        ctx.shadowBlur = 15;
        ctx.stroke();
    }

    // Atualizar e mover os vírus em direção ao centro
    for (let i = viruses.length - 1; i >= 0; i--) {
        let v = viruses[i];
        let angle = Math.atan2(centerY - v.y, centerX - v.x);
        let speed = baseSpeed * v.speedMultiplier;

        v.x += Math.cos(angle) * speed;
        v.y += Math.sin(angle) * speed;

        v.element.style.left = `${v.x}px`;
        v.element.style.top = `${v.y}px`;

        let distToCenter = Math.hypot(centerX - v.x, centerY - v.y);
        if (distToCenter < 50) {
            v.element.remove();
            viruses.splice(i, 1);
            loseLife();
        }
    }

    gameLoopInterval = requestAnimationFrame(updateGame);
}
