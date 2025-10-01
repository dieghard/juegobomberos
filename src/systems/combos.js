const COMBO_TIMEOUT = 2500; // ms para mantener combo activo

export function createComboSystem({
    indicatorElement,
    scorePanelElement,
    firetruck,
    createParticle,
    triggerVibration
}) {
    let comboCount = 0;
    let maxCombo = 0;
    let lastComboTime = 0;

    function registerDodge() {
        comboCount += 1;
        lastComboTime = Date.now();

        if (comboCount > maxCombo) {
            maxCombo = comboCount;
        }

        if (comboCount >= 2) {
            triggerComboEffects(comboCount);
        } else {
            updateIndicator();
        }
    }

    function reset() {
        comboCount = 0;
        updateIndicator();
    }

    function update() {
        if (comboCount === 0) return;
        if (Date.now() - lastComboTime > COMBO_TIMEOUT) {
            reset();
        }
    }

    function updateIndicator() {
        if (!indicatorElement) return;

        if (comboCount >= 2) {
            indicatorElement.textContent = `Combo x${comboCount}`;
            indicatorElement.classList.add('active');
        } else {
            indicatorElement.textContent = 'Combo x0';
            indicatorElement.classList.remove('active');
        }
    }

    function triggerComboEffects(comboLevel) {
        updateIndicator();
        spawnComboParticles(comboLevel);

        if (comboLevel % 5 === 0) {
            triggerVibration?.([120, 60, 120]);
        }

        if (scorePanelElement) {
            scorePanelElement.classList.add('combo-flash');
            setTimeout(() => scorePanelElement.classList.remove('combo-flash'), 300);
        }
    }

    function spawnComboParticles(comboLevel) {
        const bursts = Math.min(10, 3 + comboLevel);
        const centerX = firetruck.x + firetruck.width / 2;
        const centerY = firetruck.y + firetruck.height / 2;

        for (let i = 0; i < bursts; i++) {
            createParticle(centerX - firetruck.width / 2, centerY - firetruck.height / 2, '255,235,59');
        }
    }

    return {
        registerDodge,
        reset,
        update,
        getComboCount: () => comboCount,
        getMaxCombo: () => maxCombo,
        getPeakCombo: () => Math.max(comboCount, maxCombo)
    };
}
