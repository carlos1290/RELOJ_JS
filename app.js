/* ============================================================
   Reloj.js — reloj digital/analógico, alarmas, cronómetro y
   temporizador. Sin dependencias externas.
   Sonido sintetizado con Web Audio API y datos en localStorage.
   ============================================================ */
'use strict';

/* ---------- Utilidades ---------- */
const $  = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));
const pad = (n) => String(n).padStart(2, '0');
const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

const uid = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : 'id-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

const STORAGE = { alarmas: 'reloj.alarmas.v1', prefs: 'reloj.prefs.v1' };

function loadJSON(clave, porDefecto) {
  try {
    const crudo = localStorage.getItem(clave);
    return crudo ? JSON.parse(crudo) : porDefecto;
  } catch {
    return porDefecto;
  }
}

function saveJSON(clave, valor) {
  try {
    localStorage.setItem(clave, JSON.stringify(valor));
  } catch {
    /* almacenamiento no disponible (p. ej. modo privado) */
  }
}

/* ============================================================
   Preferencias
   ============================================================ */
const prefs = Object.assign(
  { tema: 'dark', formato12: false, volumen: 0.7, escala: 1, pestaña: 'reloj' },
  loadJSON(STORAGE.prefs, {})
);

const guardarPrefs = () => saveJSON(STORAGE.prefs, prefs);

/* ============================================================
   Melodías con Web Audio API (sin archivos externos)
   ============================================================ */
const sonido = (() => {
  let ctx = null;
  let master = null;
  let intervalo = null;

  function asegurar() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = prefs.volumen;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  }

  function beep(freq, inicio, duracion, tipo = 'sine', gain = 0.25) {
    const c = asegurar();
    if (!c) return;
    const osc = c.createOscillator();
    const env = c.createGain();
    const t = c.currentTime + inicio;
    osc.type = tipo;
    osc.frequency.setValueAtTime(freq, t);
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(gain, t + 0.015);
    env.gain.exponentialRampToValueAtTime(0.0001, t + duracion);
    osc.connect(env);
    env.connect(master);
    osc.start(t);
    osc.stop(t + duracion + 0.03);
  }

  const patrones = {
    clasico: () => {
      beep(880, 0, 0.16, 'sine', 0.3);
      beep(880, 0.24, 0.16, 'sine', 0.3);
    },
    digital: () => {
      [0, 0.15, 0.3, 0.45].forEach((t) => beep(1180, t, 0.09, 'square', 0.16));
    },
    suave: () => {
      beep(523.25, 0, 1.5, 'sine', 0.22);
      beep(783.99, 0.1, 1.4, 'sine', 0.14);
      beep(1046.5, 0.2, 1.3, 'sine', 0.09);
    },
  };

  const periodos = { clasico: 1200, digital: 900, suave: 2000 };

  function start(tono = 'clasico') {
    stop();
    if (!asegurar()) return;
    const nombre = patrones[tono] ? tono : 'clasico';
    patrones[nombre]();
    intervalo = setInterval(patrones[nombre], periodos[nombre]);
  }

  function stop() {
    if (intervalo) clearInterval(intervalo);
    intervalo = null;
  }

  function probar(tono) {
    asegurar();
    (patrones[tono] || patrones.clasico)();
  }

  function setVolumen(v) {
    if (master) master.gain.value = v;
  }

  return { start, stop, probar, setVolumen, asegurar };
})();

/* ============================================================
   Alarmas: estado y persistencia
   ============================================================ */
function normalizarAlarma(a) {
  if (!a || typeof a !== 'object') return null;
  if (typeof a.hora !== 'string' || !/^\d{1,2}:\d{2}$/.test(a.hora)) return null;
  const [h, m] = a.hora.split(':').map(Number);
  if (h > 23 || m > 59) return null;
  const dias = Array.isArray(a.dias)
    ? [...new Set(a.dias.filter((d) => [0, 1, 2, 3, 4, 5, 6].includes(d)))]
    : [];
  return {
    id: typeof a.id === 'string' && a.id ? a.id : uid(),
    hora: `${pad(h)}:${pad(m)}`,
    nombre: typeof a.nombre === 'string' ? a.nombre.slice(0, 40) : '',
    dias,
    tono: ['clasico', 'digital', 'suave'].includes(a.tono) ? a.tono : 'clasico',
    activa: a.activa !== false,
    snoozeHasta: typeof a.snoozeHasta === 'number' ? a.snoozeHasta : null,
    disparadaEn: typeof a.disparadaEn === 'string' ? a.disparadaEn : null,
  };
}

let alarmas = loadJSON(STORAGE.alarmas, []).map(normalizarAlarma).filter(Boolean);
const guardarAlarmas = () => saveJSON(STORAGE.alarmas, alarmas);

const NOMBRES_DIA = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const ORDEN_MOSTRAR = [1, 2, 3, 4, 5, 6, 0];

function etiquetaDias(dias) {
  if (!dias.length) return 'Una sola vez';
  const set = new Set(dias);
  if (set.size === 7) return 'Todos los días';
  const laborales = [1, 2, 3, 4, 5].every((d) => set.has(d)) && set.size === 5;
  if (laborales) return 'Entre semana';
  if (set.size === 2 && set.has(0) && set.has(6)) return 'Fines de semana';
  return ORDEN_MOSTRAR.filter((d) => set.has(d)).map((d) => NOMBRES_DIA[d]).join(' · ');
}

