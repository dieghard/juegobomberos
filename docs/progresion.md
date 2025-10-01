# Plan de progresión y datos persistentes

## Objetivos generales

- Extender la vida útil del juego con metas claras de corto, mediano y largo plazo.
- Incentivar la repetición de partidas mediante recompensas tangibles (cosméticos, ventajas temporales, narrativa ligera).
- Mantener toda la información en almacenamiento local primero; contemplar sincronización remota opcional futura.

## Capas de progresión

### 1. Misiones inmediatas (loop diario)

- **Misiones rápidas** (3 por día):
  - Ejemplos: *Esquiva 30 llamas*, *Activa 2 power-ups de escudo*, *Sobrevive 90 segundos*.
  - Recompensas: combustible (moneda blanda) y puntos de experiencia (XP) para el pase de misión.
- Rotación diaria basada en semilla `YYYY-MM-DD` para generar nuevas misiones sin requerir backend.
- Seguimiento: contador incremental + bandera `completedAt`. Reinicio automático a medianoche según hora local.

### 2. Logros permanentes (metas a largo plazo)

- 4 categorías principales:
  1. **Dominio**: combos altos, puntuaciones máximas.
  2. **Rescate**: distancia recorrida acumulada, número de partidas.
  3. **Control de incendios**: power-ups usados, fuegos limpiados.
  4. **Exploración**: ubicaciones distintas visitadas (basadas en hash de coordenadas).
- Cada logro tiene 3 rangos (Bronce, Plata, Oro) con requisitos crecientes.
- Recompensas: medallas visibles en la presentación, desbloqueo de skins y misiones especiales.

### 3. Pase de campaña (progresión por temporada)

- Temporadas de 4 semanas con 10 capítulos.
- Cada capítulo se desbloquea al completar un conjunto de misiones/XP.
- Al finalizar un capítulo se avanza en un mapa lineal (ver documento de campaña) y se añade contenido narrativo + bioma nuevo.

### 4. Recompensas cosméticas

- Garage con skins del camión, trail de partículas, sirenas y filtros de color.
- Desbloqueo mediante hitos de logros o tokens ganados en campañas.

## Modelo de datos propuesto (localStorage / IndexedDB)

| Clave | Estructura | Descripción |
| --- | --- | --- |
| `autobomba-highscores-v1` | `{ bestScore, bestTime, bestDistance, bestCombo, bestSpeed, runsPlayed }` | Reutiliza el esquema actual, sirve como base de progreso. |
| `autobomba-missions-v1` | `{ dateSeed, missions: MissionState[], refreshedAt }` | Lista de misiones diarias con estado (progress, goal, reward, completedAt). |
| `autobomba-achievements-v1` | `{ categories: { [id]: { level, progress, unlockedAt }}}` | Progreso acumulado por logro y nivel actual. |
| `autobomba-campaign-v1` | `{ season, chapterIndex, checkpointProgress, unlockedBiomes: string[] }` | Rastrea avance en campaña, capítulos y biomas liberados. |
| `autobomba-inventory-v1` | `{ tokens, cosmetics: { [id]: { owned, equipped }}}` | Control de recompensas cosméticas y recursos. |
| `autobomba-settings-v1` | `{ audio: boolean, tiltSensitivity, language, accessibility: {...} }` | Preferencias del jugador; útil para migraciones futuras. |

`MissionState` -> `{ id, title, type, goal, progress, reward: { xp, currency }, completedAt }`

## Flujo de misión diaria

1. Al iniciar el juego, se carga `autobomba-missions-v1`.
2. Si `dateSeed` != fecha actual, se genera un nuevo set de misiones usando listas predefinidas + RNG.
3. Durante la partida, cada evento relevante (fuego esquivado, power-up activado, combo alcanzado) invoca `missionTracker.update(event)`.
4. Al completar una misión, se otorgan recompensas y se muestra banner HUD.
5. Los progresos se guardan inmediatamente (write-through) para evitar pérdidas.

## Seguimiento de logros

- Tabla de eventos -> logros (p.ej. `EVENT_FIRE_DODGED` suma a logros `dominance.combo`, `control.fires`).
- Los rangos se calculan mediante umbrales: ejemplo `$combo >= [10, 20, 35]$` para Bronce, Plata, Oro.
- Al subir de rango, se dispara animación en pantalla de resultados y se actualiza `inventory` si desbloquea cosmético.

## Roadmap técnico

1. **Iteración 1 (offline-first)**
   - Implementar `storageService` con fallback a memoria.
   - Añadir `missionTracker`, `achievementTracker` como módulos separados.
   - Conectar eventos básicos del juego a los trackers (sin UI adicional).
2. **Iteración 2 (UI/UX)**
   - Resumen de misiones y logros en pantalla principal (cards dinámicas).
   - Pop-ups de recompensa y panel de inventario.
3. **Iteración 3 (Narrativa / Campaña)**
   - Map UI con capítulos, gating por XP.
   - Biomas temáticos que cambian fondo, partículas y música.
4. **Iteración 4 (Sincronización opcional)**
   - Preparar capa de sincronización (REST o Firebase-lite) utilizando el mismo esquema JSON.

## Estrategia de persistencia y migración

- Versionar cada colección (`-v1`).
- Guardar `schemaVersion` global para detectar migraciones y aplicar transformaciones.
- Implementar copias de seguridad puntuales (e.g. `localStorage.setItem(key + ':backup', data)`).
- Validar integridad al cargar; si falla, rehidratar con defaults y registrar en consola.

## Métricas y telemetría local (opt-in)

- Guardar contador de sesiones consecutivas (`streak`).
- Tiempo promedio de partida, porcentaje de misiones completadas.
- Estas métricas alimentan ajustes dinámicos de dificultad (a futuro).

## Próximos pasos

- Definir catálogo inicial de logros y misiones (tabla detallada).
- Diseñar wireframes de la pantalla de progreso.
- Planificar pruebas de usabilidad para calibrar dificultad.
