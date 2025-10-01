import {
    createHighscoreManager,
    formatNumber,
    formatTimeValue,
    formatDistanceValue,
    formatComboValue,
    formatSpeedValue
} from '../systems/highscores.js';
import { createComboSystem } from '../systems/combos.js';
import { createPowerUpSystem } from '../systems/powerups.js';
import { createExtremeSpeedAlert } from '../systems/alerts.js';
import { createDomCache } from './domCache.js';
import { createSettingsService } from '../services/settingsService.js';
import { createParticlePool } from '../systems/particlePool.js';
import { createAudioEngine } from '../systems/audioEngine.js';

// Variables globales del juego
let canvas, ctx;
let domCache;
let settingsService;
let gameState = 'presentation'; // presentation, countdown, playing, gameover, map
let gameStartTime;
let score = 0;
let timeElapsed = 0;
let firesDodged = 0;
let gameSpeed = 1;
let animationId;
let fires = [];
const particlePool = createParticlePool({
    maxSize: 512,
    factory: () => ({
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        life: 0,
        maxLife: 0,
        color: '255,255,255'
    })
});

const explosionPool = createParticlePool({
    maxSize: 256,
    factory: () => ({
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        life: 0,
        maxLife: 0,
        size: 1,
        maxLife: 1,
        color: '255,255,255'
    })
});
let trees = [];
let backgroundObjects = [];
let groundFires = [];

const firetruck = {
    width: 60,
    height: 90,
    x: 0,
    y: 0,
    speed: 6,
    lastSpeed: 0
};

let audioEngine;
let audioEnabled = false;

let vibrationEnabled = true;
let gyroSensitivity = 1;
let keyboardSpeedScalar = 1;
let slowMotionAssistPreference = true;

let useKeyboardControls = false;
let isLargeScreen = false;
const keyboardControls = { left: false, right: false, up: false, down: false };

const deviceOrientation = { beta: 0, gamma: 0 };
let lastAcceleration = { x: 0, y: 0, z: 0 };
let lastShakeTime = 0;
const shakeThreshold = 18;
const GROUND_FIRE_DURATION = 2800;
const GROUND_FIRE_FLASH_DURATION = 650;

let totalDistance = 0;
let currentSpeed = 0;
let maxSpeed = 0;
let lastSpeedUpdate = Date.now();

let firetruckOnFire = false;
let gameOverExplosion = false;

let watchPositionId = null;
const currentLocation = { lat: null, lng: null, accuracy: null, lastLocationUpdate: null };
let locationName = 'Selva del Pacífico';
let startLocation = { lat: null, lng: null, name: 'Sin GPS al inicio' };
let endLocation = { lat: null, lng: null, name: 'Sin GPS al final' };

let deferredPrompt = null;
let isInstalled = false;

let comboSystem;
let powerUpSystem;
let highscoreManager;
let extremeSpeedAlert;
let groundFireFlashUntil = 0;
let groundFireFlashIntensity = 0;
let groundFireFlashDuration = GROUND_FIRE_FLASH_DURATION;

const getDom = (key) => (domCache ? domCache.get(key) : null);

const setTextContent = (key, value) => {
    const element = getDom(key);
    if (element) {
        element.textContent = value;
    }
};

const applySettings = (nextSettings) => {
    if (!nextSettings) {
        return;
    }

    audioEnabled = Boolean(nextSettings.audioEnabled);
    audioEngine?.setEnabled(audioEnabled);
    vibrationEnabled = Boolean(nextSettings.vibrationEnabled);
    gyroSensitivity = Number(nextSettings.gyroSensitivity) || 1;
    keyboardSpeedScalar = Number(nextSettings.keyboardSpeed) || 1;
    slowMotionAssistPreference = Boolean(
        nextSettings.slowMotionAssist ?? slowMotionAssistPreference
    );
};

function initializeSystems() {
    highscoreManager = createHighscoreManager();
    highscoreManager.load();

    comboSystem = createComboSystem({
        indicatorElement: domCache.get('comboIndicator'),
        scorePanelElement: domCache.get('scorePanel'),
        firetruck,
        createParticle,
        triggerVibration
    });
    comboSystem.reset();

    powerUpSystem = createPowerUpSystem({
        indicatorElement: domCache.get('powerupIndicator'),
        fires,
        groundFires,
        firetruck,
        triggerVibration,
        createTone,
        createParticle,
        onScoreBonus: (bonus) => {
            score += bonus;
        },
        onWaterBlast: ({ totalCleared, groundCleared }) => {
            const cleanupIntensity = Math.min(1, totalCleared / 8);
            const durationBoost = 1 + Math.min(totalCleared, 12) * 0.08;
            groundFireFlashIntensity = cleanupIntensity;
            groundFireFlashDuration = GROUND_FIRE_FLASH_DURATION * durationBoost;
            groundFireFlashUntil = Date.now() + groundFireFlashDuration;

            if (groundCleared > 0) {
                createParticle(firetruck.x + firetruck.width / 2, canvas.height - 40, '0,188,212');
            }
        }
    });
    powerUpSystem.reset();

    extremeSpeedAlert = createExtremeSpeedAlert({
        bannerElement: domCache.get('extremeBanner'),
        triggerVibration,
        createTone
    });
    extremeSpeedAlert.reset();
}

function bootstrapGame() {
    settingsService = createSettingsService();
    audioEngine = createAudioEngine({ settingsService });
    applySettings(settingsService.getAll());
    settingsService.onChange(applySettings);

    domCache = createDomCache();
    initializeSystems();
    setupPermissionButton();
    checkPermissionsOnLoad();
    requestLocationPermission();
    detectScreenSize();
    setupKeyboardControls();
    window.addEventListener('resize', detectScreenSize);
    setupMapControls();
    initPWA();

    const startButton = domCache.get('startButton');
    if (startButton) {
        startButton.addEventListener('click', () => {
            requestLocationOnInteraction();
            handleShake();
        });
    }

    document.addEventListener('keydown', (event) => {
        if (gameState === 'presentation' && ['Enter', ' ', 'Spacebar', 'Space'].includes(event.key)) {
            event.preventDefault();
            requestLocationOnInteraction();
            handleShake();
        }
    });

    initGame();
}

function setupPermissionButton() {
    const permissionBtn = domCache.get('permissionButton');
    const permissionStatus = domCache.get('permissionStatus');
    if (!permissionBtn || !permissionStatus) {
        console.warn('[setupPermissionButton] Elementos de permisos no encontrados en el DOM');
        return;
    }
    
    // Detectar iOS y PWA
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || 
                  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    
    const isPWA = window.matchMedia('(display-mode: standalone)').matches || 
                  window.navigator.standalone === true ||
                  document.referrer.includes('android-app://');
    
    const needsPermissionButton = 
        (typeof DeviceOrientationEvent !== 'undefined' && 
         typeof DeviceOrientationEvent.requestPermission === 'function');
    
    console.log('Device detection:', { isIOS, isPWA, needsPermissionButton, protocol: location.protocol });
    
    // Lógica específica para iPhone/iPad
    if (isIOS) {
        if (location.protocol !== 'https:') {
            permissionStatus.textContent = '🍎 iOS requiere HTTPS para sensores';
            permissionStatus.className = 'permission-status error';
        } else if (needsPermissionButton) {
            permissionBtn.classList.add('show');
            if (isPWA) {
                permissionStatus.textContent = '⚠️ PWA detectada: Toca "Permitir Sensores"';
            } else {
                permissionStatus.textContent = '⚠️ Toca "Permitir Sensores" para habilitar el giroscopio';
            }
            permissionStatus.className = 'permission-status warning';
        } else {
            // iOS más antiguo o ya con permisos
            permissionStatus.textContent = '✅ iOS listo - ¡Agita para jugar!';
            permissionStatus.className = 'permission-status success';
        }
    } else {
        // Dispositivos Android y otros
        permissionStatus.textContent = '✅ Dispositivo listo - ¡Agita para jugar!';
        permissionStatus.className = 'permission-status success';
    }
    
    permissionBtn.addEventListener('click', async () => {
        permissionStatus.textContent = '🔄 Solicitando permisos...';
        permissionStatus.className = 'permission-status';
        
        const success = await requestPermissions();
        
        if (success) {
            permissionStatus.textContent = '✅ ¡Permisos otorgados! Ya puedes agitar para jugar';
            permissionStatus.className = 'permission-status success';
            permissionBtn.style.display = 'none';
        } else {
            permissionStatus.textContent = '❌ No se pudieron obtener permisos. Verifica HTTPS y recarga.';
            permissionStatus.className = 'permission-status error';
        }
    });
}

function checkPermissionsOnLoad() {
    const permissionStatus = domCache.get('permissionStatus');
    if (!permissionStatus) {
        return;
    }
    
    // Verificar protocolo
    if (location.protocol !== 'https:' && location.hostname !== 'localhost') {
        permissionStatus.textContent = '⚠️ iOS requiere HTTPS. Usa: https://TU_IP:8443';
        permissionStatus.className = 'permission-status error';
        return;
    }
    
    // Verificar si es iOS y mostrar información específica
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || 
                  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    
    if (isIOS && location.protocol !== 'https:') {
        permissionStatus.textContent = '🍎 iOS detectado: requiere HTTPS para sensores';
        permissionStatus.className = 'permission-status warning';
    }
}