function mostrarHora(hora) {
  const [h, m] = hora.split(':').map(Number);
  if (!prefs.formato12) return { texto: `${pad(h)}:${pad(m)}`, sufijo: '' };
  return { texto: `${pad(h % 12 || 12)}:${pad(m)}`, sufijo: h < 12 ? 'AM' : 'PM' };
}

function proximaOcurrencia(alarma, desde = new Date()) {
  if (!alarma.activa) return null;
  if (alarma.snoozeHasta) {
    const sn = new Date(alarma.snoozeHasta);
    return sn > desde ? sn : null;
  }
  const [h, m] = alarma.hora.split(':').map(Number);
  for (let i = 0; i < 8; i++) {
    const d = new Date(desde);
    d.setDate(d.getDate() + i);
    d.setHours(h, m, 0, 0);
    if (d <= desde) continue;
    if (!alarma.dias.length || alarma.dias.includes(d.getDay())) return d;
  }
  return null;
}

/* ============================================================
   Aviso a pantalla completa (dialog) con cola
   ============================================================ */
const modal = $('#alerta');
const btnDetener = $('#alerta-detener');
const btnPosponer = $('#alerta-posponer');

const colaAvisos = [];
let avisoActivo = null;

function encolarAviso(aviso) {
  colaAvisos.push(aviso);
  if (!avisoActivo) mostrarAviso();
}

function mostrarAviso() {
  avisoActivo = colaAvisos.shift() || null;
  if (!avisoActivo) return;
  $('#alerta-titulo').textContent = avisoActivo.titulo;
  $('#alerta-subtitulo').textContent = avisoActivo.subtitulo;
  btnPosponer.hidden = !avisoActivo.onPosponer;
  sonido.start(avisoActivo.tono);
  notificar(avisoActivo.titulo, avisoActivo.subtitulo);
  if (typeof modal.showModal === 'function') {
    if (!modal.open) modal.showModal();
  } else {
    modal.setAttribute('open', '');
  }
}

function cerrarAviso(accion) {
  const aviso = avisoActivo;
  if (!aviso) return;
  sonido.stop();
  try {
    if (modal.open && typeof modal.close === 'function') modal.close();
    else modal.removeAttribute('open');
  } catch {
    /* ignore */
  }
  avisoActivo = null;
  if (accion === 'posponer' && aviso.onPosponer) aviso.onPosponer();
  else if (aviso.onDetener) aviso.onDetener();
  if (colaAvisos.length) setTimeout(mostrarAviso, 400);
}

btnDetener.addEventListener('click', () => cerrarAviso('detener'));
btnPosponer.addEventListener('click', () => cerrarAviso('posponer'));
modal.addEventListener('cancel', (e) => {
  e.preventDefault();
  cerrarAviso('detener');
});

/* ---------- Notificaciones del navegador ---------- */
function notificar(titulo, cuerpo) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  try {
    new Notification(titulo, {
      body: cuerpo,
      tag: 'reloj-js-aviso',
      renotify: true,
    });
  } catch {
    /* algunos navegadores lo restringen en file:// */
  }
}

async function actualizarBotonNotificaciones() {
  const btn = $('#btn-notificaciones');
  if (!('Notification' in window) || Notification.permission !== 'default') {
    btn.hidden = true;
    return;
  }
  btn.hidden = false;
}

$('#btn-notificaciones').addEventListener('click', async () => {
  try {
    const res = await Notification.requestPermission();
    await actualizarBotonNotificaciones();
    mostrarToast(res === 'granted' ? 'Notificaciones activadas ✓' : 'Permiso de notificaciones denegado');
  } catch {
    mostrarToast('Tu navegador no permite notificaciones aquí');
  }
});

/* ---------- Detección y disparo de alarmas ---------- */
let ultimaActividad = Date.now();

