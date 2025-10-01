export function createParticlePool({ maxSize = 256, factory } = {}) {
    const create = () => (typeof factory === 'function' ? factory() : {});
    const inactive = [];
    const active = [];

    for (let i = 0; i < maxSize; i++) {
        inactive.push(create());
    }

    const acquire = (initializer) => {
        const particle = inactive.length ? inactive.pop() : create();
        if (typeof initializer === 'function') {
            initializer(particle);
        }
        active.push(particle);
        return particle;
    };

    const releaseIndex = (index) => {
        const particle = active[index];
        if (!particle) {
            return;
        }
        inactive.push(particle);
        active.splice(index, 1);
    };

    return {
        spawn: (count, initializer) => {
            const total = Math.max(1, count | 0);
            for (let i = 0; i < total; i++) {
                acquire(initializer);
            }
        },
        update: (step) => {
            for (let i = active.length - 1; i >= 0; i--) {
                const particle = active[i];
                const keepAlive = step ? step(particle, i) : true;
                if (!keepAlive) {
                    releaseIndex(i);
                }
            }
        },
        clear: () => {
            while (active.length) {
                releaseIndex(active.length - 1);
            }
        },
        get active() {
            return active;
        }
    };
}
