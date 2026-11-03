# ⏱ Reloj.js

Aplicación web de tiempo **todo en uno**: reloj analógico + digital con
alarmas, cronómetro con vueltas y temporizador configurable.

HTML, CSS y **JavaScript puros, sin dependencias y sin build**: son tres
archivos que hablan directamente con el navegador.

🌐 **Aplicación en vivo:** <https://carlos1290.github.io/RELOJ_JS/>

![Version](https://img.shields.io/badge/versi%C3%B3n-v1.1-35e0d2)
![Stack](https://img.shields.io/badge/vanilla-JS%20%C2%B7%20HTML%20%C2%B7%20CSS-f5a524)
![Dependencias](https://img.shields.io/badge/dependencias_runtime-0-success)
![License](https://img.shields.io/badge/licencia-ninguna%20%28uso%20personal%29-7c8db0)

---

## Índice

- [Características](#características)
- [Los cuatro paneles](#los-cuatro-paneles)
- [Atajos de teclado](#atajos-de-teclado)
- [Sonido sintetizado con Web Audio API](#sonido-sintetizado-con-web-audio-api)
- [Persistencia en localStorage](#persistencia-en-localstorage)
- [Accesibilidad](#accesibilidad)
- [Estructura del proyecto](#estructura-del-proyecto)
- [Desarrollo local](#desarrollo-local)
- [Despliegue con GitHub Pages](#despliegue-con-github-pages)
- [Privacidad y limitaciones](#privacidad-y-limitaciones)

---

## Características

- **Cuatro herramientas de tiempo en una sola página**, organizadas con
  pestañas ARIA (`role="tablist"`) que persisten entre sesiones.
- **Cero dependencias:** sin framework, sin bundler, sin CDN. Todo el
  comportamiento vive en `app.js` (~1 200 líneas comentadas y seccionadas).
- **Sonido 100 % sintetizado:** los tres tonos de alarma se generan con
  osciladores de la Web Audio API — no hay archivos de audio extraíbles.
- **Diseño dual** con tema **oscuro/claro** (`data-theme` en `<html>`),
  escala de texto ajustable (A−/+ hasta 200 %) y layout responsive.
- **Privacidad por diseño:** alarmas y preferencias se guardan solo en tu
  navegador; el servidor no recibe ni procesa ningún dato.

## Los cuatro paneles

### 🕐 Reloj

- **Cara analógica SVG** renderizada a mano (marcas, números y agujas como
  elementos del DOM, animados por cada tick) junto a **hora digital** con
  segundos separados.
- Fecha completa en formato local y conmutador **24 h ↔ 12 h** con sufijo
  AM/PM.
- Aviso de la **próxima alarma activa** y accesos directos a preferencias.

### ⏰ Alarmas

- Formulario con **hora, etiqueta, repetición semanal** (L–D, sin días =
  suena una sola vez), **tono** y **volumen** (0–100 %).
- Lista "Programadas" con contador, activar/desactivar/eliminar por
  **delegación de eventos** y badges de cuenta atrás para posposiciones.
- **Posponer 5 minutos** desde el diálogo de aviso; todos los estados se
  calculan con marcas de tiempo (timestamps), así que nada se desfasa
  aunque el equipo se suspenda y despierte.
- **Notificaciones del navegador**, en paralelo al aviso visual y al
  sonido, disponibles mientras la pestaña siga abierta.

### ⏱ Cronómetro

- Precisión al centésimo de segundo midiendo con **`performance.now()`** —
  no acumula el error de un `setInterval`.
- Vueltas con lapso parcial y total, píldora de estado («Listo /
  En marcha / Pausado») y meta que resume la última marca.

### ⏳ Temporizador

- Carga por **presets** (1, 5, 10, 25 y 45 min) o por campos minutos +
  segundos (hasta 599:59).
- **Barra de progreso** accesible (`role="progressbar"` con
  `aria-valuenow` en vivo) y píldora de estado.
- Al terminar suena el tono seleccionado y aparece el mismo diálogo de
  aviso con **Detener / Posponer 5 min**.

## Atajos de teclado

| Tecla       | Acción                                        |
| ----------- | --------------------------------------------- |
| `1` – `4`   | Ir a Reloj / Alarmas / Cronómetro / Temporizador |
| `T`         | Conmutar tema oscuro/claro                     |
| `+` / `−`   | Aumentar / reducir tamaño del texto            |
| `0`         | Restablecer la escala de texto al 100 %        |
| `Esc`       | Detener la alarma/temporizador que está sonando |

- Los atajos se ignoran mientras se escribe en un campo de texto y cuando
  hay un `<dialog>` abierto (para que `Esc` cierre el diálogo primero).

## Sonido sintetizado con Web Audio API

Un único contexto de audio con nodo `GainNode` maestro controla el volumen
global. Cada tono es una pequeña partitura de `beep(freq, offset, dur,
tipo, gain)`:

| Tono      | Textura                                        |
| --------- | ---------------------------------------------- |
| Clásico   | Doble “bip” de seno a 880 Hz.                   |
| Digital   | Cuatro beeps cortos de onda cuadrada a 1180 Hz, estilo reloj digital. |
| Suave     | Acorde de tres senos (523/784/1047 Hz) que se funden con decaimiento. |

El patrón se repite en bucle hasta que detienes el aviso, lo que da la
sensación de alarma continua sin archivos de audio.

## Persistencia en localStorage

| Clave              | Contenido                                                            |
| ------------------ | -------------------------------------------------------------------- |
| `reloj.alarmas.v1` | Array de alarmas (hora, nombre, días, tono, volumen, snooze…).        |
| `reloj.prefs.v1`   | Tema, formato 24/12, volumen, escala de texto y pestaña activa.       |

Ambas se escriben con *try/catch*, así que la app sigue funcionando (por
ejemplo en modo incógnito) si el almacenamiento no está disponible.

## Accesibilidad

- role="tablist"/"tab"/"tabpanel" con navegación por teclado entre
  pestañas.
- `<dialog>` nativo para el aviso, con el foco atrapado y devuelto al
  cerrar.
- `aria-live` en los toasts, etiquetas `<label>` reales en todo el
  formulario y `prefers-reduced-motion` desactivando las animaciones
  decorativas.

## Estructura del proyecto

```
├── index.html               # estructura, pestañas ARIA, dialog de alarma, footer
├── styles.css               # tema completo (oscuro/claro vía data-theme)
├── app.js                   # toda la lógica, seccionada y comentada
└── .github/workflows/
    └── static.yml           # deploy automático → GitHub Pages
```

Sin build: lo que ves en el repo es exactamente lo que se despliega.

## Desarrollo local

```bash
git clone https://github.com/carlos1290/RELOJ_JS.git
cd RELOJ_JS
npx serve .            # o cualquier servidor estático
```

O simplemente abre `index.html` con doble clic — no hay pasos de
instalación ni nada que compilar.

## Despliegue con GitHub Pages

`.github/workflows/static.yml` se ejecuta en **cada push a `main`** (y
manualmente vía `workflow_dispatch`): sube el repositorio tal cual como
artefacto de Pages y lo publica con `actions/deploy-pages@v4`. No hay fase
de build; la única configuración es tener Pages servido «from GitHub
Actions».

## Privacidad y limitaciones

- **Tus datos no salen del navegador.** Alarmas y preferencias viven solo
  en `localStorage`; no hay analytics, ni peticiones, ni cuentas.
- El aviso sonoro requiere **la pestaña abierta** (no hay service worker
  ni push). Las notificaciones del navegador ayudan si usáis otra
  ventana, pero no si cerráis la pestaña por completo.
- La hora se lee del reloj del sistema; no se consulta ningún servidor de
  tiempo.

---

© 2026 Carlos Gonzalez — Montevideo, Uruguay.
Parte de mi [portafolio web](https://github.com/carlos1290/portafolio).