function claveMinuto(d) {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function dispararAlarma(alarma) {
  const hora = mostrarHora(alarma.hora);
  encolarAviso({
    titulo: alarma.nombre || 'Alarma',
    subtitulo: `Sonando · ${hora.texto}${hora.sufijo}`,
    tono: alarma.tono,
    onPosponer: () => {
      const t = new Date();
      t.setSeconds(0, 0);
      t.setMinutes(t.getMinutes() + 5);
      alarma.snoozeHasta = t.getTime();
      guardarAlarmas();
      renderAlarmas();
      actualizarProxima();
      mostrarToast(`Alarma pospuesta hasta las ${formatoHoraDeReloj(t)}`);
    },
    onDetener: () => {
      alarma.snoozeHasta = null;
      // Las alarmas de una sola vez se desactivan al detenerlas.
      if (!alarma.dias.length) alarma.activa = false;
      guardarAlarmas();
      renderAlarmas();
      actualizarProxima();
    },
  });
}

function comprobarAlarmas(ahora) {
  const horaActual = `${pad(ahora.getHours())}:${pad(ahora.getMinutes())}`;
  const clave = claveMinuto(ahora);

  for (const alarma of alarmas) {
    if (!alarma.activa) continue;

    // Pospuesta vencida
    if (alarma.snoozeHasta && ahora.getTime() >= alarma.snoozeHasta) {
      if (alarma.disparadaEn === clave) continue;
      alarma.snoozeHasta = null;
      alarma.disparadaEn = clave;
      guardarAlarmas();
      dispararAlarma(alarma);
      continue;
    }

    // Minuto programado
    if (alarma.hora !== horaActual) continue;
    if (alarma.dias.length && !alarma.dias.includes(ahora.getDay())) continue;
    if (alarma.disparadaEn === clave) continue;
    alarma.disparadaEn = clave;
    guardarAlarmas();
    dispararAlarma(alarma);
  }
}

function recuperarAlarmas(hasta) {
  const gap = Date.now() - ultimaActividad;
  if (gap < 90_000) return;
  const desde = new Date(ultimaActividad);
  desde.setSeconds(0, 0);
  desde.setMinutes(desde.getMinutes() + 1);
  for (let t = desde.getTime(); t <= hasta.getTime(); t += 60_000) {
    comprobarAlarmas(new Date(t));
  }
  mostrarToast('Revisando alarmas que pudieron perderse…');
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    recuperarAlarmas(new Date());
    sonido.asegurar();
  }
  ultimaActividad = Date.now();
});
window.addEventListener('focus', () => {
  ultimaActividad = Date.now();
});

/* ============================================================
   Render del reloj
   ============================================================ */
const relojHM = $('#reloj-hm');
const relojS = $('#reloj-s');
const relojSufijo = $('#reloj-sufijo');
const fechaEl = $('#fecha');
const manoHora = $('#mano-hora');
const manoMinuto = $('#mano-minuto');
const manoSegundo = $('#mano-segundo');
const proximaEl = $('#proxima-alarma');

