const EXTREME_SPEED_ON_THRESHOLD = 3.7;
const EXTREME_SPEED_OFF_THRESHOLD = 3.2;

export function createExtremeSpeedAlert({ bannerElement, triggerVibration, createTone }) {
    let active = false;

    function update(gameSpeed) {
        if (!bannerElement) return;

        if (!active && gameSpeed >= EXTREME_SPEED_ON_THRESHOLD) {
            active = true;
            bannerElement.classList.add('active');
            bannerElement.setAttribute('aria-hidden', 'false');
            triggerVibration?.([60, 40, 60]);
            createTone?.(780, 0.14, 'sawtooth', 0.15);
        } else if (active && gameSpeed <= EXTREME_SPEED_OFF_THRESHOLD) {
            active = false;
            bannerElement.classList.remove('active');
            bannerElement.setAttribute('aria-hidden', 'true');
        }
    }

    function reset() {
        if (!bannerElement) return;
        active = false;
        bannerElement.classList.remove('active');
        bannerElement.setAttribute('aria-hidden', 'true');
    }

    return {
        update,
        reset,
        isActive: () => active
    };
}
