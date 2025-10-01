// Variables globales del juego
let canvas, ctx;
let gameState = 'presentation'; // presentation, countdown, playing, gameover, map
let gameStartTime;
let score = 0;
let timeElapsed = 0;
let firesDodged = 0;
let gameSpeed = 1;
let animationId;

// Controles de teclado para pantallas grandes
let keyboardControls = {
    left: false,
    right: false,
    up: false,
    down: false
};
let isLargeScreen = false;
let useKeyboardControls = false;

// Variables de distancia y velocidad
let totalDistance = 0;
let currentSpeed = 0;
let maxSpeed = 0;
let lastSpeedUpdate = 0;

// Variables de dispositivo y controles
let deviceOrientation = { beta: 0, gamma: 0 };
let lastShakeTime = 0;
let shakeThreshold = 15;
let lastAcceleration = { x: 0, y: 0, z: 0 };

// Variables de geolocación mejoradas
let currentLocation = { lat: null, lng: null, accuracy: null };
let startLocation = { lat: null, lng: null, name: "Punto de inicio" };
let endLocation = { lat: null, lng: null, name: "Punto final" };
let locationName = "Ubicación desconocida";
let watchPositionId = null;

// Variables de audio
let audioContext;
let audioEnabled = false;
let lastEngineSound = 0;

// Variables PWA
let deferredPrompt;
let isInstalled = false;

// Variables de efectos visuales
let trees = [];
let backgroundObjects = [];
let explosionParticles = [];
let firetruckOnFire = false;
let gameOverExplosion = false;

// Variables del juego
let firetruck = {
    x: 0,
    y: 0,
    width: 60,
    height: 40,
    speed: 5,
    maxSpeed: 8,
    lastSpeed: 0
};

let fires = [];
let particles = [];

// Inicialización
document.addEventListener('DOMContentLoaded', () => {
    initGame();
    setupPermissionButton();
    setupMapControls();
    setupStartButton(); // Agregar configuración del botón de inicio
    checkPermissionsOnLoad();
    
    // Detectar tipo de pantalla y configurar controles
    detectScreenSize();
    setupKeyboardControls();
    
    // Actualizar controles cuando cambie el tamaño de pantalla
    window.addEventListener('resize', detectScreenSize);
    
    // Inicializar PWA
    initPWA();
    // Solicitar ubicación después de un breve delay para mejor UX
    setTimeout(() => {
        requestLocationPermission();
    }, 1000);
});

// Configurar botón de inicio del juego
function setupStartButton() {
    const startBtn = document.getElementById('start-game-btn');
    const controlInstructions = document.getElementById('control-instructions');
    
    if (startBtn) {
        startBtn.addEventListener('click', () => {
            console.log('Botón de inicio clickeado');
            handleShake();
        });
        
        // También permitir inicio con teclas
        document.addEventListener('keydown', (event) => {
            if (gameState === 'presentation') {
                if (event.key === 'Enter' || event.key === ' ' || 
                    event.key === 'ArrowUp' || event.key === 'ArrowDown' || 
                    event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
                    event.preventDefault();
                    console.log('Tecla presionada para iniciar:', event.key);
                    handleShake();
                }
            }
        });
        
        // Actualizar instrucciones según el tipo de dispositivo
        if (isLargeScreen && useKeyboardControls) {
            controlInstructions.textContent = 'Presiona ENTER, ESPACIO o cualquier flecha para comenzar';
        }
    }
}