const fmtFecha = new Intl.DateTimeFormat('es-ES', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

const menosMovimiento = window.matchMedia('(prefers-reduced-motion: reduce)');

function renderReloj(d) {
  const h = d.getHours();
  let principal;
  if (prefs.formato12) {
    principal = `${h % 12 || 12}:${pad(d.getMinutes())}`;
    const sufijo = h < 12 ? 'AM' : 'PM';
    relojSufijo.textContent = sufijo;
    relojSufijo.hidden = false;
  } else {
    principal = `${pad(h)}:${pad(d.getMinutes())}`;
    relojSufijo.hidden = true;
  }
  const segundos = `:${pad(d.getSeconds())}`;
  if (relojHM.textContent !== principal) relojHM.textContent = principal;
  if (relojS.textContent !== segundos) relojS.textContent = segundos;

  const fechaStr = fmtFecha.format(d);
  if (fechaEl.textContent !== fechaStr) {
    fechaEl.textContent = fechaStr;
    document.title = `${principal} · Reloj.js`;
  }

  // Manecillas (segundo suave, salvo "reducir movimiento")
  let s = d.getSeconds() + d.getMilliseconds() / 1000;
  if (menosMovimiento.matches) s = Math.floor(s);
  const m = d.getMinutes() + s / 60;
  const hh = (h % 12) + m / 60;
  manoSegundo.style.transform = `rotate(${s * 6}deg)`;
  manoMinuto.style.transform = `rotate(${m * 6}deg)`;
  manoHora.style.transform = `rotate(${hh * 30}deg)`;
}

function construirAnalogico() {
  const NS = 'http://www.w3.org/2000/svg';
  const gMarcas = $('#marcas');
  for (let i = 0; i < 60; i++) {
    const principal = i % 5 === 0;
    const rad = (i * 6 * Math.PI) / 180;
    const r1 = principal ? 84 : 89;
    const linea = document.createElementNS(NS, 'line');
    linea.setAttribute('x1', (100 + Math.sin(rad) * r1).toFixed(2));
    linea.setAttribute('y1', (100 - Math.cos(rad) * r1).toFixed(2));
    linea.setAttribute('x2', (100 + Math.sin(rad) * 94).toFixed(2));
    linea.setAttribute('y2', (100 - Math.cos(rad) * 94).toFixed(2));
    linea.setAttribute('class', 'marca' + (principal ? ' principal' : ''));
    gMarcas.appendChild(linea);
  }
  const gNumeros = $('#numeros');
  for (let n = 1; n <= 12; n++) {
    const rad = (n * 30 * Math.PI) / 180;
    const texto = document.createElementNS(NS, 'text');
    texto.setAttribute('x', (100 + Math.sin(rad) * 69).toFixed(2));
    texto.setAttribute('y', (100 - Math.cos(rad) * 69).toFixed(2));
    texto.setAttribute('class', 'numero');
    texto.textContent = n;
    gNumeros.appendChild(texto);
  }
}

/* ---------- Próxima alarma ---------- */
function humanizar(ms) {
  const min = Math.round(ms / 60_000);
  if (min < 1) return 'menos de 1 min';
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

function actualizarProxima() {
  const ahora = new Date();
  let mejorFecha = null;
  let mejorAlarma = null;
  for (const alarma of alarmas) {
    const occ = proximaOcurrencia(alarma, ahora);
    if (occ && (!mejorFecha || occ < mejorFecha)) {
      mejorFecha = occ;
      mejorAlarma = alarma;
    }
  }
  if (!mejorAlarma) {
    if (proximaEl.textContent !== 'Sin alarmas activas') proximaEl.textContent = 'Sin alarmas activas';
    return;
  }
  const hora = mostrarHora(mejorAlarma.hora);
  const falta = mejorFecha.getTime() - ahora.getTime();
  const etiqueta = mejorAlarma.snoozeHasta ? 'Pospuesta' : 'Próxima';
  const cuenta = mejorAlarma.snoozeHasta ? `en ${fmtCuenta(falta)}` : falta < 90_000 ? 'ahora' : `en ${humanizar(falta)}`;
  const texto = `${etiqueta}: ${hora.texto}${hora.sufijo ? ' ' + hora.sufijo : ''} · ${cuenta}`;
  if (proximaEl.textContent !== texto) proximaEl.textContent = texto;
}

/* Cuenta atrás corta mm:ss para posposiciones */
function fmtCuenta(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${pad(s % 60)}`;
}

/* Refresca badges de posposición en la lista (por segundo) */
function actualizarPosposiciones() {
  const ahora = Date.now();
  $$('.pospuesta-tag').forEach((tag) => {
    const alarma = alarmas.find((a) => a.id === tag.dataset.alarma);
    if (!alarma || !alarma.snoozeHasta) return;
    const falta = alarma.snoozeHasta - ahora;
    const hora = mostrarHora(alarma.hora);
    tag.innerHTML = `Pospuesta · ${hora.texto}${hora.sufijo ? ' ' + hora.sufijo : ''} · <strong>en ${fmtCuenta(falta)}</strong>`;
  });
}

/* ============================================================
   Render de la lista de alarmas
   ============================================================ */
const listaAlarmas = $('#lista-alarmas');
const vacioEl = $('#alarmas-vacio');
const contadorEl = $('#contador-alarmas');

const ICONO_EDITAR =
  '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>';
const ICONO_BORRAR =
  '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>';

function renderAlarmas() {
  const ordenadas = alarmas.slice().sort((a, b) => a.hora.localeCompare(b.hora));
  contadorEl.textContent = String(ordenadas.length);
  vacioEl.hidden = ordenadas.length > 0;
  listaAlarmas.innerHTML = '';

  for (const alarma of ordenadas) {
    const hora = mostrarHora(alarma.hora);
    const pospuesta = alarma.activa && alarma.snoozeHasta;
    let badgeHTML = '';
    if (pospuesta) {
      const falta = alarma.snoozeHasta - Date.now();
      badgeHTML = `<span class="pospuesta-tag" data-alarma="${alarma.id}">Pospuesta · ${hora.texto}${hora.sufijo ? ' ' + hora.sufijo : ''} · <strong>en ${fmtCuenta(falta)}</strong></span>`;
    }
    const li = document.createElement('li');
    li.className = 'alarma' + (alarma.activa ? '' : ' is-off') + (pospuesta ? ' pospuesta' : '');
    li.dataset.id = alarma.id;

    li.innerHTML = `
      <label class="switch" title="${alarma.activa ? 'Desactivar' : 'Activar'} alarma">
        <input type="checkbox" class="alarma-activar" ${alarma.activa ? 'checked' : ''} aria-label="Activar o desactivar esta alarma">
        <span class="switch-pista"><span class="switch-bola"></span></span>
      </label>
      <div class="alarma-info">
        <span class="alarma-hora">${hora.texto}${hora.sufijo ? `<span class="alarma-sufijo"> ${hora.sufijo}</span>` : ''}</span>
        <span class="alarma-nombre">${alarma.nombre ? escapeHTML(alarma.nombre) : '<em>Sin etiqueta</em>'}</span>
        <span class="alarma-dias">${etiquetaDias(alarma.dias)}</span>
        ${badgeHTML}
      </div>
      <div class="alarma-acciones">
        <button class="icon-btn" data-accion="editar" aria-label="Editar alarma" title="Editar">${ICONO_EDITAR}</button>
        <button class="icon-btn" data-accion="borrar" aria-label="Borrar alarma" title="Borrar">${ICONO_BORRAR}</button>
      </div>`;
    listaAlarmas.appendChild(li);
  }
}

function escapeHTML(texto) {
  return texto
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

/* Acciones de la lista (delegación) */
listaAlarmas.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-accion]');
  if (!btn) return;
  const li = btn.closest('.alarma');
  const alarma = alarmas.find((a) => a.id === li?.dataset.id);
  if (!alarma) return;

  if (btn.dataset.accion === 'borrar') {
    alarmas = alarmas.filter((a) => a.id !== alarma.id);
    guardarAlarmas();
    renderAlarmas();
    actualizarProxima();
    mostrarToast('Alarma borrada');
  } else if (btn.dataset.accion === 'editar') {
    editarAlarma(alarma);
  }
});

listaAlarmas.addEventListener('change', (e) => {
  const input = e.target.closest('.alarma-activar');
  if (!input) return;
  const li = input.closest('.alarma');
  const alarma = alarmas.find((a) => a.id === li?.dataset.id);
  if (!alarma) return;
  alarma.activa = input.checked;
  if (!alarma.activa) alarma.snoozeHasta = null;
  guardarAlarmas();
  li.classList.toggle('is-off', !alarma.activa);
  actualizarProxima();
});

/* ---------- Formulario de alarmas ---------- */
const formAlarma = $('#form-alarma');
const inputHora = $('#alarma-hora');
const inputNombre = $('#alarma-nombre');
const selectTono = $('#alarma-sonido');
const btnGuardar = $('#btn-guardar');
const btnCancelar = $('#btn-cancelar');
const formTitulo = $('#form-titulo');

let editandoId = null;

formAlarma.addEventListener('submit', (e) => {
  e.preventDefault();
  const hora = inputHora.value;
  if (!hora) {
    mostrarToast('Elige una hora para la alarma');
    inputHora.focus();
    return;
  }
  const datos = {
    hora,
    nombre: inputNombre.value.trim(),
    tono: selectTono.value,
    dias: $$('.dia input:checked', formAlarma).map((i) => Number(i.value)),
  };

  if (editandoId) {
    const alarma = alarmas.find((a) => a.id === editandoId);
    if (alarma) {
      Object.assign(alarma, datos, { disparadaEn: null, snoozeHasta: null });
      mostrarToast('Alarma actualizada');
    }
  } else {
    alarmas.push({ id: uid(), ...datos, activa: true, snoozeHasta: null, disparadaEn: null });
    mostrarToast('Alarma añadida ✓');
    if ('Notification' in window && Notification.permission === 'default') actualizarBotonNotificaciones();
  }
  guardarAlarmas();
  salirEdicion();
  renderAlarmas();
  actualizarProxima();
});

function editarAlarma(alarma) {
  editandoId = alarma.id;
  formTitulo.textContent = 'Editar alarma';
  btnGuardar.textContent = 'Guardar cambios';
  btnCancelar.hidden = false;
  inputHora.value = alarma.hora;
  inputNombre.value = alarma.nombre;
  selectTono.value = alarma.tono;
  $$('.dia input', formAlarma).forEach((i) => (i.checked = alarma.dias.includes(Number(i.value))));
  formAlarma.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  inputHora.focus();
}

function salirEdicion() {
  editandoId = null;
  formTitulo.textContent = 'Nueva alarma';
  btnGuardar.textContent = 'Añadir alarma';
  btnCancelar.hidden = true;
  formAlarma.reset();
  inputHora.value = '07:00';
}

btnCancelar.addEventListener('click', salirEdicion);

$('#btn-probar').addEventListener('click', () => {
  sonido.probar(selectTono.value);
  mostrarToast('Tono de prueba (1 ciclo)');
});

const inputVolumen = $('#volumen');
const salidaVolumen = $('#volumen-out');

inputVolumen.addEventListener('input', () => {
  const v = Number(inputVolumen.value);
  prefs.volumen = v;
  sonido.setVolumen(v);
  salidaVolumen.textContent = `${Math.round(v * 100)}%`;
});
inputVolumen.addEventListener('change', guardarPrefs);

/* ============================================================
   Tema y formato de hora
   ============================================================ */
const btnTema = $('#btn-tema');

function aplicarTema() {
  const oscuro = prefs.tema !== 'light';
  document.documentElement.dataset.theme = oscuro ? 'dark' : 'light';
  $("meta[name='theme-color']").content = oscuro ? '#080b11' : '#edf0f7';
  sincronizarTema();
}

function setTema(tema) {
  if (prefs.tema === tema) return;
  prefs.tema = tema;
  guardarPrefs();
  aplicarTema();
}

btnTema.addEventListener('click', () => setTema(prefs.tema === 'dark' ? 'light' : 'dark'));

const btnOscuroFooter = $('#tema-oscuro');
const btnClaroFooter = $('#tema-claro');

function sincronizarTema() {
  const oscuro = prefs.tema !== 'light';
  if (btnOscuroFooter && btnClaroFooter) {
    btnOscuroFooter.classList.toggle('is-active', oscuro);
    btnClaroFooter.classList.toggle('is-active', !oscuro);
  }
}

btnOscuroFooter.addEventListener('click', () => setTema('dark'));
btnClaroFooter.addEventListener('click', () => setTema('light'));

/* ---------- Formato de hora 24 h / 12 h ---------- */
const btnFormato = $('#btn-formato');

function formatoHoraDeReloj(d) {
  const h = d.getHours();
  if (!prefs.formato12) return `${pad(h)}:${pad(d.getMinutes())}`;
  return `${h % 12 || 12}:${pad(d.getMinutes())} ${h < 12 ? 'AM' : 'PM'}`;
}

function setFormato(valor12) {
  prefs.formato12 = valor12;
  guardarPrefs();
  sincronizarFormato();
  renderReloj(new Date());
  renderAlarmas();
  actualizarProxima();
}

function alternarFormato() {
  setFormato(!prefs.formato12);
}

function sincronizarFormato() {
  btnFormato.textContent = `Formato: ${prefs.formato12 ? '12 h · AM/PM' : '24 h'}`;
  const f24 = $('#formato-24');
  const f12 = $('#formato-12');
  if (f24 && f12) {
    f24.classList.toggle('is-active', !prefs.formato12);
    f12.classList.toggle('is-active', prefs.formato12);
  }
}

btnFormato.addEventListener('click', alternarFormato);
$('#formato-24').addEventListener('click', () => setFormato(false));
$('#formato-12').addEventListener('click', () => setFormato(true));

/* ============================================================
   Pestañas
   ============================================================ */
const tabsEl = $$('.tab');

function activarTab(tab, guardar = true) {
  tabsEl.forEach((t) => {
    const activo = t === tab;
    t.classList.toggle('is-active', activo);
    t.setAttribute('aria-selected', String(activo));
    t.tabIndex = activo ? 0 : -1;
  });
  tabsEl.forEach((t) => {
    const panel = $(`#panel-${t.dataset.tab}`);
    if (panel) panel.hidden = t !== tab;
  });
  $$('.enlace-tab').forEach((b) => b.classList.toggle('is-active', b.dataset.tab === tab.dataset.tab));
  if (guardar) {
    prefs.pestaña = tab.dataset.tab;
    guardarPrefs();
  }
}

