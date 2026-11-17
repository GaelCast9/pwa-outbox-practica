const formIncidencia = document.getElementById('form-incidencia');
const inputTitulo = document.getElementById('titulo');
const inputDescripcion = document.getElementById('descripcion');
const listaOutbox = document.getElementById('lista-outbox');
const btnPurgar = document.getElementById('btn-purgar');
const badgeRed = document.getElementById('badge-red');

// Registro del Service Worker con ruta relativa para GitHub Pages
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js')
    .then((registro) => {
      console.log('[SW] Registrado correctamente con scope:', registro.scope);
    })
    .catch((error) => {
      console.error('[SW] Error al registrar el Service Worker:', error);
    });
}

function actualizarIndicadorRed() {
  if (navigator.onLine) {
    badgeRed.textContent = 'En Línea';
    badgeRed.className = 'badge online';
  } else {
    badgeRed.textContent = 'Sin Conexión (Offline)';
    badgeRed.className = 'badge offline';
  }
}

// READ: Lee todos los registros de IndexedDB y los renderiza en el DOM
function renderizarColaOutbox() {
  return obtenerTodosLosRegistros()
    .then((registros) => {
      listaOutbox.innerHTML = '';

      if (registros.length === 0) {
        const liVacio = document.createElement('li');
        liVacio.className = 'estado-vacio';
        liVacio.textContent = 'No hay reportes registrados en la bandeja local.';
        listaOutbox.appendChild(liVacio);
        return;
      }

      registros.forEach((registro) => {
        const li = document.createElement('li');
        li.className = 'item-outbox';

        const infoDiv = document.createElement('div');
        infoDiv.className = 'item-info';

        const spanTitulo = document.createElement('span');
        spanTitulo.className = 'item-titulo';
        spanTitulo.textContent = registro.titulo;

        const spanDesc = document.createElement('span');
        spanDesc.className = 'item-descripcion';
        spanDesc.textContent = registro.descripcion;

        const spanHora = document.createElement('span');
        spanHora.className = 'item-hora';
        const horaFormateada = new Date(registro.fechaCreacion).toLocaleTimeString('es-MX', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit'
        });
        spanHora.textContent = `Registrado a las ${horaFormateada}`;

        infoDiv.appendChild(spanTitulo);
        infoDiv.appendChild(spanDesc);
        infoDiv.appendChild(spanHora);

        const spanEstado = document.createElement('span');
        const esSincronizado = registro.estado === 'sincronizado';
        spanEstado.className = `estado-pill ${esSincronizado ? 'estado-sincronizado' : 'estado-pendiente'}`;
        spanEstado.textContent = registro.estado;

        li.appendChild(infoDiv);
        li.appendChild(spanEstado);
        listaOutbox.appendChild(li);
      });
    })
    .catch((error) => {
      console.error('[Outbox] Error al leer registros de IndexedDB:', error);
    });
}

// CREATE: Envía el reporte por POST y, si falla la red, lo encola como 'pendiente'
function procesarEnvioReporte(datosFormulario) {
  const endpoint = 'https://jsonplaceholder.typicode.com/posts';

  return fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(datosFormulario)
  })
    .then((respuesta) => {
      if (!respuesta.ok) throw new Error('Error HTTP del servidor');
      return respuesta.json();
    })
    .then(() => {
      return guardarRegistro({
        ...datosFormulario,
        estado: 'sincronizado',
        fechaCreacion: Date.now()
      });
    })
    .catch(() => {
      console.warn('[Outbox] Sin conexión. Encolando transacción localmente...');
      return guardarRegistro({
        ...datosFormulario,
        estado: 'pendiente',
        fechaCreacion: Date.now()
      });
    })
    .then(() => {
      return renderizarColaOutbox();
    });
}

// UPDATE: Reenvía en lote los registros 'pendiente' al recuperar conexión
function sincronizarPendientes() {
  console.log('[Outbox] Conexión detectada. Buscando registros pendientes...');

  return obtenerTodosLosRegistros()
    .then((registros) => {
      const pendientes = registros.filter((item) => item.estado === 'pendiente');

      if (pendientes.length === 0) {
        console.log('[Outbox] No hay transacciones pendientes por sincronizar.');
        return;
      }

      const promesasDeEnvio = pendientes.map((item) => {
        return fetch('https://jsonplaceholder.typicode.com/posts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: item.titulo, body: item.descripcion })
        })
          .then((res) => {
            if (!res.ok) throw new Error('Falla al reintentar envío');
            return actualizarEstadoRegistro(item.id, 'sincronizado');
          });
      });

      return Promise.all(promesasDeEnvio);
    })
    .then(() => {
      return renderizarColaOutbox();
    })
    .catch((error) => {
      console.error('[Outbox] Error durante la sincronización masiva:', error);
    });
}

// Conexión del formulario (submit)
formIncidencia.addEventListener('submit', (e) => {
  e.preventDefault();

  const titulo = inputTitulo.value.trim();
  const descripcion = inputDescripcion.value.trim();
  if (!titulo || !descripcion) return;

  procesarEnvioReporte({ titulo, descripcion })
    .then(() => {
      formIncidencia.reset();
    });
});

// DELETE: Purgar registros que ya fueron sincronizados
btnPurgar.addEventListener('click', () => {
  obtenerTodosLosRegistros()
    .then((registros) => {
      const sincronizados = registros.filter((item) => item.estado === 'sincronizado');
      if (sincronizados.length === 0) return;

      const promesasDeBorrado = sincronizados.map((item) => eliminarRegistro(item.id));
      return Promise.all(promesasDeBorrado);
    })
    .then(() => {
      return renderizarColaOutbox();
    })
    .catch((error) => {
      console.error('[Outbox] Error al purgar registros sincronizados:', error);
    });
});

// Escuchar el regreso de la conectividad
window.addEventListener('online', () => {
  actualizarIndicadorRed();
  sincronizarPendientes();
});

window.addEventListener('offline', actualizarIndicadorRed);

// Inicializar UI y rescatar cola almacenada al cargar la página
document.addEventListener('DOMContentLoaded', () => {
  actualizarIndicadorRed();
  renderizarColaOutbox();
});