function setupPermissionButton() {
    const permissionBtn = document.getElementById('permission-btn');
    const permissionStatus = document.getElementById('permission-status');
    
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
    const permissionStatus = document.getElementById('permission-status');
    
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
    const locationStatus = document.getElementById('location-text');
    const locationBtn = document.getElementById('location-btn');
    
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
    canvas = document.getElementById('gameCanvas');
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
    try {
        // Intentar crear AudioContext
        if (!audioContext) {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
        
        // Verificar estado del contexto
        if (audioContext.state === 'suspended') {
            console.log('AudioContext suspendido, intentando reanudar...');
            audioContext.resume().then(() => {
                audioEnabled = true;
                console.log('Sistema de audio reanudado correctamente');
            }).catch(err => {
                console.warn('Error al reanudar audio:', err);
                audioEnabled = false;
            });
        } else {
            audioEnabled = true;
            console.log('Sistema de audio inicializado correctamente');
        }
        
        // Test básico de audio
        setTimeout(() => {
            if (audioEnabled && audioContext && audioContext.state === 'running') {
                console.log('Audio funcionando correctamente');
            } else {
                console.warn('Audio no está funcionando correctamente');
                audioEnabled = false;
            }
        }, 100);
        
    } catch (error) {
        console.warn('Audio no disponible:', error);
        audioEnabled = false;
    }
}

// Función para reactivar audio en interacción del usuario
function ensureAudioContext() {
    if (!audioContext) {
        initAudio();
        return;
    }
    
    if (audioContext.state === 'suspended') {
        audioContext.resume().then(() => {
            audioEnabled = true;
            console.log('Audio reactivado por interacción del usuario');
        }).catch(err => {
            console.warn('Error al reactivar audio:', err);
        });
    }
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
    const controlInstructions = document.getElementById('control-instructions');
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
    if (!audioEnabled || !audioContext) return;
    
    try {
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime);
        oscillator.type = type;
        
        gainNode.gain.setValueAtTime(0, audioContext.currentTime);
        gainNode.gain.linearRampToValueAtTime(volume, audioContext.currentTime + 0.01);
        gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + duration);
        
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + duration);
    } catch (error) {
        console.warn('Error creando sonido:', error);
    }
}

function playEngineSound(speed) {
    const now = Date.now();
    if (now - lastEngineSound < 100) return; // Limitar frecuencia
    
    const baseFreq = 80;
    const frequency = baseFreq + (speed * 10);
    const volume = Math.min(0.15, 0.05 + (speed * 0.01));
    
    createTone(frequency, 0.1, 'sawtooth', volume);
    lastEngineSound = now;
}

function playFireSound() {
    // Sonido de fuego - ruido blanco modulado
    if (!audioEnabled || !audioContext) return;
    
    try {
        const bufferSize = audioContext.sampleRate * 0.3;
        const buffer = audioContext.createBuffer(1, bufferSize, audioContext.sampleRate);
        const data = buffer.getChannelData(0);
        
        for (let i = 0; i < bufferSize; i++) {
            data[i] = (Math.random() * 2 - 1) * 0.1 * Math.sin(i * 0.01);
        }
        
        const source = audioContext.createBufferSource();
        const gainNode = audioContext.createGain();
        
        source.buffer = buffer;
        source.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        gainNode.gain.setValueAtTime(0.05, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.3);
        
        source.start();
    } catch (error) {
        console.warn('Error en sonido de fuego:', error);
    }
}

function playExplosionSound() {
    // Sonido de explosión
    createTone(60, 0.1, 'sawtooth', 0.3);
    setTimeout(() => createTone(40, 0.2, 'triangle', 0.2), 50);
    setTimeout(() => createTone(30, 0.3, 'sine', 0.1), 100);
}

function triggerVibration(pattern = [200]) {
    if ('vibrate' in navigator) {
        navigator.vibrate(pattern);
    }
}

// Sistema PWA
function initPWA() {
    const installSection = document.getElementById('install-section');
    const installBtn = document.getElementById('install-btn');
    
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
    const installSection = document.getElementById('install-section');
    const installBtn = document.getElementById('install-btn');
    
    installSection.classList.remove('hidden');
    installBtn.textContent = '⬇️ Instalar Autobomba';
    
    console.log('Botón de instalación mostrado');
}