tabsEl.forEach((tab) => {
  tab.addEventListener('click', () => activarTab(tab));
  tab.addEventListener('keydown', (e) => {
    const i = tabsEl.indexOf(tab);
    let destino = null;
    if (e.key === 'ArrowRight') destino = tabsEl[(i + 1) % tabsEl.length];
    else if (e.key === 'ArrowLeft') destino = tabsEl[(i - 1 + tabsEl.length) % tabsEl.length];
    else if (e.key === 'Home') destino = tabsEl[0];
    else if (e.key === 'End') destino = tabsEl[tabsEl.length - 1];
    if (destino) {
      e.preventDefault();
      activarTab(destino);
      destino.focus();
    }
  });
});

/* Pestañas del footer */
$$('.enlace-tab').forEach((btn) => {
  btn.addEventListener('click', () => {
    const destino = tabsEl.find((t) => t.dataset.tab === btn.dataset.tab);
    if (destino) activarTab(destino);
  });
});

/* ============================================================
   Cronómetro
   ============================================================ */
const crono = {
  corriendo: false,
  inicioTs: 0,
  acumulado: 0,
  vueltas: [],
  raf: 0,
  actual() {
    return this.acumulado + (this.corriendo ? performance.now() - this.inicioTs : 0);
  },
};

const cronoDisplay = $('#crono-display');
const btnCronoIniciar = $('#crono-iniciar');
const btnCronoVuelta = $('#crono-vuelta');
const btnCronoReiniciar = $('#crono-reiniciar');
const cronoVueltas = $('#crono-vueltas');

