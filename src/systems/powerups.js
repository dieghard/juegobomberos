const POWER_UP_TYPES = ['shield', 'water', 'slowmo'];
const POWER_UP_COOLDOWN = 8000;
const SLOWMO_GAME_FACTOR = 0.5;
const SLOWMO_FIRE_FACTOR = 0.55;

export function createPowerUpSystem({
    indicatorElement,
    fires,
    groundFires = null,
    firetruck,
    triggerVibration,
    createTone,
    createParticle,
    onScoreBonus,
    onWaterBlast
}) {
    const powerUps = [];
    let shieldActive = false;
    let shieldExpiresAt = 0;
    let slowMotionActive = false;
    let slowMotionExpiresAt = 0;
    let transientMessage = '';
    let transientMessageExpiresAt = 0;
    let lastSpawnTime = 0;

    function reset() {
        powerUps.length = 0;
        shieldActive = false;
        shieldExpiresAt = 0;
        slowMotionActive = false;
        slowMotionExpiresAt = 0;
        transientMessage = '';
        transientMessageExpiresAt = 0;
        lastSpawnTime = Date.now() - POWER_UP_COOLDOWN;
        updateIndicator();
    }

    function maybeSpawn(canvasWidth) {
        const now = Date.now();
        if (powerUps.length >= 2) return false;
        if (now - lastSpawnTime < POWER_UP_COOLDOWN) return false;

        const chance = slowMotionActive ? 0.0015 : 0.0035;
        if (Math.random() >= chance) return false;

        const type = POWER_UP_TYPES[Math.floor(Math.random() * POWER_UP_TYPES.length)];
        const size = 32;

        powerUps.push({
            type,
            x: Math.random() * (canvasWidth - size),
            y: -size,
            width: size,
            height: size,
            speed: 1 + Math.random() * 1.5
        });

        lastSpawnTime = now;
        return true;
    }

    function update(canvasHeight, checkCollision) {
        for (let i = powerUps.length - 1; i >= 0; i--) {
            const powerUp = powerUps[i];
            powerUp.y += powerUp.speed;

            if (powerUp.y > canvasHeight + powerUp.height) {
                powerUps.splice(i, 1);
                continue;
            }

            if (checkCollision(firetruck, powerUp)) {
                applyPowerUp(powerUp);
                powerUps.splice(i, 1);
            }
        }

        updateStatuses();
    }

    function draw(ctx) {
        ctx.save();

        powerUps.forEach((powerUp) => {
            const centerX = powerUp.x + powerUp.width / 2;
            const centerY = powerUp.y + powerUp.height / 2;

            let gradient;
            switch (powerUp.type) {
                case 'shield':
                    gradient = ctx.createRadialGradient(centerX, centerY, 4, centerX, centerY, powerUp.width / 2);
                    gradient.addColorStop(0, 'rgba(129, 212, 250, 1)');
                    gradient.addColorStop(1, 'rgba(1, 87, 155, 0.3)');
                    break;
                case 'water':
                    gradient = ctx.createRadialGradient(centerX, centerY, 4, centerX, centerY, powerUp.width / 2);
                    gradient.addColorStop(0, 'rgba(129, 199, 132, 1)');
                    gradient.addColorStop(1, 'rgba(27, 94, 32, 0.3)');
                    break;
                case 'slowmo':
                default:
                    gradient = ctx.createRadialGradient(centerX, centerY, 4, centerX, centerY, powerUp.width / 2);
                    gradient.addColorStop(0, 'rgba(255, 214, 0, 1)');
                    gradient.addColorStop(1, 'rgba(255, 171, 0, 0.3)');
                    break;
            }

            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.arc(centerX, centerY, powerUp.width / 2, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = 'rgba(255,255,255,0.9)';
            ctx.font = 'bold 16px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            const icon = powerUp.type === 'shield' ? '🛡️' : powerUp.type === 'water' ? '💧' : '🐢';
            ctx.fillText(icon, centerX, centerY);
        });

        ctx.restore();
    }

    function drawSlowMotionOverlay(ctx, canvas) {
        if (!slowMotionActive) return;

        ctx.save();
        const pulse = 0.18 + Math.sin(Date.now() * 0.01) * 0.05;
        ctx.fillStyle = `rgba(2, 119, 189, ${pulse})`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = `rgba(224, 247, 250, ${pulse + 0.05})`;
        ctx.lineWidth = 4;
        ctx.strokeRect(6, 6, canvas.width - 12, canvas.height - 12);
        ctx.restore();
    }

    function absorbFire(fire, firesArray, index) {
        if (!shieldActive) return false;
        createParticle(fire.x, fire.y, '129,212,250');
        firesArray.splice(index, 1);
        return true;
    }

    function applyPowerUp(powerUp) {
        spawnPickupEffect(powerUp);

        switch (powerUp.type) {
            case 'shield':
                activateShield();
                break;
            case 'water':
                activateWaterBlast();
                break;
            case 'slowmo':
            default:
                activateSlowMotion();
                break;
        }
    }

    function activateShield() {
        shieldActive = true;
        shieldExpiresAt = Date.now() + 5000;
        transientMessage = '🛡️ Escudo activado';
        transientMessageExpiresAt = Date.now() + 1200;
        triggerVibration?.([80, 40, 80]);
        createTone?.(520, 0.2, 'sine', 0.25);
        updateIndicator();
    }

    function activateWaterBlast() {
        const airborneCleared = fires.length;
        const groundCleared = groundFires ? groundFires.length : 0;
        const totalCleared = airborneCleared + groundCleared;

        const waterAudioLevel = totalCleared >= 10 ? 'large' : totalCleared >= 5 ? 'medium' : totalCleared >= 1 ? 'small' : 'minimal';

        if (airborneCleared > 0) {
            for (const fire of fires) {
                createParticle(fire.x, fire.y, '0,150,255');
            }
            fires.length = 0;
            onScoreBonus?.(50 + Math.min(airborneCleared * 5, 40));
        }

        if (groundCleared > 0 && groundFires) {
            const splashColor = '0,188,212';
            for (const groundFire of groundFires) {
                const baseY = (groundFire.y ?? 0) - 8;
                const splashCount = Math.max(4, Math.round((groundFire.width / 18) + totalCleared * 0.6));
                for (let i = 0; i < splashCount; i++) {
                    const offset = (Math.random() - 0.5) * groundFire.width * (1 + totalCleared * 0.05);
                    const x = groundFire.x + offset;
                    const y = baseY - Math.random() * (12 + totalCleared * 2);
                    createParticle(x, y, splashColor);
                }
            }
            groundFires.length = 0;
        }

        if (totalCleared > 0) {
            onWaterBlast?.({
                totalCleared,
                airborneCleared,
                groundCleared
            });
        } else {
            onWaterBlast?.({ totalCleared: 0, airborneCleared: 0, groundCleared: 0 });
        }

        if (totalCleared >= 10) {
            transientMessage = `💧 Limpieza épica (${totalCleared})`;
        } else if (totalCleared >= 5) {
            transientMessage = `💧 Limpieza intensa (${totalCleared})`;
        } else if (totalCleared >= 1) {
            transientMessage = `💧 Refrescado (${totalCleared})`;
        } else {
            transientMessage = '💧 Bomba de agua activada';
        }

        transientMessageExpiresAt = Date.now() + (totalCleared > 0 ? 2500 : 2000);
        triggerVibration?.([120, 60, 40, 60]);
        playWaterBlastAudio(waterAudioLevel);
        updateIndicator();
    }

    function playWaterBlastAudio(level) {
        if (!createTone) return;

        switch (level) {
            case 'large':
                createTone(320, 0.28, 'sawtooth', 0.32);
                setTimeout(() => createTone(220, 0.36, 'triangle', 0.28), 20);
                setTimeout(() => createTone(140, 0.46, 'sine', 0.24), 60);
                break;
            case 'medium':
                createTone(280, 0.22, 'square', 0.28);
                setTimeout(() => createTone(190, 0.28, 'triangle', 0.22), 30);
                break;
            case 'small':
                createTone(240, 0.18, 'square', 0.24);
                setTimeout(() => createTone(170, 0.20, 'triangle', 0.18), 25);
                break;
            default:
                createTone(200, 0.12, 'sine', 0.15);
        }
    }

    function activateSlowMotion() {
        slowMotionActive = true;
        slowMotionExpiresAt = Date.now() + 4000;
        transientMessage = '🐢 Tiempo bala';
        transientMessageExpiresAt = Date.now() + 1500;
        triggerVibration?.([50, 30, 50]);
        createTone?.(140, 0.4, 'sine', 0.2);
        updateIndicator();
    }

    function updateStatuses() {
        const now = Date.now();

        if (shieldActive && now > shieldExpiresAt) {
            shieldActive = false;
            transientMessage = '🛡️ Escudo agotado';
            transientMessageExpiresAt = now + 1200;
        }

        if (slowMotionActive && now > slowMotionExpiresAt) {
            slowMotionActive = false;
            transientMessage = '🐢 Tiempo normal';
            transientMessageExpiresAt = now + 1200;
        }

        if (transientMessage && now >= transientMessageExpiresAt) {
            transientMessage = '';
        }

        updateIndicator();
    }

    function updateIndicator() {
        if (!indicatorElement) return;

        const now = Date.now();

        if (shieldActive) {
            const remaining = Math.max(0, Math.ceil((shieldExpiresAt - now) / 1000));
            const prefix = (transientMessage && now < transientMessageExpiresAt) ? `${transientMessage} · ` : '';
            indicatorElement.textContent = `${prefix}🛡️ Escudo (${remaining}s)`;
            indicatorElement.classList.add('active');
            return;
        }

        if (slowMotionActive) {
            const remaining = Math.max(0, Math.ceil((slowMotionExpiresAt - now) / 1000));
            const prefix = (transientMessage && now < transientMessageExpiresAt) ? `${transientMessage} · ` : '';
            indicatorElement.textContent = `${prefix}🐢 Tiempo bala (${remaining}s)`;
            indicatorElement.classList.add('active');
            return;
        }

        if (transientMessage && now < transientMessageExpiresAt) {
            indicatorElement.textContent = transientMessage;
            indicatorElement.classList.add('active');
            return;
        }

        indicatorElement.textContent = 'Sin power-ups';
        indicatorElement.classList.remove('active');
    }

    function spawnPickupEffect(powerUp) {
        const { x, y, width, height, type } = powerUp;
        const color = type === 'shield' ? '129,212,250' : type === 'water' ? '129,199,132' : '255,235,59';

        for (let i = 0; i < 6; i++) {
            const offsetX = x + Math.random() * width;
            const offsetY = y + Math.random() * height;
            createParticle(offsetX, offsetY, color);
        }
    }

    return {
        reset,
        maybeSpawn,
        update,
        draw,
        drawSlowMotionOverlay,
        absorbFire,
        isShieldActive: () => shieldActive,
        isSlowMotionActive: () => slowMotionActive,
        getSlowMotionGameFactor: () => (slowMotionActive ? SLOWMO_GAME_FACTOR : 1),
        getSlowMotionFireFactor: () => (slowMotionActive ? SLOWMO_FIRE_FACTOR : 1)
    };
}