function showManualInstallInstructions() {
    const installSection = document.getElementById('install-section');
    const installBtn = document.getElementById('install-btn');
    const installCard = installSection.querySelector('.install-card');
    
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
    
    const installBtn = document.getElementById('install-btn');
    
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
    const installSection = document.getElementById('install-section');
    const installBtn = document.getElementById('install-btn');
    const installCard = installSection.querySelector('.install-card');
    
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
        const gameScreen = document.getElementById('game-screen');
        const presentationScreen = document.getElementById('presentation-screen');
        const gameoverScreen = document.getElementById('gameover-screen');
        
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
    const countdownElement = document.getElementById('countdown');
    
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
    fires = [];
    particles = [];
    
    // Resetear métricas de distancia
    totalDistance = 0;
    currentSpeed = 0;
    maxSpeed = 0;
    lastSpeedUpdate = Date.now();
    
    // Resetear efectos visuales
    firetruckOnFire = false;
    gameOverExplosion = false;
    explosionParticles = [];
    
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
    document.getElementById('presentation-screen').classList.remove('active');
    document.getElementById('game-screen').classList.add('active');
    
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
    const locationStatus = document.getElementById('location-text');
    const locationContainer = document.getElementById('location-status');
    
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
        const locationName = generateLocationName(lat, lng);
        
        console.log('Nombre de ubicación establecido:', locationName);
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
    const locationElement = document.getElementById('current-location');
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
    
    // Usar controles de teclado si es pantalla grande
    if (useKeyboardControls && isLargeScreen) {
        const keySpeed = firetruck.speed * 0.8; // Velocidad del teclado
        
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
        const sensitivity = 3;
        const maxTilt = 30; // grados máximos de inclinación
        
        // Normalizar el valor gamma (-30 a 30 grados)
        let normalizedGamma = Math.max(-maxTilt, Math.min(maxTilt, deviceOrientation.gamma));
        
        // Convertir a velocidad de movimiento
        moveSpeed = (normalizedGamma / maxTilt) * firetruck.speed;
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
    document.getElementById('speed').textContent = Math.floor(currentSpeed);
    document.getElementById('distance').textContent = totalDistance.toFixed(2);
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

function updateFires() {
    if (gameState !== 'playing') return;
    
    for (let i = fires.length - 1; i >= 0; i--) {
        const fire = fires[i];
        fire.y += fire.speed;
        
        // Remover fuegos que salieron de pantalla
        if (fire.y > canvas.height) {
            fires.splice(i, 1);
            firesDodged++;
            score += 10;
            continue;
        }
        
        // Verificar colisión con autobomba
        if (checkCollision(firetruck, fire)) {
            gameOver();
            return;
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
    for (let i = 0; i < 5; i++) {
        particles.push({
            x: x + Math.random() * 20,
            y: y + Math.random() * 20,
            vx: (Math.random() - 0.5) * 4,
            vy: (Math.random() - 0.5) * 4,
            life: 30 + Math.random() * 20,
            maxLife: 50,
            color: color
        });
    }
}

function createExplosionParticles(x, y) {
    // Crear muchas partículas para la explosión
    for (let i = 0; i < 30; i++) {
        explosionParticles.push({
            x: x,
            y: y,
            vx: (Math.random() - 0.5) * 15,
            vy: (Math.random() - 0.5) * 15,
            life: 60 + Math.random() * 40,
            maxLife: 100,
            size: 2 + Math.random() * 8,
            color: `hsl(${Math.random() < 0.7 ? '30, 100%' : '0, 100%'}, ${70 + Math.random() * 30}%)`
        });
    }
}

function updateExplosionParticles() {
    for (let i = explosionParticles.length - 1; i >= 0; i--) {
        const particle = explosionParticles[i];
        particle.x += particle.vx;
        particle.y += particle.vy;
        particle.vx *= 0.98; // Fricción
        particle.vy += 0.2; // Gravedad
        particle.life--;
        
        if (particle.life <= 0) {
            explosionParticles.splice(i, 1);
        }
    }
}

function updateParticles() {
    for (let i = particles.length - 1; i >= 0; i--) {
        const particle = particles[i];
        particle.x += particle.vx;
        particle.y += particle.vy;
        particle.life--;
        
        if (particle.life <= 0) {
            particles.splice(i, 1);
        }
    }
}

function updateGameState() {
    if (gameState !== 'playing') return;
    
    timeElapsed = Math.floor((Date.now() - gameStartTime) / 1000);
    
    // Aumentar dificultad con el tiempo (progresión más gradual)
    gameSpeed = 0.8 + timeElapsed * 0.03; // Comenzar más lento y progresar gradualmente
    
    // Spawning de fuegos más frecuente con el tiempo (menos agresivo inicialmente)
    const spawnRate = Math.max(0.015, 0.05 - timeElapsed * 0.0008); // Comenzar con menos fuegos
    if (Math.random() < spawnRate) {
        spawnFire();
    }
    
    // Actualizar UI
    document.getElementById('score').textContent = score;
    document.getElementById('time').textContent = timeElapsed;
}

function drawFiretruck() {
    ctx.save();
    
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
    for (const particle of particles) {
        const alpha = particle.life / particle.maxLife;
        ctx.fillStyle = `rgba(${particle.color}, ${alpha})`;
        ctx.fillRect(particle.x, particle.y, 3, 3);
    }
    ctx.restore();
}

function drawExplosionParticles() {
    ctx.save();
    for (const particle of explosionParticles) {
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
        
        // Dibujar fuegos
        fires.forEach(fire => drawFire(fire));
        
        // Dibujar autobomba
        drawFiretruck();
        
        // Dibujar partículas
        drawParticles();
        
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
        updateParticles();
        updateGameState();
        updateBackground();
    }
    
    // Actualizar efectos de explosión incluso en game over
    if (gameOverExplosion) {
        updateExplosionParticles();
    }
    
    render();
    animationId = requestAnimationFrame(gameLoop);
}

function gameOver() {
    gameState = 'gameover';
    
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
        document.getElementById('game-screen').classList.remove('active');
        document.getElementById('gameover-screen').classList.add('active');
        
        // Actualizar estadísticas finales
        document.getElementById('final-score').textContent = score;
        document.getElementById('final-time').textContent = timeElapsed + 's';
        document.getElementById('fires-dodged').textContent = firesDodged;
        document.getElementById('final-distance').textContent = totalDistance.toFixed(2) + ' km';
        document.getElementById('max-speed').textContent = Math.floor(maxSpeed) + ' km/h';
        
        // Actualizar información de ubicación
        document.getElementById('start-location').textContent = startLocation.name;
        document.getElementById('end-location').textContent = endLocation.name;
        
        console.log('Game over - Ubicaciones:', { start: startLocation.name, end: endLocation.name });
        
        // Resetear efectos visuales después de mostrar la pantalla
        setTimeout(() => {
            firetruckOnFire = false;
            gameOverExplosion = false;
            explosionParticles = [];
        }, 1000);
    }, 2000);
}

function resetGame() {
    gameState = 'presentation';
    
    // Limpiar pantallas
    document.getElementById('gameover-screen').classList.remove('active');
    document.getElementById('map-screen').classList.remove('active');
    document.getElementById('presentation-screen').classList.add('active');
    
    // Resetear valores
    score = 0;
    timeElapsed = 0;
    firesDodged = 0;
    gameSpeed = 1;
    fires = [];
    particles = [];
    totalDistance = 0;
    currentSpeed = 0;
    maxSpeed = 0;
    
    // Limpiar countdown
    document.getElementById('countdown').textContent = '';
}

function setupMapControls() {
    // Botón para ver mapa
    document.getElementById('view-map-btn').addEventListener('click', () => {
        showMapScreen();
    });
    
    // Botón para cerrar mapa
    document.getElementById('close-map-btn').addEventListener('click', () => {
        document.getElementById('map-screen').classList.remove('active');
        document.getElementById('gameover-screen').classList.add('active');
    });
    
    // Botón para compartir ruta
    document.getElementById('share-route-btn').addEventListener('click', () => {
        shareRoute();
    });
}

function showMapScreen() {
    document.getElementById('gameover-screen').classList.remove('active');
    document.getElementById('map-screen').classList.add('active');
    
    // Actualizar estadísticas del mapa
    document.getElementById('map-distance').textContent = totalDistance.toFixed(2) + ' km';
    document.getElementById('map-time').textContent = timeElapsed + 's';
    document.getElementById('map-score').textContent = score;
    
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
        const mapContainer = document.getElementById('route-map');
        
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
        document.getElementById('map-distance').textContent = distance.toFixed(2) + ' km';
        
        console.log('Mapa real inicializado correctamente');
        
    } catch (error) {
        console.error('Error al crear mapa real:', error);
        initFallbackMap();
    }
}

// Mapa de respaldo si Leaflet falla
function initFallbackMap() {
    const mapContainer = document.getElementById('route-map');
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