function fmtCrono(ms) {
  const cs = Math.floor(ms / 10) % 100;
  const s = Math.floor(ms / 1000) % 60;
  const m = Math.floor(ms / 60_000) % 60;
  const h = Math.floor(ms / 3_600_000);
  const base = `${pad(m)}:${pad(s)}.${pad(cs)}`;
  return h > 0 ? `${pad(h)}:${base}` : base;
}

function cicloCrono() {
  if (!crono.corriendo) return;
  cronoDisplay.textContent = fmtCrono(crono.actual());
  crono.raf = requestAnimationFrame(cicloCrono);
}

function actualizarBotonesCrono() {
  const hayTiempo = crono.actual() > 0;
  btnCronoIniciar.textContent = crono.corriendo ? 'Pausar' : hayTiempo ? 'Reanudar' : 'Iniciar';
  btnCronoVuelta.disabled = !crono.corriendo;
  btnCronoReiniciar.disabled = !crono.corriendo && !hayTiempo;
  renderEstadoCrono();
}

/* Píldora de estado + meta del cronómetro */
function renderEstadoCrono() {
  const pill = $('#crono-estado');
  const meta = $('#crono-meta');
  if (!pill) return;
  let clase, texto;
  if (crono.corriendo) { clase = 'marcha'; texto = 'En marcha'; }
  else if (crono.actual() > 0) { clase = 'pausa'; texto = 'En pausa'; }
  else { clase = 'listo'; texto = 'Listo'; }
  pill.className = `estado-pill ${clase}`;
  pill.textContent = texto;
  if (meta) {
    const n = crono.vueltas.length;
    meta.textContent = clase === 'listo' ? '' : n ? `${n} ${n === 1 ? 'vuelta' : 'vueltas'}` : 'Sin vueltas';
  }
  $('#crono-display').classList.toggle('pausado', clase === 'pausa');
}

btnCronoIniciar.addEventListener('click', () => {
  if (crono.corriendo) {
    crono.acumulado = crono.actual();
    crono.corriendo = false;
    cancelAnimationFrame(crono.raf);
  } else {
    crono.corriendo = true;
    crono.inicioTs = performance.now();
    cicloCrono();
  }
  actualizarBotonesCrono();
});

btnCronoVuelta.addEventListener('click', () => {
  if (!crono.corriendo) return;
  const total = crono.actual();
  const previo = crono.vueltas.length ? crono.vueltas[crono.vueltas.length - 1].total : 0;
  crono.vueltas.push({ total, parcial: total - previo });
  renderEstadoCrono();
  cronoVueltas.innerHTML = crono.vueltas
    .map(
      (v, i) => `<li>
        <span class="vuelta-nombre">Vuelta ${i + 1}</span>
        <span class="vuelta-tiempo">${fmtCrono(v.parcial)}</span>
        <span class="vuelta-total">${fmtCrono(v.total)}</span>
      </li>`
    )
    .reverse()
    .join('');
});