async function requestLocationPermission() {
    const locationStatus = domCache.get('locationText');
    const locationBtn = domCache.get('locationButton');
    if (!locationStatus || !locationBtn) {
        console.warn('[requestLocationPermission] Elementos de ubicación no encontrados');
        return;
    }
    
    // Configurar botón de ubicación
    locationBtn.addEventListener('click', () => {
        locationBtn.style.display = 'none';
        getLocation();
    });
    
    // Verificar si la API de permisos está disponible
    if ('permissions' in navigator) {
        try {
            const permission = await navigator.permissions.query({name: 'geolocation'});
            console.log('Estado del permiso de geolocalización:', permission.state);
            
            if (permission.state === 'granted') {
                getLocation();
            } else if (permission.state === 'prompt') {
                locationStatus.textContent = '📍 Ubicación disponible';
                locationBtn.style.display = 'inline-block';
            } else {
                locationStatus.textContent = 'Permisos de ubicación denegados';
                locationName = "Bosque sin ubicación";
                updateLocationDisplay();
            }
        } catch (error) {
            console.log('API de permisos no disponible, solicitando directamente');
            setTimeout(() => getLocation(), 2000);
        }
    } else {
        // Fallback para navegadores sin API de permisos
        setTimeout(() => getLocation(), 2000);
    }
}

function requestLocationOnInteraction() {
    console.log('Usuario interactuó, solicitando ubicación...');
    getLocation();
}

function initGame() {
    canvas = domCache.get('canvas');
    if (!canvas) {
        throw new Error('[initGame] No se encontró el canvas principal');
    }
    ctx = canvas.getContext('2d');
    
    // Configurar canvas
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    
    // Configurar autobomba inicial
    firetruck.x = canvas.width / 2 - firetruck.width / 2;
    firetruck.y = canvas.height - 100;
    
    // Configurar eventos de orientación
    setupDeviceOrientation();
    
    // Configurar detección de agitación
    setupShakeDetection();
    
    // Inicializar sistema de audio
    initAudio();
    
    // Inicializar elementos del fondo
    initBackground();
    
    // Iniciar loop del juego
    gameLoop();
}

// Sistema de Audio mejorado
function initAudio() {
    audioEngine?.setEnabled(audioEnabled);
    audioEngine?.init();
}

// Función para reactivar audio en interacción del usuario
function ensureAudioContext() {
    audioEngine?.ensureContext();
}

// Detectar pantallas grandes y configurar controles
function detectScreenSize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const isMobile = /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    
    // Considerar pantalla grande si es mayor a 768px Y no es móvil
    isLargeScreen = (width > 768 && height > 500) && !isMobile;
    
    if (isLargeScreen) {
        console.log('Pantalla grande detectada - Habilitando controles de teclado');
        useKeyboardControls = true;
        showKeyboardInstructions();
    } else {
        console.log('Pantalla móvil detectada - Usando giroscopio');
        useKeyboardControls = false;
        hideKeyboardInstructions();
    }
}

// Mostrar instrucciones de teclado
function showKeyboardInstructions() {
    const instructionsDiv = document.querySelector('.movement-instructions') || 
                           document.querySelector('.permission-status');
    if (instructionsDiv) {
        instructionsDiv.innerHTML = `
            <p>🖥️ <strong>Pantalla grande detectada</strong></p>
            <p>Usa las teclas <strong>A/D</strong> o <strong>←/→</strong> para mover el autobomba</p>
            <p><small>También puedes usar WASD o las flechas del teclado</small></p>
        `;
    }
    
    // Actualizar instrucciones del botón de inicio
    const controlInstructions = getDom('controlInstructions');
    if (controlInstructions) {
        controlInstructions.textContent = 'Presiona ENTER, ESPACIO o cualquier flecha para comenzar';
    }
}

// Ocultar instrucciones de teclado
function hideKeyboardInstructions() {
    // Restaurar instrucciones originales de giroscopio si es necesario
}

// Configurar event listeners para teclado
function setupKeyboardControls() {
    document.addEventListener('keydown', (event) => {
        if (gameState !== 'playing' || !useKeyboardControls) return;
        
        switch(event.key.toLowerCase()) {
            case 'a':
            case 'arrowleft':
                keyboardControls.left = true;
                break;
            case 'd':
            case 'arrowright':
                keyboardControls.right = true;
                break;
            case 'w':
            case 'arrowup':
                keyboardControls.up = true;
                break;
            case 's':
            case 'arrowdown':
                keyboardControls.down = true;
                break;
        }
        event.preventDefault();
    });
    
    document.addEventListener('keyup', (event) => {
        if (!useKeyboardControls) return;
        
        switch(event.key.toLowerCase()) {
            case 'a':
            case 'arrowleft':
                keyboardControls.left = false;
                break;
            case 'd':
            case 'arrowright':
                keyboardControls.right = false;
                break;
            case 'w':
            case 'arrowup':
                keyboardControls.up = false;
                break;
            case 's':
            case 'arrowdown':
                keyboardControls.down = false;
                break;
        }
        event.preventDefault();
    });
}

function createTone(frequency, duration, type = 'sine', volume = 0.1) {
    if (!audioEnabled) return;
    audioEngine?.playTone({ frequency, duration, type, volume });
}

function playEngineSound(speed) {
    if (!audioEnabled) return;
    audioEngine?.playEngineRumble(speed);
}

function playFireSound() {
    if (!audioEnabled) return;
    audioEngine?.playFireCrackle();
}

function playExplosionSound() {
    if (!audioEnabled) return;
    audioEngine?.playExplosion();
}

function triggerVibration(pattern = [200]) {
    if (!vibrationEnabled) {
        return;
    }

    if ('vibrate' in navigator) {
        navigator.vibrate(pattern);
    }
}

// Sistema PWA
function initPWA() {
    const installSection = getDom('installSection');
    const installBtn = getDom('installButton');
    if (!installSection || !installBtn) {
        console.warn('[initPWA] Elementos de instalación no disponibles');
        return;
    }
    
    // Verificar si ya está instalada
    checkIfInstalled();
    
    // Escuchar el evento beforeinstallprompt
    window.addEventListener('beforeinstallprompt', (e) => {
        console.log('PWA installation prompt triggered');
        e.preventDefault();
        deferredPrompt = e;
        showInstallButton();
    });
    
    // Configurar botón de instalación
    installBtn.addEventListener('click', handleInstallClick);
    
    // Escuchar cuando la app se instala
    window.addEventListener('appinstalled', (evt) => {
        console.log('PWA was installed');
        handleAppInstalled();
    });
    
    // Verificar si el prompt está disponible después de un tiempo
    setTimeout(() => {
        if (!deferredPrompt && !isInstalled) {
            // Si no hay prompt disponible, mostrar instrucciones manuales
            showManualInstallInstructions();
        }
    }, 3000);
}

function checkIfInstalled() {
    // Verificar si se ejecuta como PWA
    const isPWA = window.matchMedia('(display-mode: standalone)').matches || 
                  window.navigator.standalone === true ||
                  document.referrer.includes('android-app://');
    
    if (isPWA) {
        isInstalled = true;
        handleAppInstalled();
        return;
    }
    
    // Verificar si ya fue instalada (localStorage)
    if (localStorage.getItem('pwa-installed') === 'true') {
        isInstalled = true;
        handleAppInstalled();
    }
}

function showInstallButton() {
    const installSection = getDom('installSection');
    const installBtn = getDom('installButton');
    if (!installSection || !installBtn) {
        return;
    }
    
    installSection.classList.remove('hidden');
    installBtn.textContent = '⬇️ Instalar Autobomba';
    
    console.log('Botón de instalación mostrado');
}

function showManualInstallInstructions() {
    const installSection = getDom('installSection');
    const installBtn = getDom('installButton');
    if (!installSection || !installBtn) {
        return;
    }

    const installCard = installSection.querySelector('.install-card');
    if (!installCard) {
        return;
    }
    
    // Detectar navegador/dispositivo
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const isAndroid = /Android/.test(navigator.userAgent);
    
    if (isIOS) {
        installBtn.innerHTML = `
            <span class="install-btn-icon">📱</span>
            <span class="install-btn-text">Agregar a Inicio</span>
        `;
        installCard.querySelector('p').textContent = 
            'Toca el botón de compartir en Safari y selecciona "Agregar a pantalla de inicio"';
        
        installBtn.addEventListener('click', () => {
            alert('Para instalar en iOS:\n\n1. Toca el botón de compartir (📤) en Safari\n2. Desplázate y toca "Agregar a pantalla de inicio"\n3. Confirma la instalación');
        });
    } else if (isAndroid) {
        installBtn.innerHTML = `
            <span class="install-btn-icon">🤖</span>
            <span class="install-btn-text">Instalar App</span>
        `;
        installCard.querySelector('p').textContent = 
            'Busca "Agregar a pantalla de inicio" en el menú del navegador';
        
        installBtn.addEventListener('click', () => {
            alert('Para instalar en Android:\n\n1. Toca el menú (⋮) del navegador\n2. Selecciona "Agregar a pantalla de inicio"\n3. Confirma la instalación');
        });
    } else {
        installBtn.innerHTML = `
            <span class="install-btn-icon">💻</span>
            <span class="install-btn-text">Instalar App</span>
        `;
        installCard.querySelector('p').textContent = 
            'Busca el ícono de instalación en la barra de direcciones del navegador';
        
        installBtn.addEventListener('click', () => {
            alert('Para instalar en Desktop:\n\n1. Busca el ícono de instalación (📥) en la barra de direcciones\n2. O ve al menú del navegador\n3. Selecciona "Instalar Autobomba"');
        });
    }
    
    installSection.classList.remove('hidden');
}

