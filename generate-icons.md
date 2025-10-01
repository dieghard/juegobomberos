# Script para generar iconos PWA desde SVG

## Instrucciones para generar iconos de diferentes tamaños

Para generar todos los iconos necesarios para la PWA, puedes usar cualquiera de estos métodos:

### Método 1: Usando ImageMagick (Línea de comandos)
```bash
# Instalar ImageMagick primero
# Windows: choco install imagemagick
# macOS: brew install imagemagick
# Linux: sudo apt-get install imagemagick

# Convertir SVG a diferentes tamaños PNG
magick icon.svg -resize 72x72 icon-72.png
magick icon.svg -resize 96x96 icon-96.png
magick icon.svg -resize 128x128 icon-128.png
magick icon.svg -resize 144x144 icon-144.png
magick icon.svg -resize 152x152 icon-152.png
magick icon.svg -resize 192x192 icon-192.png
magick icon.svg -resize 384x384 icon-384.png
magick icon.svg -resize 512x512 icon-512.png
```

### Método 2: Usando herramientas online
1. Ve a https://realfavicongenerator.net/
2. Sube el archivo `icon.svg`
3. Configura para PWA
4. Descarga todos los tamaños generados

### Método 3: Usando Node.js (automatizado)
Crea un archivo `generate-icons.js`:

```javascript
const sharp = require('sharp');
const fs = require('fs');

const sizes = [72, 96, 128, 144, 152, 192, 384, 512];

async function generateIcons() {
    for (const size of sizes) {
        await sharp('icon.svg')
            .resize(size, size)
            .png()
            .toFile(`icon-${size}.png`);
        
        console.log(`Generated icon-${size}.png`);
    }
}

generateIcons().catch(console.error);
```

Luego ejecuta:
```bash
npm install sharp
node generate-icons.js
```

### Método 4: Usando GIMP o Photoshop
1. Abre `icon.svg` en GIMP/Photoshop
2. Exporta como PNG en cada tamaño requerido
3. Guarda con los nombres correctos (icon-72.png, icon-96.png, etc.)

## Tamaños requeridos para PWA:
- 72x72 - Android Chrome
- 96x96 - Android Chrome
- 128x128 - Chrome Web Store
- 144x144 - IE11 Metro tile
- 152x152 - Safari iOS
- 192x192 - Android Chrome
- 384x384 - Android Chrome splash
- 512x512 - Android Chrome splash

## Verificación
Una vez generados los iconos, asegúrate de que:
1. Todos los archivos PNG estén en la raíz del proyecto
2. Los nombres coincidan con los del manifest.json
3. Tengan el fondo adecuado (no transparente para mejor compatibilidad)

## Testing PWA
Para probar la PWA:
1. Sirve el proyecto en HTTPS o localhost
2. Abre Chrome DevTools > Application > Manifest
3. Verifica que todos los iconos aparezcan correctamente
4. Usa Lighthouse para auditar la PWA