btnCronoReiniciar.addEventListener('click', () => {
  crono.corriendo = false;
  crono.acumulado = 0;
  crono.vueltas = [];
  cancelAnimationFrame(crono.raf);
  cronoDisplay.textContent = fmtCrono(0);
  cronoVueltas.innerHTML = '';
  actualizarBotonesCrono();
});

/* ============================================================
   Temporizador
   ============================================================ */
const timer = {
  total: 25 * 60_000,
  restante: 25 * 60_000,
  corriendo: false,
  finTs: 0,
  intervalo: 0,
};

const timerDisplay = $('#timer-display');
const timerProgreso = $('#timer-progreso');
const barraProgreso = $('.barra-progreso');
const btnTimerIniciar = $('#timer-iniciar');
const btnTimerReiniciar = $('#timer-reiniciar');
const timerMin = $('#timer-min');
const timerSeg = $('#timer-seg');
const timerForm = $('#timer-form');

function fmtTimer(ms) {
  const s = Math.ceil(Math.max(0, ms) / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const seg = s % 60;
  const base = `${pad(m)}:${pad(seg)}`;
  return h > 0 ? `${pad(h)}:${base}` : base;
}

function renderTimer() {
  const ms = timer.restante;
  timerDisplay.textContent = fmtTimer(ms);
  const pct = timer.total > 0 ? clamp((ms / timer.total) * 100, 0, 100) : 0;
  timerProgreso.style.width = `${pct}%`;
  barraProgreso.setAttribute('aria-valuenow', String(Math.round(pct)));
}

function renderBotonesTimer() {
  const armed = timer.corriendo || timer.restante !== timer.total;
  btnTimerIniciar.textContent = timer.corriendo ? 'Pausar' : timer.restante !== timer.total && timer.restante > 0 ? 'Reanudar' : 'Iniciar';
  btnTimerReiniciar.disabled = !armed;
  btnTimerIniciar.disabled = timer.restante <= 0 && !timer.corriendo;
  renderEstadoTimer();
}

/* Píldora de estado + meta del temporizador */
function fmtDuracion(ms) {
  const min = Math.max(1, Math.round(ms / 60_000));
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h + (m ? ` h ${m} min` : ' h');
}

function renderEstadoTimer() {
  const pill = $('#timer-estado');
  const meta = $('#timer-meta');
  if (!pill) return;
  let clase, texto;
  if (timer.corriendo) { clase = 'marcha'; texto = 'En marcha'; }
  else if (timer.restante === 0) { clase = 'terminado'; texto = 'Terminado'; }
  else if (timer.restante !== timer.total) { clase = 'pausa'; texto = 'En pausa'; }
  else { clase = 'listo'; texto = 'Listo'; }
  pill.className = `estado-pill ${clase}`;
  pill.textContent = texto;
  if (meta) {
    if (timer.corriendo) meta.textContent = `Termina a las ${formatoHoraDeReloj(new Date(timer.finTs))}`;
    else if (clase === 'pausa') meta.textContent = `Pausado en ${fmtTimer(timer.restante)}`;
    else if (clase === 'terminado') meta.textContent = `Terminó a las ${formatoHoraDeReloj(new Date(timer.finTs))}`;
    else meta.textContent = `Duración: ${fmtDuracion(timer.total)}`;
    meta.className = 'meta-estado' + (clase === 'terminado' ? ' alertado' : '');
  }
  $('#timer-display').classList.toggle('pausado', clase === 'pausa' || clase === 'terminado');
  $('.barra-progreso').classList.toggle('pausado', clase === 'pausa' || clase === 'terminado');
}

function cicloTimer() {
  timer.restante = timer.finTs - Date.now();
  if (timer.restante <= 0) {
    timer.restante = 0;
    clearInterval(timer.intervalo);
    timer.corriendo = false;
    renderTimer();
    renderBotonesTimer();
    finalizarTimer();
    return;
  }
  renderTimer();
}

function finalizarTimer() {
  sonido.stop();
  encolarAviso({
    titulo: 'Temporizador',
    subtitulo: '¡Tiempo cumplido!',
    tono: 'digital',
    onDetener: () => {},
  });
}

function detenerTimerInterno() {
  timer.corriendo = false;
  clearInterval(timer.intervalo);
}

btnTimerIniciar.addEventListener('click', () => {
  if (timer.corriendo) {
    timer.restante = Math.max(0, timer.finTs - Date.now());
    detenerTimerInterno();
  } else {
    if (timer.restante <= 0) return;
    timer.finTs = Date.now() + timer.restante;
    timer.corriendo = true;
    timer.intervalo = setInterval(cicloTimer, 250);
  }
  renderBotonesTimer();
});

btnTimerReiniciar.addEventListener('click', () => {
  detenerTimerInterno();
  timer.restante = timer.total;
  renderTimer();
  renderBotonesTimer();
});

function cargarTimer(min, seg) {
  detenerTimerInterno();
  timer.total = clamp(min, 0, 599) * 60_000 + clamp(seg, 0, 59) * 1000;
  timer.restante = timer.total;
  renderTimer();
  renderBotonesTimer();
}

timerForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const min = timerMin.value === '' ? 0 : Number(timerMin.value);
  const seg = timerSeg.value === '' ? 0 : Number(timerSeg.value);
  if (!Number.isFinite(min) || !Number.isFinite(seg) || min + seg <= 0) {
    mostrarToast('Introduce minutos o segundos');
    return;
  }
  cargarTimer(Math.abs(Math.trunc(min)), Math.abs(Math.trunc(seg)));
});