async function handleInstallClick() {
    if (!deferredPrompt) {
        console.log('No hay prompt de instalación disponible');
        return;
    }
    
    const installBtn = getDom('installButton');
    if (!installBtn) {
        return;
    }
    
    // Cambiar estado del botón
    installBtn.innerHTML = `
        <span class="install-btn-icon">⏳</span>
        <span class="install-btn-text">Instalando...</span>
    `;
    installBtn.disabled = true;
    
    try {
        // Mostrar el prompt de instalación
        deferredPrompt.prompt();
        
        // Esperar la respuesta del usuario
        const { outcome } = await deferredPrompt.userChoice;
        console.log(`User response to install prompt: ${outcome}`);
        
        if (outcome === 'accepted') {
            console.log('Usuario aceptó la instalación');
            // handleAppInstalled se llamará automáticamente cuando se instale
        } else {
            console.log('Usuario rechazó la instalación');
            // Restaurar botón
            installBtn.innerHTML = `
                <span class="install-btn-icon">⬇️</span>
                <span class="install-btn-text">Instalar Autobomba</span>
            `;
            installBtn.disabled = false;
        }
        
        // Limpiar el prompt
        deferredPrompt = null;
        
    } catch (error) {
        console.error('Error durante la instalación:', error);
        // Restaurar botón en caso de error
        installBtn.innerHTML = `
            <span class="install-btn-icon">❌</span>
            <span class="install-btn-text">Error al Instalar</span>
        `;
        
        setTimeout(() => {
            installBtn.innerHTML = `
                <span class="install-btn-icon">⬇️</span>
                <span class="install-btn-text">Instalar Autobomba</span>
            `;
            installBtn.disabled = false;
        }, 3000);
    }
}

function handleAppInstalled() {
    const installSection = getDom('installSection');
    const installBtn = getDom('installButton');
    if (!installSection || !installBtn) {
        return;
    }
    const installCard = installSection.querySelector('.install-card');
    if (!installCard) {
        return;
    }
    
    isInstalled = true;
    localStorage.setItem('pwa-installed', 'true');
    
    // Actualizar UI para mostrar que está instalada
    installSection.classList.add('installed');
    installCard.querySelector('h3').textContent = '¡App Instalada!';
    installCard.querySelector('p').textContent = 'La app está lista para usar desde tu pantalla de inicio';
    
    installBtn.innerHTML = `
        <span class="install-btn-icon">✅</span>
        <span class="install-btn-text">¡Instalada Correctamente!</span>
    `;
    installBtn.disabled = true;
    
    // Ocultar después de 5 segundos
    setTimeout(() => {
        installSection.style.transition = 'opacity 1s ease, transform 1s ease';
        installSection.style.opacity = '0';
        installSection.style.transform = 'translateY(-20px)';
        
        setTimeout(() => {
            installSection.classList.add('hidden');
        }, 1000);
    }, 5000);
    
    console.log('PWA installation completed successfully');
}

// Sistema de Fondo Animado
function initBackground() {
    trees = [];
    backgroundObjects = [];
    
    // Generar árboles iniciales
    for (let i = 0; i < 15; i++) {
        trees.push(createTree());
    }
    
    // Generar objetos de fondo (rocas, arbustos)
    for (let i = 0; i < 10; i++) {
        backgroundObjects.push(createBackgroundObject());
    }
}

function createTree() {
    return {
        x: canvas.width + 50 + Math.random() * 200, // Aparecen a la derecha
        y: Math.random() * canvas.height,
        size: 20 + Math.random() * 40,
        type: Math.floor(Math.random() * 3), // 3 tipos de árboles
        swayOffset: Math.random() * Math.PI * 2,
        speed: 1 + Math.random() * 2
    };
}

function createBackgroundObject() {
    return {
        x: canvas.width + 50 + Math.random() * 100, // Aparecen a la derecha
        y: Math.random() * canvas.height,
        size: 10 + Math.random() * 20,
        type: Math.floor(Math.random() * 2), // rocas y arbustos
        speed: 0.5 + Math.random() * 1.5
    };
}

function updateBackground() {
    if (gameState !== 'playing') return;
    
    // Mover árboles de derecha a izquierda para simular movimiento horizontal
    for (let i = trees.length - 1; i >= 0; i--) {
        const tree = trees[i];
        tree.x -= tree.speed * gameSpeed; // Movimiento horizontal (derecha a izquierda)
        
        // Si sale de la pantalla por la izquierda, reposicionar a la derecha
        if (tree.x + tree.size < -50) {
            tree.x = canvas.width + 50 + Math.random() * 200;
            tree.y = Math.random() * canvas.height;
        }
    }
    
    // Mover objetos de fondo horizontalmente también
    for (let i = backgroundObjects.length - 1; i >= 0; i--) {
        const obj = backgroundObjects[i];
        obj.x -= obj.speed * gameSpeed; // Movimiento horizontal
        
        if (obj.x + obj.size < -50) {
            obj.x = canvas.width + 50 + Math.random() * 100;
            obj.y = Math.random() * canvas.height;
        }
    }
}

function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    
    // Reposicionar autobomba si es necesario
    if (firetruck.x > canvas.width - firetruck.width) {
        firetruck.x = canvas.width - firetruck.width;
    }
}

async function requestPermissions() {
    console.log('Solicitando permisos del dispositivo...');
    
    // Verificar si estamos en iOS y si es PWA
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || 
                  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    
    const isPWA = window.matchMedia('(display-mode: standalone)').matches || 
                  window.navigator.standalone === true;
    
    // Solicitar permisos de orientación del dispositivo (iOS 13+)
    if (typeof DeviceOrientationEvent !== 'undefined' && 
        typeof DeviceOrientationEvent.requestPermission === 'function') {
        
        console.log('Solicitando permiso de orientación...');
        try {
            const permission = await DeviceOrientationEvent.requestPermission();
            console.log('Respuesta permiso orientación:', permission);
            
            if (permission !== 'granted') {
                if (isPWA) {
                    alert('⚠️ PWA necesita permisos del giroscopio:\n\n' +
                          '1. Ve a Configuración > Safari > Privacidad\n' +
                          '2. Activa "Sensores de movimiento y orientación"\n' +
                          '3. Recarga la PWA');
                } else {
                    alert('⚠️ Para jugar necesitas permitir el acceso al giroscopio.\n\n' +
                          '1. Recarga la página\n' +
                          '2. Cuando aparezca el aviso, toca "Permitir"\n' +
                          '3. Si no aparece, verifica que uses HTTPS');
                }
                return false;
            }
        } catch (error) {
            console.error('Error solicitando permisos de orientación:', error);
            if (isIOS && isPWA) {
                alert('⚠️ Error en PWA de iOS:\n\n' +
                      '1. Ve a Configuración > Safari > Privacidad\n' +
                      '2. Activa "Sensores de movimiento y orientación"\n' +
                      '3. Reinstala la PWA desde Safari');
            } else if (isIOS) {
                alert('⚠️ Error de permisos en iOS:\n\n' +
                      '1. Asegúrate de usar HTTPS\n' +
                      '2. Recarga y acepta permisos\n' +
                      '3. Verifica configuración de Safari');
            }
            return false;
        }
    }
    
    // Solicitar permisos de movimiento del dispositivo (iOS 13+)
    if (typeof DeviceMotionEvent !== 'undefined' && 
        typeof DeviceMotionEvent.requestPermission === 'function') {
        
        console.log('Solicitando permiso de movimiento...');
        try {
            const permission = await DeviceMotionEvent.requestPermission();
            console.log('Respuesta permiso movimiento:', permission);
            
            if (permission !== 'granted') {
                alert('⚠️ Se necesita permiso para detectar cuando agitas el celular.\n\n' +
                      'Como alternativa, podrás tocar la pantalla para iniciar.');
                // Habilitar control alternativo por toque
                enableTouchControls();
                return true; // No es crítico para el juego
            }
        } catch (error) {
            console.error('Error solicitando permisos de movimiento:', error);
            enableTouchControls();
            return true; // No es crítico
        }
    }
    
    // Mostrar mensaje de éxito si llegamos aquí
    console.log('✅ Permisos otorgados correctamente');
    return true;
}

