import { createGameEngine } from './src/core/gameEngine.js';

const engine = createGameEngine();

const bootstrap = () => {
    engine.bootstrap();
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap, { once: true });
} else {
    bootstrap();
}

if (typeof window !== 'undefined') {
    window.autobombaGame = engine;
}