$$('.chip[data-min]').forEach((chip) => {
  chip.addEventListener('click', () => {
    const min = Number(chip.dataset.min);
    timerMin.value = String(min);
    timerSeg.value = '0';
    cargarTimer(min, 0);
  });
});

/* ============================================================
   Toast
   ============================================================ */
let toastTimer = 0;

function mostrarToast(mensaje) {
  const toast = $('#toast');
  toast.textContent = mensaje;
  toast.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('visible'), 2600);
}

/* ============================================================
   Escala tipográfica + atajos de teclado año footer
   ============================================================ */
const PASOS_ESCALA = [0.85, 0.925, 1, 1.075, 1.15, 1.25];

function indiceEscalaValido() {
  const i = PASOS_ESCALA.indexOf(prefs.escala);
  if (i !== -1) return i;
  // valor desconocido (persistencia antigua): el paso más cercano
  let mejor = 2;
  PASOS_ESCALA.forEach((p, i) => {
    if (Math.abs(p - Number(prefs.escala)) < Math.abs(PASOS_ESCALA[mejor] - Number(prefs.escala))) mejor = i;
  });
  return mejor;
}

function setEscala(indice) {
  const i = clamp(indice, 0, PASOS_ESCALA.length - 1);
  prefs.escala = PASOS_ESCALA[i];
  guardarPrefs();
  aplicarEscala();
}

function cambiarEscala(delta) {
  setEscala(indiceEscalaValido() + delta);
}

function aplicarEscala() {
  document.documentElement.style.setProperty('--escala', String(prefs.escala));
  const valor = $('#tamano-valor');
  if (valor) valor.textContent = `${Math.round(prefs.escala * 100)}%`;
  const menos = $('#btn-tamano-menos');
  const mas = $('#btn-tamano-mas');
  if (menos) menos.disabled = prefs.escala <= PASOS_ESCALA[0];
  if (mas) mas.disabled = prefs.escala >= PASOS_ESCALA[PASOS_ESCALA.length - 1];
}

$('#btn-tamano-menos').addEventListener('click', () => cambiarEscala(-1));
$('#btn-tamano-mas').addEventListener('click', () => cambiarEscala(1));
$('#btn-tamano-reset').addEventListener('click', () => setEscala(PASOS_ESCALA.indexOf(1)));

/* Atajos globales (ignora campos de texto y modales abiertos) */
document.addEventListener('keydown', (e) => {
  if (modal.open) return;
  const objetivo = e.target;
  if (objetivo instanceof HTMLElement && (objetivo.matches('input, select, textarea') || objetivo.isContentEditable)) return;
  if (e.ctrlKey || e.altKey || e.metaKey) return;

  const n = Number(e.key);
  if (n >= 1 && n <= 4 && !Number.isNaN(n)) {
    e.preventDefault();
    activarTab(tabsEl[n - 1]);
    tabsEl[n - 1].focus();
    return;
  }

  switch (e.key.toLowerCase()) {
    case 't':
      setTema(prefs.tema === 'dark' ? 'light' : 'dark');
      break;
    case '+':
    case '=':
      e.preventDefault();
      cambiarEscala(1);
      break;
    case '-':
      e.preventDefault();
      cambiarEscala(-1);
      break;
    case '0':
      setEscala(PASOS_ESCALA.indexOf(1));
      break;
    default:
      break;
  }
});

/* ============================================================
   Arranque
   ============================================================ */
function iniciar() {
  $('#footer-ano').textContent = String(new Date().getFullYear());
  aplicarEscala();
  aplicarTema();
  construirAnalogico();
  inputVolumen.value = String(prefs.volumen);
  salidaVolumen.textContent = `${Math.round(prefs.volumen * 100)}%`;
  sincronizarFormato();
  actualizarBotonesCrono();
  renderTimer();
  renderBotonesTimer();
  renderAlarmas();
  actualizarProxima();
  actualizarBotonNotificaciones();

  // Pestaña recordada
  const tabGuardada = tabsEl.find((t) => t.dataset.tab === prefs.pestaña);
  activarTab(tabGuardada || tabsEl[0], false);

  renderReloj(new Date());
  sonido.asegurar(); // desbloquea el AudioContext con la primera interacción

  setInterval(() => {
    const ahora = new Date();
    renderReloj(ahora);

    const clave = claveMinuto(ahora);
    if (clave !== iniciar._clave) {
      iniciar._clave = clave;
      ultimaActividad = Date.now();
      comprobarAlarmas(ahora);
      actualizarProxima();
    }

    // Refresco por segundo de pospciones y su cuenta atrás
    const segundo = ahora.getSeconds();
    if (segundo !== iniciar._segundo) {
      iniciar._segundo = segundo;
      if (alarmas.some((a) => a.snoozeHasta)) {
        actualizarPosposiciones();
        actualizarProxima();
      }
    }
  }, 250);
}

iniciar();