function enableTouchControls() {
    console.log('Habilitando controles táctiles como alternativa');
    
    // Agregar evento de toque como alternativa a la agitación
    const addTouchAlternative = () => {
        const gameScreen = getDom('gameScreen');
        const presentationScreen = getDom('presentationScreen');
        const gameoverScreen = getDom('gameoverScreen');
        if (!gameScreen || !presentationScreen || !gameoverScreen) {
            return;
        }
        
        // Para iniciar el juego
        presentationScreen.addEventListener('touchstart', (e) => {
            if (gameState === 'presentation') {
                e.preventDefault();
                console.log('Toque detectado en pantalla de presentación');
                handleShake();
            }
        });
        
        // También agregar evento de clic para pantallas de escritorio
        presentationScreen.addEventListener('click', (e) => {
            if (gameState === 'presentation') {
                e.preventDefault();
                console.log('Clic detectado en pantalla de presentación');
                handleShake();
            }
        });
        
        // Para reiniciar después de game over
        gameoverScreen.addEventListener('touchstart', (e) => {
            if (gameState === 'gameover') {
                e.preventDefault();
                handleShake();
            }
        });
        
        // Mostrar mensaje de control alternativo
    const hintElement = document.querySelector('.start-instruction p');
        if (hintElement) {
            hintElement.innerHTML = '<strong>¡AGITA TU CELULAR O TOCA LA PANTALLA PARA COMENZAR!</strong>';
        }
    };
    
    addTouchAlternative();
}

function setupDeviceOrientation() {
    if (window.DeviceOrientationEvent) {
        window.addEventListener('deviceorientation', (event) => {
            deviceOrientation.beta = event.beta || 0;   // rotación frontal-trasera
            deviceOrientation.gamma = event.gamma || 0; // rotación izquierda-derecha
        });
    } else {
        console.warn('DeviceOrientationEvent no soportado');
    }
}

function setupShakeDetection() {
    if (window.DeviceMotionEvent) {
        window.addEventListener('devicemotion', (event) => {
            const acceleration = event.accelerationIncludingGravity;
            if (acceleration) {
                const currentTime = Date.now();
                
                if (currentTime - lastShakeTime > 100) {
                    const deltaX = Math.abs(acceleration.x - lastAcceleration.x);
                    const deltaY = Math.abs(acceleration.y - lastAcceleration.y);
                    const deltaZ = Math.abs(acceleration.z - lastAcceleration.z);
                    
                    const shakeIntensity = deltaX + deltaY + deltaZ;
                    
                    if (shakeIntensity > shakeThreshold) {
                        handleShake();
                        lastShakeTime = currentTime;
                    }
                    
                    lastAcceleration = {
                        x: acceleration.x,
                        y: acceleration.y,
                        z: acceleration.z
                    };
                }
            }
        });
    } else {
        console.warn('DeviceMotionEvent no soportado');
        // Agregar evento de clic como fallback
        document.addEventListener('click', handleShake);
    }
}

function handleShake() {
    console.log('handleShake llamado, gameState actual:', gameState);
    
    if (gameState === 'presentation') {
        console.log('Iniciando countdown desde pantalla de presentación');
        startCountdown();
    } else if (gameState === 'gameover') {
        console.log('Reseteando juego desde pantalla de game over');
        resetGame();
    } else {
        console.log('handleShake llamado en estado no válido:', gameState);
    }
}

function startCountdown() {
    gameState = 'countdown';
    let countdown = 3;
    const countdownElement = getDom('countdown');
    if (!countdownElement) {
        return;
    }
    
    const countdownInterval = setInterval(() => {
        countdownElement.textContent = countdown;
        countdown--;
        
        if (countdown < 0) {
            clearInterval(countdownInterval);
            startGame();
        }
    }, 1000);
}

function startGame() {
    // Asegurar que el audio funcione
    ensureAudioContext();
    
    gameState = 'playing';
    gameStartTime = Date.now();
    score = 0;
    timeElapsed = 0;
    firesDodged = 0;
    gameSpeed = 1;
    fires.length = 0;
    particlePool.clear();
    explosionPool.clear();
    groundFires.length = 0;
    groundFireFlashUntil = 0;
    groundFireFlashIntensity = 0;
    groundFireFlashDuration = GROUND_FIRE_FLASH_DURATION;
    comboSystem?.reset();
    powerUpSystem?.reset();
    extremeSpeedAlert?.reset();
    
    // Resetear métricas de distancia
    totalDistance = 0;
    currentSpeed = 0;
    maxSpeed = 0;
    lastSpeedUpdate = Date.now();
    firetruck.lastSpeed = 0;
    
    // Resetear efectos visuales
    firetruckOnFire = false;
    gameOverExplosion = false;
    explosionPool.clear();
    
    // Guardar ubicación de inicio con nombre actual
    if (currentLocation.lat && currentLocation.lng) {
        startLocation = {
            lat: currentLocation.lat,
            lng: currentLocation.lng,
            name: locationName || "Punto de inicio"
        };
        console.log('Ubicación de inicio guardada:', startLocation);
    } else {
        startLocation = {
            lat: null,
            lng: null,
            name: "Sin GPS al inicio"
        };
    }
    
    // Inicializar ubicación final
    endLocation = {
        lat: null,
        lng: null,
        name: "Calculando..."
    };
    
    // Iniciar seguimiento de ubicación
    startLocationTracking();
    
    // Cambiar a pantalla de juego
    const presentationScreen = getDom('presentationScreen');
    const gameScreen = getDom('gameScreen');
    presentationScreen?.classList.remove('active');
    gameScreen?.classList.add('active');
    
    // Reposicionar autobomba
    firetruck.x = canvas.width / 2 - firetruck.width / 2;
    firetruck.y = canvas.height - 100;
}

function startLocationTracking() {
    if ('geolocation' in navigator) {
        watchPositionId = navigator.geolocation.watchPosition(
            async (position) => {
                const newLat = position.coords.latitude;
                const newLng = position.coords.longitude;
                
                console.log('Nueva posición obtenida:', { newLat, newLng });
                
                // Calcular distancia si tenemos posición anterior
                if (currentLocation.lat && currentLocation.lng) {
                    const distance = calculateDistance(
                        currentLocation.lat, currentLocation.lng,
                        newLat, newLng
                    );
                    totalDistance += distance;
                }
                
                currentLocation.lat = newLat;
                currentLocation.lng = newLng;
                currentLocation.accuracy = position.coords.accuracy;
                
                // Actualizar nombre de ubicación cada cierto tiempo o distancia
                const now = Date.now();
                if (!currentLocation.lastLocationUpdate || 
                    now - currentLocation.lastLocationUpdate > 30000) { // cada 30 segundos
                    
                    await getLocationName(newLat, newLng);
                    currentLocation.lastLocationUpdate = now;
                }
                
                updateLocationDisplay();
            },
            (error) => {
                console.error('Error en seguimiento de ubicación:', error);
            },
            {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 5000
            }
        );
    }
}

function stopLocationTracking() {
    if (watchPositionId) {
        navigator.geolocation.clearWatch(watchPositionId);
        watchPositionId = null;
    }
}

function calculateDistance(lat1, lng1, lat2, lng2) {
    const R = 6371; // Radio de la Tierra en km
    const dLat = toRadians(lat2 - lat1);
    const dLng = toRadians(lng2 - lng1);
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) *
              Math.sin(dLng/2) * Math.sin(dLng/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c; // Distancia en km
}

function toRadians(degrees) {
    return degrees * (Math.PI / 180);
}

function getLocation() {
    const locationStatus = getDom('locationText');
    const locationContainer = getDom('locationStatus');
    if (!locationStatus || !locationContainer) {
        return;
    }
    
    if (!('geolocation' in navigator)) {
        locationStatus.textContent = 'Geolocalización no soportada';
        locationName = "Bosque virtual";
        updateLocationDisplay();
        // Ocultar después de 3 segundos
        setTimeout(() => {
            locationContainer.style.opacity = '0.5';
        }, 3000);
        return;
    }
    
    locationStatus.textContent = 'Obteniendo ubicación...';
    
    navigator.geolocation.getCurrentPosition(
        (position) => {
            currentLocation.lat = position.coords.latitude;
            currentLocation.lng = position.coords.longitude;
            currentLocation.accuracy = position.coords.accuracy;
            
            console.log('Ubicación obtenida:', currentLocation);
            
            // Obtener nombre de ubicación
            getLocationName(currentLocation.lat, currentLocation.lng);
            
            locationStatus.textContent = `✅ ${locationName}`;
            updateLocationDisplay();
            
            // Ocultar el mensaje después de 4 segundos
            setTimeout(() => {
                locationContainer.style.transition = 'opacity 1s ease';
                locationContainer.style.opacity = '0';
                setTimeout(() => {
                    locationContainer.style.display = 'none';
                }, 1000);
            }, 4000);
        },
        (error) => {
            console.error('Error obteniendo ubicación:', error);
            
            let errorMessage = 'Error obteniendo ubicación';
            switch(error.code) {
                case error.PERMISSION_DENIED:
                    errorMessage = 'Permisos de ubicación denegados';
                    break;
                case error.POSITION_UNAVAILABLE:
                    errorMessage = 'Ubicación no disponible';
                    break;
                case error.TIMEOUT:
                    errorMessage = 'Timeout obteniendo ubicación';
                    break;
            }
            
            locationStatus.textContent = errorMessage;
            locationName = "Bosque desconocido";
            updateLocationDisplay();
        },
        {
            enableHighAccuracy: true,
            timeout: 15000,
            maximumAge: 300000 // 5 minutos
        }
    );
}

