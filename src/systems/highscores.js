const STORAGE_KEY = 'autobomba-highscores-v1';

const defaultHighScores = {
    bestScore: 0,
    bestTime: 0,
    bestDistance: 0,
    bestCombo: 0,
    bestSpeed: 0,
    runsPlayed: 0
};

export function createHighscoreManager() {
    let highScores = { ...defaultHighScores };

    function load() {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored) {
                const parsed = JSON.parse(stored);
                highScores = {
                    ...highScores,
                    ...parsed
                };
            }
        } catch (error) {
            console.warn('No se pudieron cargar los records locales:', error);
        }

        updateDisplays();
    }

    function save() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(highScores));
        } catch (error) {
            console.warn('No se pudieron guardar los records locales:', error);
        }
    }

    function evaluate(finalStats) {
        const { finalScore, finalTime, finalDistance, finalCombo, finalSpeed } = finalStats;
        const newRecords = [];

        if (finalScore > highScores.bestScore) {
            highScores.bestScore = finalScore;
            newRecords.push('score');
        }

        if (finalTime > highScores.bestTime) {
            highScores.bestTime = finalTime;
            newRecords.push('time');
        }

        if (finalDistance > highScores.bestDistance) {
            highScores.bestDistance = finalDistance;
            newRecords.push('distance');
        }

        if (finalCombo > highScores.bestCombo) {
            highScores.bestCombo = finalCombo;
            newRecords.push('combo');
        }

        if (finalSpeed > highScores.bestSpeed) {
            highScores.bestSpeed = finalSpeed;
            newRecords.push('speed');
        }

        highScores.runsPlayed = (highScores.runsPlayed || 0) + 1;

        save();
        updateDisplays();
        renderRecordFlags(newRecords);
        highlightRecordStats(newRecords);

        return newRecords;
    }

    function updateDisplays() {
        const bestScoreEl = document.getElementById('best-score');
        const bestTimeEl = document.getElementById('best-time');
        const bestDistanceEl = document.getElementById('best-distance');
        const bestComboEl = document.getElementById('best-combo');
        const bestSpeedEl = document.getElementById('best-speed');
        const runsPlayedEl = document.getElementById('runs-played');

        const bestScoreSummary = document.getElementById('best-score-summary');
        const bestTimeSummary = document.getElementById('best-time-summary');
        const bestDistanceSummary = document.getElementById('best-distance-summary');
        const bestComboSummary = document.getElementById('best-combo-summary');

        if (bestScoreEl) bestScoreEl.textContent = formatNumber(highScores.bestScore);
        if (bestTimeEl) bestTimeEl.textContent = formatTimeValue(highScores.bestTime);
        if (bestDistanceEl) bestDistanceEl.textContent = formatDistanceValue(highScores.bestDistance);
        if (bestComboEl) bestComboEl.textContent = formatComboValue(highScores.bestCombo);
        if (bestSpeedEl) bestSpeedEl.textContent = formatSpeedValue(highScores.bestSpeed);
        if (runsPlayedEl) runsPlayedEl.textContent = formatNumber(highScores.runsPlayed || 0);

        if (bestScoreSummary) bestScoreSummary.textContent = formatNumber(highScores.bestScore);
        if (bestTimeSummary) bestTimeSummary.textContent = formatTimeValue(highScores.bestTime);
        if (bestDistanceSummary) bestDistanceSummary.textContent = formatDistanceValue(highScores.bestDistance);
        if (bestComboSummary) bestComboSummary.textContent = formatComboValue(highScores.bestCombo);
    }

    function renderRecordFlags(records) {
        const container = document.getElementById('record-flags');
        if (!container) return;

        container.innerHTML = '';

        if (!records.length) {
            container.style.display = 'none';
            return;
        }

        container.style.display = 'flex';

        const messages = {
            score: 'Nuevo récord de puntos',
            time: 'Sobreviviste más tiempo',
            distance: 'Mayor distancia recorrida',
            combo: 'Combo más espectacular',
            speed: 'Velocidad máxima superada'
        };

        records.forEach((recordKey) => {
            const badge = document.createElement('span');
            badge.className = 'record-badge';
            badge.innerHTML = `🏅 ${messages[recordKey]}`;
            container.appendChild(badge);
        });
    }

    function highlightRecordStats(records) {
        const statMap = {
            score: 'final-score',
            time: 'final-time',
            distance: 'final-distance',
            combo: 'max-combo',
            speed: 'max-speed'
        };

        const statElements = document.querySelectorAll('.final-stats .stat');
        statElements.forEach(stat => stat.classList.remove('record-stat'));

        records.forEach((recordKey) => {
            const elementId = statMap[recordKey];
            const valueElement = document.getElementById(elementId);
            if (valueElement && valueElement.parentElement) {
                valueElement.parentElement.classList.add('record-stat');
            }
        });
    }

    return {
        load,
        evaluate,
        updateDisplays,
        getHighScores: () => ({ ...highScores })
    };
}

export function formatNumber(value) {
    return value ? value.toLocaleString('es-AR') : '0';
}

export function formatTimeValue(seconds) {
    if (!seconds) return '0s';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins === 0) {
        return `${secs}s`;
    }
    const paddedSecs = secs.toString().padStart(2, '0');
    return `${mins}:${paddedSecs}`;
}

export function formatDistanceValue(distance) {
    if (!distance) return '0 km';
    return `${distance.toFixed(2)} km`;
}

export function formatComboValue(combo) {
    if (!combo) return 'x0';
    return `x${combo}`;
}

export function formatSpeedValue(speed) {
    if (!speed) return '0 km/h';
    return `${Math.floor(speed)} km/h`;
}
