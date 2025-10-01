# 🚒 Autobomba - Esquiva los Fuegos

Una Progressive Web App (PWA) de un emocionante videojuego donde controlas una autobomba que debe esquivar fuegos en el bosque usando el giroscopio de tu celular.

## 🎮 Características del Juego

- **Control por Giroscopio**: Inclina tu celular para mover la autobomba
- **Geolocalización**: Usa tu ubicación GPS para crear una experiencia más realista
- **Dificultad Progresiva**: Los fuegos se vuelven más frecuentes y complejos con el tiempo
- **PWA Completa**: Instálala en tu celular como una app nativa
- **Detección de Agitación**: Agita el celular para iniciar el juego
- **Gráficos Animados**: Efectos visuales atractivos con Canvas HTML5

## 🚀 Instalación

### Método 1: Servidor Local
1. Clona o descarga este repositorio
2. Navega a la carpeta del proyecto
3. Ejecuta un servidor local:
   ```bash
   # Con Python 3
   python -m http.server 8000
   
   # Con Node.js (si tienes http-server instalado)
   npx http-server
   
   # Con PHP
   php -S localhost:8000
   ```
4. Abre tu navegador y ve a `http://localhost:8000`

### Método 2: GitHub Pages o Hosting
1. Sube todos los archivos a tu hosting web
2. Accede desde tu dispositivo móvil
3. El navegador te ofrecerá "Agregar a pantalla de inicio"

## 📱 Instalación como PWA

### En Android (Chrome/Edge):
1. Abre el juego en Chrome o Edge
2. Aparecerá un banner "Agregar a pantalla de inicio"
3. O ve al menú → "Agregar a pantalla de inicio"

### En iOS (Safari):
1. Abre el juego en Safari
2. Toca el botón de compartir (📤)
3. Selecciona "Agregar a pantalla de inicio"

## 🎯 Cómo Jugar

1. **Presentación**: La pantalla inicial explica las características
2. **Iniciar**: Agita tu celular para comenzar
3. **Cuenta Regresiva**: 3, 2, 1... ¡Empieza!
4. **Controlar**: Inclina tu celular izquierda/derecha para mover la autobomba
5. **Esquivar**: Evita los fuegos que caen del bosque
6. **Puntuar**: Cada fuego esquivado suma puntos
7. **Game Over**: Si tocas un fuego, el juego termina

## 🛠️ Tecnologías Utilizadas

- **HTML5 Canvas**: Para los gráficos del juego
- **Device Orientation API**: Para control por giroscopio
- **Device Motion API**: Para detección de agitación
- **Geolocation API**: Para obtener ubicación GPS
- **Service Worker**: Para funcionalidad offline
- **Web App Manifest**: Para instalación PWA
- **CSS3**: Animaciones y responsive design
- **JavaScript ES6+**: Lógica del juego

## 🔧 Estructura del Proyecto

```
juegomotombomba/
├── index.html          # Página principal
├── manifest.json       # Configuración PWA
├── sw.js              # Service Worker
├── styles.css         # Estilos CSS
├── game.js            # Lógica del juego
├── icon.svg           # Icono vectorial
└── README.md          # Este archivo
```

## 🎨 Personalización

### Cambiar Dificultad
En `game.js`, modifica estas variables:
```javascript
gameSpeed = 1 + timeElapsed * 0.05;  // Velocidad de aumento
const spawnRate = Math.max(0.02, 0.08 - timeElapsed * 0.001);  // Frecuencia de fuegos
```

### Cambiar Controles
Ajusta la sensibilidad del giroscopio:
```javascript
const sensitivity = 3;        // Aumenta para más sensibilidad
const maxTilt = 30;          // Grados máximos de inclinación
```

### Cambiar Colores
Modifica los gradientes en `styles.css`:
```css
background: linear-gradient(135deg, #2d5016, #4a7c23, #2d5016);
```

## 📋 Requisitos del Dispositivo

- **Navegador**: Chrome, Safari, Edge, Firefox (moderno)
- **Sensores**: Giroscopio y acelerómetro
- **Permisos**: Orientación del dispositivo y movimiento
- **Conexión**: Internet para primera carga (luego funciona offline)

## 🐛 Solución de Problemas

### El giroscopio no funciona:
- Asegúrate de dar permisos cuando el navegador los solicite
- En iOS 13+, los permisos son obligatorios
- Prueba recargar la página

### No detecta agitación:
- Aumenta la sensibilidad en el código
- Como alternativa, toca la pantalla para iniciar

### No se instala como PWA:
- Debe servirse por HTTPS (excepto localhost)
- Verifica que manifest.json sea válido
- Algunos navegadores necesitan interacción del usuario primero

## 📄 Licencia

Este proyecto es de código abierto. Puedes usarlo, modificarlo y distribuirlo libremente.

## 🤝 Contribuciones

¡Las contribuciones son bienvenidas! Puedes:
- Reportar bugs
- Sugerir nuevas características
- Mejorar el código
- Agregar más efectos visuales

## 🎉 Créditos

**Desarrollado con ❤️ por Diego Markiewicz** ☕🚀🧉💪💖

Desarrollado como ejemplo de PWA con controles de giroscopio y geolocalización.

---

¡Disfruta esquivando fuegos con tu autobomba! 🚒🔥