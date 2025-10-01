const defaultSelectors = {
    canvas: '#gameCanvas',
    comboIndicator: '#combo-indicator',
    scorePanel: '.score',
    powerupIndicator: '#powerup-indicator',
    extremeBanner: '#extreme-banner',
    permissionButton: '#permission-btn',
    permissionStatus: '#permission-status',
    locationText: '#location-text',
    locationButton: '#location-btn',
    locationStatus: '#location-status',
    countdown: '#countdown',
    startButton: '#start-game-btn',
    controlInstructions: '#control-instructions',
    presentationScreen: '#presentation-screen',
    gameScreen: '#game-screen',
    gameoverScreen: '#gameover-screen',
    mapScreen: '#map-screen',
    installSection: '#install-section',
    installButton: '#install-btn',
    recordFlags: '#record-flags',
    highscorePanel: '#highscore-panel',
    scoreValue: '#score',
    timeValue: '#time',
    speedValue: '#speed',
    distanceValue: '#distance',
    currentLocation: '#current-location',
    finalScore: '#final-score',
    finalTime: '#final-time',
    firesDodged: '#fires-dodged',
    maxCombo: '#max-combo',
    finalDistance: '#final-distance',
    maxSpeed: '#max-speed',
    startLocation: '#start-location',
    endLocation: '#end-location',
    mapDistance: '#map-distance',
    mapTime: '#map-time',
    mapScore: '#map-score',
    viewMapButton: '#view-map-btn',
    closeMapButton: '#close-map-btn',
    shareRouteButton: '#share-route-btn',
    routeMap: '#route-map'
};

function resolveSelector(selector) {
    if (typeof selector === 'function') {
        return selector();
    }

    if (typeof selector !== 'string') {
        return null;
    }

    if (selector.startsWith('#')) {
        return document.getElementById(selector.slice(1));
    }

    return document.querySelector(selector);
}

export function createDomCache(customSelectors = {}) {
    const selectors = { ...defaultSelectors, ...customSelectors };
    const cache = {};

    const hydrateKey = (key) => {
        const selector = selectors[key];
        const element = resolveSelector(selector);
        if (!element) {
            console.warn(`[domCache] No se encontró el selector "${selector}" para la clave "${key}"`);
        }
        cache[key] = element;
        return element;
    };

    Object.keys(selectors).forEach((key) => hydrateKey(key));

    return {
        get: (key) => (key in cache ? cache[key] : hydrateKey(key)),
        has: (key) => Boolean(cache[key]),
        refresh: (key) => hydrateKey(key),
        all: () => ({ ...cache })
    };
}