async function getLocationName(lat, lng) {
    try {
        console.log(`Obteniendo nombre para: ${lat}, ${lng}`);
        
        // Usar una API alternativa sin CORS o fallback a nombres descriptivos
        // Como OpenStreetMap tiene CORS, usaremos un sistema de nombres inteligente
        const locationNameResult = generateLocationName(lat, lng);
        
        console.log('Nombre de ubicación establecido:', locationNameResult);
        locationName = locationNameResult;
        updateLocationDisplay();
        
    } catch (error) {
        console.error('Error obteniendo nombre de ubicación:', error);
        // Fallback con coordenadas
        locationName = `Ubicación (${lat.toFixed(3)}, ${lng.toFixed(3)})`;
        updateLocationDisplay();
    }
}

function generateLocationName(lat, lng) {
    // Sistema inteligente de nombres basado en coordenadas geográficas reales
    
    // Detectar país/región aproximada
    let region = "Zona desconocida";
    let zone = "";
    
    // Argentina (donde parece estar basado en las coordenadas del error)
    if (lat >= -55 && lat <= -21.5 && lng >= -73.5 && lng <= -53.5) {
        region = "Argentina";
        
        if (lat >= -35 && lat <= -27 && lng >= -65 && lng <= -57) {
            zone = "Provincia de Córdoba";
        } else if (lat >= -35 && lat <= -26 && lng >= -70 && lng <= -62) {
            zone = "Región Centro";
        } else if (lat >= -42 && lat <= -35) {
            zone = "Patagonia Norte";
        } else if (lat >= -27 && lat <= -21.5) {
            zone = "Norte Argentino";
        } else {
            zone = "Región Central";
        }
    }
    // Chile
    else if (lat >= -56 && lat <= -17.5 && lng >= -75.5 && lng <= -66.5) {
        region = "Chile";
        if (lat >= -33.5 && lat <= -17.5) zone = "Norte de Chile";
        else if (lat >= -42 && lat <= -33.5) zone = "Chile Central";
        else zone = "Sur de Chile";
    }
    // Brasil
    else if (lat >= -33.5 && lat <= 5.5 && lng >= -74 && lng <= -34.5) {
        region = "Brasil";
        zone = "Territorio Brasileño";
    }
    // México
    else if (lat >= 14.5 && lat <= 32.5 && lng >= -118 && lng <= -86.5) {
        region = "México";
        zone = "Territorio Mexicano";
    }
    // Estados Unidos
    else if (lat >= 24.5 && lat <= 49.5 && lng >= -125 && lng <= -66.5) {
        region = "Estados Unidos";
        zone = "Territorio Estadounidense";
    }
    // Europa
    else if (lat >= 35 && lat <= 71 && lng >= -10 && lng <= 40) {
        region = "Europa";
        zone = "Territorio Europeo";
    }
    
    // Generar nombre final
    if (zone) {
        locationName = `${zone}, ${region}`;
    } else {
        locationName = region;
    }
    
    // Añadir contexto de bosque para el juego
    const forestTypes = ["Bosque", "Selva", "Monte", "Reserva Natural", "Parque"];
    const selectedType = forestTypes[Math.floor((Math.abs(lat) + Math.abs(lng)) * 100) % forestTypes.length];
    
    return `${selectedType} de ${locationName}`;
}

function updateLocationDisplay() {
    const locationElement = getDom('currentLocation');
    if (locationElement) {
        // Mostrar nombre más descriptivo
        const displayText = locationName.length > 30 ? 
            locationName.substring(0, 27) + '...' : 
            locationName;
        locationElement.textContent = `📍 ${displayText}`;
    }
    
    console.log('Display de ubicación actualizado:', locationName);
}

function updateFiretruckPosition() {
    if (gameState !== 'playing') return;
    
    let moveSpeed = 0;
    const sensitivity = Math.max(0.4, Math.min(2.5, gyroSensitivity));
    
    // Usar controles de teclado si es pantalla grande
    if (useKeyboardControls && isLargeScreen) {
    const keySpeed = firetruck.speed * 0.8 * Math.max(0.4, Math.min(2.5, keyboardSpeedScalar));
        
        if (keyboardControls.left) {
            moveSpeed = -keySpeed;
        }
        if (keyboardControls.right) {
            moveSpeed = keySpeed;
        }
        
        // Movimiento vertical opcional para pantallas grandes
        if (keyboardControls.up && firetruck.y > 50) {
            firetruck.y -= keySpeed * 0.3;
        }
        if (keyboardControls.down && firetruck.y < canvas.height - firetruck.height - 50) {
            firetruck.y += keySpeed * 0.3;
        }
        
    } else {
        // Usar giroscopio como antes
        const maxTilt = 30; // grados máximos de inclinación
        
        // Normalizar el valor gamma (-30 a 30 grados)
        let normalizedGamma = Math.max(-maxTilt, Math.min(maxTilt, deviceOrientation.gamma));
        
        // Convertir a velocidad de movimiento
        moveSpeed = (normalizedGamma / maxTilt) * firetruck.speed * sensitivity;
    }
    
    // Actualizar posición horizontal
    firetruck.x += moveSpeed;
    
    // Mantener dentro de los límites
    if (firetruck.x < 0) firetruck.x = 0;
    if (firetruck.x > canvas.width - firetruck.width) {
        firetruck.x = canvas.width - firetruck.width;
    }
    
    // Calcular velocidad simulada
    currentSpeed = Math.abs(moveSpeed) * 10;
    if (currentSpeed > maxSpeed) {
        maxSpeed = currentSpeed;
    }
    
    // Reproducir sonido del motor según la velocidad
    if (currentSpeed > 5) {
        playEngineSound(currentSpeed);
    }
    
    // Detectar cambios de velocidad para efectos de sonido
    const speedDiff = Math.abs(currentSpeed - firetruck.lastSpeed);
    if (speedDiff > 15) {
        // Sonido de aceleración/frenado brusco
        if (currentSpeed > firetruck.lastSpeed) {
            // Acelerando
            createTone(200, 0.2, 'square', 0.1);
        } else {
            // Frenando
            createTone(150, 0.3, 'triangle', 0.08);
        }
    }
    
    firetruck.lastSpeed = currentSpeed;
    
    // Simular distancia recorrida basada en movimiento
    const now = Date.now();
    const timeDelta = (now - lastSpeedUpdate) / 1000; // segundos
    if (timeDelta > 0) {
        const distanceDelta = (currentSpeed / 3600) * timeDelta; // km
        totalDistance += distanceDelta;
        lastSpeedUpdate = now;
    }
    
    // Actualizar UI
    setTextContent('speedValue', Math.floor(currentSpeed));
    setTextContent('distanceValue', totalDistance.toFixed(2));
}

function spawnFire() {
    if (gameState !== 'playing') return;
    
    const fireSize = 30 + Math.random() * 20;
    const fire = {
        x: Math.random() * (canvas.width - fireSize),
        y: -fireSize,
        width: fireSize,
        height: fireSize,
        speed: 1.5 + gameSpeed * 0.7 + Math.random() * 2, // Velocidad más baja inicialmente
        intensity: 0.5 + Math.random() * 0.5,
        type: Math.random() > 0.8 ? 'large' : 'normal'
    };
    
    fires.push(fire);
    
    // Reproducir sonido de fuego ocasionalmente
    if (Math.random() < 0.3) {
        playFireSound();
    }
}

function spawnGroundFire(fire) {
    const centerX = fire.x + fire.width / 2;
    if (groundFires.length > 20) {
        groundFires.shift();
    }
    groundFires.push({
        x: centerX,
        width: fire.width * (fire.type === 'large' ? 1.8 : 1.4),
        y: canvas.height - 25,
        createdAt: Date.now(),
        duration: GROUND_FIRE_DURATION,
        flickerSeed: Math.random() * Math.PI * 2
    });

    createParticle(centerX - 5, canvas.height - 45, '255,140,0');
    createParticle(centerX + 5, canvas.height - 40, '255,94,0');
}


function updateFires() {
    if (gameState !== 'playing') return;
    
    for (let i = fires.length - 1; i >= 0; i--) {
        const fire = fires[i];
        const speedMultiplier = powerUpSystem ? powerUpSystem.getSlowMotionFireFactor() : 1;
        fire.y += fire.speed * speedMultiplier;
        
        // Remover fuegos que salieron de pantalla
        if (fire.y > canvas.height) {
            spawnGroundFire(fire);
            fires.splice(i, 1);
            firesDodged++;
            score += 10;
            comboSystem?.registerDodge();
            continue;
        }
        
        // Verificar colisión con autobomba
        if (checkCollision(firetruck, fire)) {
            if (powerUpSystem && powerUpSystem.absorbFire(fire, fires, i)) {
                continue;
            }
            gameOver();
            return;
        }
    }
}

function updateGroundFires() {
    if (!groundFires.length) return;

    const now = Date.now();
    for (let i = groundFires.length - 1; i >= 0; i--) {
        const groundFire = groundFires[i];
        if (now - groundFire.createdAt >= groundFire.duration) {
            groundFires.splice(i, 1);
        }
    }
}

function checkCollision(rect1, rect2) {
    return rect1.x < rect2.x + rect2.width &&
           rect1.x + rect1.width > rect2.x &&
           rect1.y < rect2.y + rect2.height &&
           rect1.y + rect1.height > rect2.y;
}

