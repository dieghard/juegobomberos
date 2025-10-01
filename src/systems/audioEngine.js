const getAudioContextClass = () => {
    if (typeof window === 'undefined') {
        return null;
    }
    return window.AudioContext || window.webkitAudioContext || null;
};

export function createAudioEngine({ settingsService } = {}) {
    const AudioContextClass = getAudioContextClass();
    let audioContext = null;
    let masterGain = null;
    let enabled = settingsService ? settingsService.isEnabled('audioEnabled') : true;
    let lastEngineTick = 0;

    const ensureMasterGain = (ctx) => {
        if (!ctx) return null;
        if (!masterGain) {
            masterGain = ctx.createGain();
            masterGain.gain.value = 0.8;
            masterGain.connect(ctx.destination);
        }
        return masterGain;
    };

    const ensureContext = async () => {
        if (!enabled || !AudioContextClass) {
            return null;
        }

        if (!audioContext) {
            audioContext = new AudioContextClass();
            ensureMasterGain(audioContext);
        }

        if (audioContext.state === 'suspended') {
            try {
                await audioContext.resume();
            } catch (error) {
                console.warn('[audioEngine] No se pudo reanudar el contexto de audio', error);
                return null;
            }
        }

        ensureMasterGain(audioContext);
        return audioContext;
    };

    const playTone = async ({ frequency = 440, duration = 0.2, type = 'sine', volume = 0.1 } = {}) => {
        if (!enabled) return;
        const ctx = await ensureContext();
        if (!ctx || !masterGain) return;

        try {
            const oscillator = ctx.createOscillator();
            const gain = ctx.createGain();

            oscillator.type = type;
            oscillator.frequency.value = frequency;

            gain.gain.value = volume;
            oscillator.connect(gain);
            gain.connect(masterGain);

            const now = ctx.currentTime;
            gain.gain.setValueAtTime(0, now);
            gain.gain.linearRampToValueAtTime(volume, now + 0.01);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

            oscillator.start(now);
            oscillator.stop(now + duration + 0.05);
        } catch (error) {
            console.warn('[audioEngine] No se pudo reproducir tono', error);
        }
    };

    const playEngineRumble = async (speed) => {
        if (!enabled) return;
        const now = Date.now();
        if (now - lastEngineTick < 100) {
            return;
        }
        lastEngineTick = now;

        const baseFreq = 80;
        const frequency = baseFreq + speed * 10;
        const volume = Math.min(0.15, 0.05 + speed * 0.01);

        playTone({ frequency, duration: 0.1, type: 'sawtooth', volume });
    };

    const playExplosion = async () => {
        if (!enabled) return;
        const ctx = await ensureContext();
        if (!ctx) return;

        playTone({ frequency: 60, duration: 0.1, type: 'sawtooth', volume: 0.3 });
        setTimeout(() => playTone({ frequency: 40, duration: 0.2, type: 'triangle', volume: 0.2 }), 50);
        setTimeout(() => playTone({ frequency: 30, duration: 0.3, type: 'sine', volume: 0.1 }), 100);
    };

    const playFireCrackle = async () => {
        if (!enabled) return;
        const ctx = await ensureContext();
        if (!ctx) return;

        try {
            const bufferSize = ctx.sampleRate * 0.3;
            const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
            const data = buffer.getChannelData(0);

            for (let i = 0; i < bufferSize; i++) {
                data[i] = (Math.random() * 2 - 1) * 0.1 * Math.sin(i * 0.01);
            }

            const source = ctx.createBufferSource();
            const gain = ctx.createGain();

            source.buffer = buffer;
            source.connect(gain);
            gain.connect(masterGain);

            const now = ctx.currentTime;
            gain.gain.setValueAtTime(0.05, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);

            source.start(now);
        } catch (error) {
            console.warn('[audioEngine] No se pudo reproducir el crepitar del fuego', error);
        }
    };

    const setEnabled = (value) => {
        const nextValue = Boolean(value);
        if (enabled === nextValue) {
            return;
        }
        enabled = nextValue;

        if (!enabled && audioContext && audioContext.state === 'running') {
            audioContext.suspend?.();
        } else if (enabled) {
            ensureContext();
        }
    };

    if (settingsService) {
        settingsService.onChange((next) => {
            if (Object.prototype.hasOwnProperty.call(next, 'audioEnabled')) {
                setEnabled(next.audioEnabled);
            }
        });
    }

    return {
        init: () => {
            if (!audioContext && enabled) {
                ensureContext();
            }
        },
        ensureContext,
        playTone,
        playEngineRumble,
        playFireCrackle,
        playExplosion,
        setEnabled,
        isEnabled: () => enabled,
        getContext: () => audioContext
    };
}
