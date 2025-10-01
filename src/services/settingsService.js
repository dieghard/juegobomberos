const STORAGE_KEY = 'autobomba.settings.v1';

export const DEFAULT_SETTINGS = {
    audioEnabled: true,
    vibrationEnabled: true,
    gyroSensitivity: 1,
    keyboardSpeed: 1,
    graphicsQuality: 'high',
    preferredLanguage: 'es',
    slowMotionAssist: true
};

const safeWindow = typeof window !== 'undefined' ? window : undefined;

function readFromStorage(storage) {
    if (!storage) {
        return {};
    }

    try {
        const raw = storage.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw) : {};
    } catch (error) {
        console.warn('[settingsService] No se pudieron leer los ajustes almacenados:', error);
        return {};
    }
}

function writeToStorage(storage, settings) {
    if (!storage) {
        return;
    }

    try {
        storage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch (error) {
        console.warn('[settingsService] No se pudieron guardar los ajustes:', error);
    }
}

export function createSettingsService(options = {}) {
    const storage = options.storage ?? safeWindow?.localStorage ?? null;
    let settings = { ...DEFAULT_SETTINGS, ...readFromStorage(storage) };
    const listeners = new Set();

    const notify = () => {
        const snapshot = { ...settings };
        listeners.forEach((listener) => {
            try {
                listener(snapshot);
            } catch (error) {
                console.error('[settingsService] Error en listener de ajustes', error);
            }
        });
    };

    const persist = () => writeToStorage(storage, settings);

    return {
        get: (key) => settings[key],
        getAll: () => ({ ...settings }),
        isEnabled: (key) => Boolean(settings[key]),
        update: (partial = {}) => {
            settings = { ...settings, ...partial };
            persist();
            notify();
        },
        reset: () => {
            settings = { ...DEFAULT_SETTINGS };
            persist();
            notify();
        },
        onChange: (callback) => {
            if (typeof callback !== 'function') return () => {};
            listeners.add(callback);
            return () => listeners.delete(callback);
        }
    };
}