function createParticle(x, y, color) {
    particlePool.spawn(5, (particle) => {
        particle.x = x + Math.random() * 20;
        particle.y = y + Math.random() * 20;
        particle.vx = (Math.random() - 0.5) * 4;
        particle.vy = (Math.random() - 0.5) * 4;
        particle.life = 30 + Math.random() * 20;
        particle.maxLife = 50;
        particle.color = color;
    });
}



function createExplosionParticles(x, y) {
    // Crear muchas partículas para la explosión
    explosionPool.spawn(30, (particle) => {
        particle.x = x;
        particle.y = y;
        particle.vx = (Math.random() - 0.5) * 15;
        particle.vy = (Math.random() - 0.5) * 15;
        particle.life = 60 + Math.random() * 40;
        particle.maxLife = 100;
        particle.size = 2 + Math.random() * 8;
        particle.color = `hsl(${Math.random() < 0.7 ? '30, 100%' : '0, 100%'}, ${70 + Math.random() * 30}%)`;
    });
}

function updateExplosionParticles() {
    explosionPool.update((particle) => {
        particle.x += particle.vx;
        particle.y += particle.vy;
        particle.vx *= 0.98; // Fricción
        particle.vy += 0.2; // Gravedad
        particle.life--;
        return particle.life > 0;
    });
}

function updateParticles() {
    particlePool.update((particle) => {
        particle.x += particle.vx;
        particle.y += particle.vy;
        particle.life--;
        return particle.life > 0;
    });
}

function updateGameState() {
    if (gameState !== 'playing') return;
    
    timeElapsed = Math.floor((Date.now() - gameStartTime) / 1000);
    
    // Aumentar dificultad con el tiempo (progresión más gradual)
    const baseSpeed = 0.8 + timeElapsed * 0.03;
    const slowFactor = powerUpSystem ? powerUpSystem.getSlowMotionGameFactor() : 1;
    const assistFactor = slowMotionAssistPreference ? slowFactor : 1;
    gameSpeed = baseSpeed * assistFactor;
    
    // Spawning de fuegos más frecuente con el tiempo (menos agresivo inicialmente)
    const baseSpawnRate = Math.max(0.015, 0.05 - timeElapsed * 0.0008); // Comenzar con menos fuegos
    const spawnRate = (powerUpSystem && powerUpSystem.isSlowMotionActive()) ? baseSpawnRate * 0.6 : baseSpawnRate;
    if (Math.random() < spawnRate) {
        spawnFire();
    }
    
    // Chance de generar power-ups ocasionalmente
    powerUpSystem?.maybeSpawn(canvas.width);
    
    // Actualizar UI
    setTextContent('scoreValue', score);
    setTextContent('timeValue', timeElapsed);

    comboSystem?.update();
    extremeSpeedAlert?.update(gameSpeed);
}

function drawFiretruck() {
    ctx.save();

    if (powerUpSystem && powerUpSystem.isShieldActive()) {
        const pulse = 0.7 + Math.sin(Date.now() * 0.01) * 0.15;
        const centerX = firetruck.x + firetruck.width / 2;
        const centerY = firetruck.y + firetruck.height / 2;
        const radius = Math.max(firetruck.width, firetruck.height) * 0.85;
        const gradient = ctx.createRadialGradient(centerX, centerY, radius * 0.2, centerX, centerY, radius);
        gradient.addColorStop(0, `rgba(129,212,250,${0.35 * pulse})`);
        gradient.addColorStop(1, 'rgba(1,87,155,0)');
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
        ctx.fill();
    }
    
    // Sombra
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(firetruck.x + 5, firetruck.y + 5, firetruck.width, firetruck.height);
    
    // Si está en llamas, dibujar efecto de fuego
    if (firetruckOnFire) {
        const time = Date.now() * 0.01;
        for (let i = 0; i < 8; i++) {
            const offsetX = Math.sin(time + i) * 10;
            const offsetY = Math.sin(time * 1.5 + i) * 5;
            const size = 15 + Math.sin(time + i * 0.7) * 8;
            
            const gradient = ctx.createRadialGradient(
                firetruck.x + firetruck.width/2 + offsetX, 
                firetruck.y + offsetY, 0,
                firetruck.x + firetruck.width/2 + offsetX, 
                firetruck.y + offsetY, size
            );
            gradient.addColorStop(0, '#ffff00');
            gradient.addColorStop(0.5, '#ff8800');
            gradient.addColorStop(1, '#ff0000');
            
            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.arc(
                firetruck.x + firetruck.width/2 + offsetX, 
                firetruck.y + offsetY, 
                size, 0, Math.PI * 2
            );
            ctx.fill();
        }
    }
    
    // Cuerpo principal
    ctx.fillStyle = firetruckOnFire ? '#8B0000' : '#e53935';
    ctx.fillRect(firetruck.x, firetruck.y, firetruck.width, firetruck.height);
    
    // Detalles
    ctx.fillStyle = firetruckOnFire ? '#FFB6C1' : '#ffffff';
    ctx.fillRect(firetruck.x + 5, firetruck.y + 5, firetruck.width - 10, 8);
    
    // Ruedas
    ctx.fillStyle = '#333333';
    ctx.beginPath();
    ctx.arc(firetruck.x + 12, firetruck.y + firetruck.height, 6, 0, Math.PI * 2);
    ctx.arc(firetruck.x + firetruck.width - 12, firetruck.y + firetruck.height, 6, 0, Math.PI * 2);
    ctx.fill();
    
    // Luces de emergencia
    if (!firetruckOnFire) {
        const lightOffset = Math.sin(Date.now() * 0.01) > 0 ? '#ff0000' : '#0000ff';
        ctx.fillStyle = lightOffset;
        ctx.fillRect(firetruck.x + firetruck.width/2 - 3, firetruck.y - 3, 6, 3);
    }
    
    ctx.restore();
}

function drawFire(fire) {
    ctx.save();
    
    const centerX = fire.x + fire.width / 2;
    const centerY = fire.y + fire.height / 2;
    
    // Crear efecto de fuego animado
    const time = Date.now() * 0.01;
    const flickerOffset = Math.sin(time + fire.x) * 2;
    
    // Gradiente de fuego
    const gradient = ctx.createRadialGradient(
        centerX, centerY + flickerOffset, 0,
        centerX, centerY + flickerOffset, fire.width / 2
    );
    
    if (fire.type === 'large') {
        gradient.addColorStop(0, '#ffff00');
        gradient.addColorStop(0.3, '#ff8f00');
        gradient.addColorStop(0.6, '#ff3d00');
        gradient.addColorStop(1, '#d32f2f');
    } else {
        gradient.addColorStop(0, '#ffeb3b');
        gradient.addColorStop(0.4, '#ff9800');
        gradient.addColorStop(0.8, '#f44336');
        gradient.addColorStop(1, '#b71c1c');
    }
    
    ctx.fillStyle = gradient;
    
    // Dibujar forma de fuego
    ctx.beginPath();
    ctx.ellipse(centerX, centerY + flickerOffset, fire.width/3, fire.height/2, 0, 0, Math.PI * 2);
    ctx.fill();
    
    // Llamas superiores
    ctx.fillStyle = `rgba(255, 183, 77, ${fire.intensity})`;
    ctx.beginPath();
    ctx.ellipse(centerX, centerY - fire.height/4 + flickerOffset, fire.width/4, fire.height/3, 0, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.restore();
}

function drawParticles() {
    ctx.save();
    for (const particle of particlePool.active) {
        const alpha = particle.life / particle.maxLife;
        ctx.fillStyle = `rgba(${particle.color}, ${alpha})`;
        ctx.fillRect(particle.x, particle.y, 3, 3);
    }
    ctx.restore();
}

function drawGroundFires() {
    if (!groundFires.length) return;

    ctx.save();
    const now = Date.now();
    const flashRemaining = groundFireFlashUntil > now ? groundFireFlashUntil - now : 0;
    const flashStrength = flashRemaining > 0 ? Math.min(1, flashRemaining / groundFireFlashDuration) : 0;
    const intensityFactor = flashStrength > 0 ? Math.max(0.25, groundFireFlashIntensity) : 0;

    for (const groundFire of groundFires) {
        const baseY = groundFire.y ?? (canvas.height - 25);
        const elapsed = now - groundFire.createdAt;
        const progress = elapsed / groundFire.duration;
        const alpha = Math.max(0, 1 - progress);

        const flicker = Math.sin(now * 0.012 + groundFire.flickerSeed) * 0.12;
        const width = groundFire.width * (1 + flicker);
        const height = Math.max(18, groundFire.width * 0.55);
        const centerX = groundFire.x;

        ctx.globalAlpha = 0.35 * alpha;
        ctx.fillStyle = 'rgba(62, 39, 35, 0.85)';
        ctx.beginPath();
        ctx.ellipse(centerX, baseY + height * 0.25, width * 0.9, height * 0.35, 0, 0, Math.PI * 2);
        ctx.fill();

        const gradient = ctx.createRadialGradient(
            centerX,
            baseY - height * 0.2,
            4,
            centerX,
            baseY + height * 0.45,
            width
        );
        gradient.addColorStop(0, `rgba(255, 241, 118, ${0.6 * alpha})`);
        gradient.addColorStop(0.35, `rgba(255, 167, 38, ${0.5 * alpha})`);
        gradient.addColorStop(0.7, `rgba(244, 81, 30, ${0.35 * alpha})`);
        gradient.addColorStop(1, 'rgba(66, 30, 14, 0)');

        ctx.globalAlpha = 1;
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.ellipse(centerX, baseY, width, height, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.globalAlpha = 0.4 * alpha;
        ctx.strokeStyle = `rgba(255, 204, 128, ${0.9 * alpha})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(centerX, baseY, width * 0.8, height * 0.65, 0, 0, Math.PI * 2);
        ctx.stroke();

        if (flashStrength > 0) {
            const eased = flashStrength * flashStrength * (0.7 + intensityFactor * 0.6);
            const flashGradient = ctx.createRadialGradient(
                centerX,
                baseY - height * 0.1,
                2,
                centerX,
                baseY + height * 0.6,
                width * 1.15
            );
            flashGradient.addColorStop(0, `rgba(178, 235, 242, ${0.4 + 0.6 * eased})`);
            flashGradient.addColorStop(0.5, `rgba(0, 188, 212, ${0.25 + 0.5 * eased})`);
            flashGradient.addColorStop(1, 'rgba(0, 121, 107, 0)');

            ctx.globalAlpha = 1;
            ctx.fillStyle = flashGradient;
            ctx.beginPath();
            ctx.ellipse(centerX, baseY, width * 1.1, height * 1.15, 0, 0, Math.PI * 2);
            ctx.fill();

            ctx.globalAlpha = 0.25 + 0.45 * eased;
            ctx.strokeStyle = `rgba(224, 247, 250, ${0.6 + 0.35 * eased})`;
            ctx.lineWidth = 2 + eased * 2.5;
            ctx.beginPath();
            ctx.ellipse(centerX, baseY, width * 0.9, height * 0.85, 0, 0, Math.PI * 2);
            ctx.stroke();

            ctx.globalAlpha = 1;
        }
    }

    ctx.restore();
}

function drawExplosionParticles() {
    ctx.save();
    for (const particle of explosionPool.active) {
        const alpha = particle.life / particle.maxLife;
        ctx.globalAlpha = alpha;
        ctx.fillStyle = particle.color;
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.restore();
}

function drawTrees() {
    ctx.save();
    const time = Date.now() * 0.002;
    
    for (const tree of trees) {
        const swayX = Math.sin(time + tree.swayOffset) * 5;
        
        // Sombra del árbol
        ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
        ctx.beginPath();
        ctx.arc(tree.x + swayX + 5, tree.y + tree.size, tree.size * 0.6, 0, Math.PI * 2);
        ctx.fill();
        
        // Tronco
        ctx.fillStyle = '#8B4513';
        ctx.fillRect(tree.x + swayX - 3, tree.y, 6, tree.size);
        
        // Copa del árbol
        ctx.fillStyle = tree.type === 0 ? '#228B22' : tree.type === 1 ? '#32CD32' : '#006400';
        ctx.beginPath();
        
        if (tree.type === 2) {
            // Árbol de navidad
            ctx.moveTo(tree.x + swayX, tree.y - tree.size * 0.3);
            ctx.lineTo(tree.x + swayX - tree.size * 0.4, tree.y + tree.size * 0.3);
            ctx.lineTo(tree.x + swayX + tree.size * 0.4, tree.y + tree.size * 0.3);
            ctx.closePath();
        } else {
            // Árbol redondo
            ctx.arc(tree.x + swayX, tree.y, tree.size * 0.7, 0, Math.PI * 2);
        }
        ctx.fill();
    }
    ctx.restore();
}

function drawBackgroundObjects() {
    ctx.save();
    
    for (const obj of backgroundObjects) {
        if (obj.type === 0) {
            // Roca
            ctx.fillStyle = '#696969';
            ctx.beginPath();
            ctx.arc(obj.x, obj.y, obj.size * 0.6, 0, Math.PI * 2);
            ctx.fill();
            
            // Sombra de la roca
            ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
            ctx.beginPath();
            ctx.arc(obj.x + 3, obj.y + 3, obj.size * 0.6, 0, Math.PI * 2);
            ctx.fill();
        } else {
            // Arbusto
            ctx.fillStyle = '#556B2F';
            ctx.beginPath();
            ctx.arc(obj.x - obj.size * 0.2, obj.y, obj.size * 0.4, 0, Math.PI * 2);
            ctx.arc(obj.x + obj.size * 0.2, obj.y, obj.size * 0.4, 0, Math.PI * 2);
            ctx.arc(obj.x, obj.y - obj.size * 0.2, obj.size * 0.4, 0, Math.PI * 2);
            ctx.fill();
        }
    }
    
    ctx.restore();
}

function drawBackground() {
    // Fondo del bosque
    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    gradient.addColorStop(0, '#4a7c23');
    gradient.addColorStop(0.6, '#2d5016');
    gradient.addColorStop(1, '#1a2e0a');
    
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Dibujar objetos de fondo primero
    drawBackgroundObjects();
    
    // Dibujar árboles
    drawTrees();
    
    // Efectos de humo (partículas de fondo)
    ctx.fillStyle = 'rgba(100, 100, 100, 0.1)';
    const time = Date.now() * 0.001;
    for (let i = 0; i < 5; i++) {
        const x = (canvas.width * i / 5 + Math.sin(time + i) * 50) % canvas.width;
        const y = (time * 20 + i * 100) % canvas.height;
        ctx.beginPath();
        ctx.arc(x, y, 10 + Math.sin(time + i) * 5, 0, Math.PI * 2);
        ctx.fill();
    }
}

function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    if (gameState === 'playing' || gameOverExplosion) {
        drawBackground();

        powerUpSystem?.draw(ctx);

        // Dibujar fuegos
        fires.forEach(fire => drawFire(fire));

    drawGroundFires();
        
        // Dibujar autobomba
        drawFiretruck();
        
        // Dibujar partículas
        drawParticles();

        powerUpSystem?.drawSlowMotionOverlay(ctx, canvas);

        // Dibujar partículas de explosión si están activas
        if (gameOverExplosion) {
            drawExplosionParticles();
        }
    }
}

function gameLoop() {
    if (gameState === 'playing') {
        updateFiretruckPosition();
        updateFires();
        powerUpSystem?.update(canvas.height, checkCollision);
        updateParticles();
        updateGameState();
        updateBackground();
    }
    
    updateGroundFires();
    
    // Actualizar efectos de explosión incluso en game over
    if (gameOverExplosion) {
        updateExplosionParticles();
    }
    
    render();
    animationId = requestAnimationFrame(gameLoop);
}

function gameOver() {
    gameState = 'gameover';

    powerUpSystem?.reset();
    extremeSpeedAlert?.reset();
    
    // Efectos de game over
    playExplosionSound();
    triggerVibration([200, 100, 200, 100, 400]); // Patrón de vibración
    
    // Activar efectos visuales
    firetruckOnFire = true;
    gameOverExplosion = true;
    
    // Detener seguimiento de ubicación
    stopLocationTracking();
    
    // Guardar ubicación final con nombre actualizado
    if (currentLocation.lat && currentLocation.lng) {
        endLocation = {
            lat: currentLocation.lat,
            lng: currentLocation.lng,
            name: locationName || "Ubicación final"
        };
        console.log('Ubicación final guardada:', endLocation);
        
        // Si no tenemos nombre, intentar obtenerlo
        if (!locationName || locationName.includes('Selva del Pacífico')) {
            getLocationName(currentLocation.lat, currentLocation.lng)
                .then(() => {
                    endLocation.name = locationName;
                    console.log('Nombre de ubicación final actualizado:', endLocation.name);
                });
        }
    } else {
        endLocation = {
            lat: null,
            lng: null,
            name: "Sin GPS al final"
        };
    }
    
    // Crear efecto de explosión masiva
    createExplosionParticles(firetruck.x + firetruck.width/2, firetruck.y + firetruck.height/2);
    
    // Cambiar a pantalla de game over
    setTimeout(() => {
        const gameScreen = getDom('gameScreen');
        const gameoverScreen = getDom('gameoverScreen');
        gameScreen?.classList.remove('active');
        gameoverScreen?.classList.add('active');
        
        // Actualizar estadísticas finales
        const finalComboValue = comboSystem ? comboSystem.getPeakCombo() : 0;
        const finalDistanceValue = parseFloat(totalDistance.toFixed(2));
        const finalSpeedValue = Math.floor(maxSpeed);

        setTextContent('finalScore', formatNumber(score));
        setTextContent('finalTime', formatTimeValue(timeElapsed));
        setTextContent('firesDodged', formatNumber(firesDodged));
        setTextContent('maxCombo', formatComboValue(finalComboValue));
        setTextContent('finalDistance', formatDistanceValue(finalDistanceValue));
        setTextContent('maxSpeed', formatSpeedValue(finalSpeedValue));
        
        // Actualizar información de ubicación
        setTextContent('startLocation', startLocation.name);
        setTextContent('endLocation', endLocation.name);
        
        console.log('Game over - Ubicaciones:', { start: startLocation.name, end: endLocation.name });

        highscoreManager.evaluate({
            finalScore: score,
            finalTime: timeElapsed,
            finalDistance: finalDistanceValue,
            finalCombo: finalComboValue,
            finalSpeed: finalSpeedValue
        });
        
        // Resetear efectos visuales después de mostrar la pantalla
        setTimeout(() => {
            firetruckOnFire = false;
            gameOverExplosion = false;
            explosionPool.clear();
            comboSystem?.reset();
        }, 1000);
    }, 2000);
}

function resetGame() {
    gameState = 'presentation';
    
    // Limpiar pantallas
    getDom('gameoverScreen')?.classList.remove('active');
    getDom('mapScreen')?.classList.remove('active');
    getDom('presentationScreen')?.classList.add('active');
    
    // Resetear valores
    score = 0;
    timeElapsed = 0;
    firesDodged = 0;
    gameSpeed = 1;
    fires.length = 0;
    particlePool.clear();
    explosionPool.clear();
    groundFires.length = 0;
    groundFireFlashUntil = 0;
    groundFireFlashIntensity = 0;
    groundFireFlashDuration = GROUND_FIRE_FLASH_DURATION;
    totalDistance = 0;
    currentSpeed = 0;
    maxSpeed = 0;
    firetruck.lastSpeed = 0;
    comboSystem?.reset();
    powerUpSystem?.reset();
    extremeSpeedAlert?.reset();
    
    // Limpiar countdown
    setTextContent('countdown', '');
}

function setupMapControls() {
    // Botón para ver mapa
    getDom('viewMapButton')?.addEventListener('click', () => {
        showMapScreen();
    });
    
    // Botón para cerrar mapa
    getDom('closeMapButton')?.addEventListener('click', () => {
        getDom('mapScreen')?.classList.remove('active');
        getDom('gameoverScreen')?.classList.add('active');
    });
    
    // Botón para compartir ruta
    getDom('shareRouteButton')?.addEventListener('click', () => {
        shareRoute();
    });
}

function showMapScreen() {
    getDom('gameoverScreen')?.classList.remove('active');
    getDom('mapScreen')?.classList.add('active');
    
    // Actualizar estadísticas del mapa
    setTextContent('mapDistance', formatDistanceValue(parseFloat(totalDistance.toFixed(2))));
    setTextContent('mapTime', formatTimeValue(timeElapsed));
    setTextContent('mapScore', formatNumber(score));
    
    // Visualizar ruta
    visualizeRoute();
}

// Función para mostrar un mapa real con Leaflet
function visualizeRoute() {
    console.log('Visualizando ruta con mapa real:', { startLocation, endLocation });
    
    // Verificar si tenemos datos GPS reales
    const hasStartData = startLocation && startLocation.lat !== null && startLocation.lng !== null;
    const hasEndData = endLocation && endLocation.lat !== null && endLocation.lng !== null;
    
    console.log('Datos GPS disponibles:', { hasStartData, hasEndData });
    
    if (!hasStartData && !hasEndData) {
        console.log('No hay datos de ubicación suficientes para mostrar mapa real');
        initFallbackMap();
        return;
    }
    
    // Usar ubicaciones disponibles o current location como respaldo
    let startLat, startLng, endLat, endLng;
    
    if (hasStartData) {
        startLat = startLocation.lat;
        startLng = startLocation.lng;
    } else {
        startLat = currentLocation.lat || -34.6118; // Buenos Aires por defecto
        startLng = currentLocation.lng || -58.3960;
    }
    
    if (hasEndData) {
        endLat = endLocation.lat;
        endLng = endLocation.lng;
    } else {
        endLat = currentLocation.lat || -34.6118;
        endLng = currentLocation.lng || -58.3960;
    }
    
    // Si no hay movimiento real, simular una ruta pequeña
    if (startLat === endLat && startLng === endLng) {
        endLat += 0.005; // Agregar pequeño desplazamiento
        endLng += 0.005;
    }
    
    initLeafletMap(startLat, startLng, endLat, endLng);
}

// Inicializar mapa real con Leaflet
function initLeafletMap(startLat, startLng, endLat, endLng) {
    try {
        const mapContainer = getDom('routeMap');
        if (!mapContainer) {
            console.warn('[initLeafletMap] Contenedor de mapa no disponible');
            return;
        }
        
        // Limpiar mapa anterior si existe
        if (window.routeMapInstance) {
            window.routeMapInstance.remove();
        }
        
        // Calcular centro del mapa
        const centerLat = (startLat + endLat) / 2;
        const centerLng = (startLng + endLng) / 2;
        
        // Crear mapa
        const map = L.map('route-map', {
            zoomControl: true,
            scrollWheelZoom: false,
            doubleClickZoom: false,
            touchZoom: true
        }).setView([centerLat, centerLng], 15);
        
        // Agregar tiles de OpenStreetMap
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors',
            maxZoom: 18
        }).addTo(map);
        
        // Marcador de inicio
        const startMarker = L.marker([startLat, startLng]).addTo(map);
        startMarker.bindPopup('🏁 <b>INICIO</b><br>Ubicación inicial').openPopup();
        
        // Marcador de fin
        const endMarker = L.marker([endLat, endLng]).addTo(map);
        endMarker.bindPopup('🚩 <b>FINAL</b><br>Ubicación final');
        
        // Línea de ruta
        const routeLine = L.polyline([
            [startLat, startLng],
            [endLat, endLng]
        ], {
            color: '#ff4444',
            weight: 4,
            opacity: 0.8
        }).addTo(map);
        
        // Ajustar vista para mostrar toda la ruta
        const group = new L.featureGroup([startMarker, endMarker, routeLine]);
        map.fitBounds(group.getBounds().pad(0.1));
        
        // Guardar referencia del mapa
        window.routeMapInstance = map;
        
        // Calcular distancia real
    const distance = calculateDistance(startLat, startLng, endLat, endLng);
    setTextContent('mapDistance', `${distance.toFixed(2)} km`);
        
        console.log('Mapa real inicializado correctamente');
        
    } catch (error) {
        console.error('Error al crear mapa real:', error);
        initFallbackMap();
    }
}

// Mapa de respaldo si Leaflet falla
function initFallbackMap() {
    const mapContainer = getDom('routeMap');
    if (!mapContainer) {
        return;
    }
    mapContainer.innerHTML = `
        <div style="display: flex; align-items: center; justify-content: center; height: 100%; background: linear-gradient(135deg, #2c3e50, #3498db); color: white; text-align: center; border-radius: 10px;">
            <div>
                <div style="font-size: 48px; margin-bottom: 10px;">🗺️</div>
                <div style="font-size: 18px; margin-bottom: 5px;">Mapa GPS</div>
                <div style="font-size: 14px; opacity: 0.8;">
                    ${startLocation.lat ? 'Ruta registrada correctamente' : 'Activar GPS para ver ruta real'}
                </div>
            </div>
        </div>
    `;
}

function shareRoute() {
    const routeData = {
        score: score,
        time: timeElapsed,
        distance: totalDistance.toFixed(2),
        firesDodged: firesDodged,
        maxSpeed: Math.floor(maxSpeed),
        startLocation: startLocation.name,
        endLocation: endLocation.name
    };
    
    const shareText = `🚒 ¡Completé una misión de autobomba!
📊 Puntos: ${routeData.score}
⏱️ Tiempo: ${routeData.time}s
📏 Distancia: ${routeData.distance} km
🔥 Fuegos esquivados: ${routeData.firesDodged}
⚡ Velocidad máxima: ${routeData.maxSpeed} km/h
🗺️ Ruta: ${routeData.startLocation} → ${routeData.endLocation}

¡Juega tú también! 🎮
Powered by Diego Markiewicz ☕🚀🧉💪💖`;

    if (navigator.share) {
        navigator.share({
            title: '🚒 Autobomba - Resultados de Misión',
            text: shareText,
            url: window.location.href
        }).then(() => {
            console.log('Ruta compartida exitosamente');
        }).catch((error) => {
            console.log('Error compartiendo:', error);
            fallbackShare(shareText);
        });
    } else {
        fallbackShare(shareText);
    }
}

function fallbackShare(text) {
    if (navigator.clipboard) {
        navigator.clipboard.writeText(text).then(() => {
            alert('📋 ¡Resultados copiados al portapapeles!');
        }).catch((error) => {
            console.error('Error copiando al portapapeles:', error);
            alert('No se pudo copiar automáticamente. Puedes copiar manualmente los resultados.');
        });
    } else {
        alert('Función de compartir no disponible en este dispositivo.');
    }
}

// Prevenir zoom en dispositivos móviles
document.addEventListener('touchstart', (e) => {
    if (e.touches.length > 1) {
        e.preventDefault();
    }
});

document.addEventListener('gesturestart', (e) => {
    e.preventDefault();
});

// Prevenir scroll en pantalla de juego
document.addEventListener('touchmove', (e) => {
    if (gameState === 'playing') {
        e.preventDefault();
    }
}, { passive: false });

export function createGameEngine() {
    return {
        bootstrap: bootstrapGame,
        start: startGame,
        reset: resetGame,
        handleShake,
        getState: () => ({
            getScore: () => score,
            getTimeElapsed: () => timeElapsed,
            getFiresDodged: () => firesDodged,
            getGameSpeed: () => gameSpeed,
            getTotalDistance: () => totalDistance,
            getMaxSpeed: () => maxSpeed,
            getGameState: () => gameState
        }),
        getSettings: () => settingsService
    };
}
