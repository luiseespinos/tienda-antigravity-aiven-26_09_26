/**
 * FrontEnd Store - Gestión de Pedidos y Conexión MySQL Workbench (tiend)
 */

// URL del backend en Render (Actualizar cuando Render te dé el enlace final)
const API_URL = 'https://TU-BACKEND-EN-RENDER.onrender.com';

document.addEventListener('DOMContentLoaded', () => {
    // 1. Verificar estado de la conexión con MySQL Workbench
    verificarConexionMySQL();

    // 2. Inicializar lógica según la página actual
    const formulario = document.getElementById('formulario-pedido');
    if (formulario) {
        inicializarFormularioPedido(formulario);
    }

    const btnRecargar = document.getElementById('btn-recargar');
    if (btnRecargar) {
        btnRecargar.addEventListener('click', () => {
            verificarConexionMySQL();
            if (typeof cargarListaPedidos === 'function') {
                cargarListaPedidos();
            }
        });
    }

    const btnNuevoPedido = document.getElementById('btn-nuevo-pedido');
    if (btnNuevoPedido) {
        btnNuevoPedido.addEventListener('click', () => {
            const alertaExito = document.getElementById('alerta-exito');
            if (alertaExito) alertaExito.style.display = 'none';
            if (formulario) {
                formulario.reset();
                actualizarResumen();
                formulario.scrollIntoView({ behavior: 'smooth' });
            }
        });
    }
});

/**
 * Consulta el estado de la conexión con MySQL Workbench y actualiza el indicador visual
 */
async function verificarConexionMySQL() {
    const contenedor = document.getElementById('indicador-conexion');
    const texto = document.getElementById('texto-conexion');
    if (!contenedor || !texto) return;

    try {
        const respuesta = await fetch(`${API_URL}/api/estado`);
        if (!respuesta.ok) {
            throw new Error(`HTTP ${respuesta.status}`);
        }
        const data = await respuesta.json();

        contenedor.classList.remove('indicador-conexion--cargando', 'indicador-conexion--conectado', 'indicador-conexion--desconectado');

        if (data.connected) {
            contenedor.classList.add('indicador-conexion--conectado');
            texto.innerHTML = `🟢 Conectado a MySQL Workbench &bull; Base de datos: <strong>${data.database}</strong> (${data.host})`;
        } else {
            contenedor.classList.add('indicador-conexion--desconectado');
            texto.innerHTML = `🔴 MySQL Workbench desconectado (${data.message}). Verifica tu servidor MySQL y archivo .env`;
        }
    } catch (error) {
        contenedor.classList.remove('indicador-conexion--cargando', 'indicador-conexion--conectado');
        contenedor.classList.add('indicador-conexion--desconectado');
        texto.innerHTML = `🔴 Servidor backend no responde en puerto 3000. Inicia con <code>npm start</code>.`;
    }
}

/**
 * Inicializa la validación, cálculos y envío del formulario amplio
 */
function inicializarFormularioPedido(formulario) {
    const inputProducto = document.getElementById('producto');
    const inputTalla = document.getElementById('talla');
    const inputCantidad = document.getElementById('cantidad');
    const btnSubmit = document.getElementById('btn-submit');
    const btnTexto = document.getElementById('btn-texto');
    const btnSpinner = document.getElementById('btn-spinner');
    const alertaExito = document.getElementById('alerta-exito');
    const alertaExitoMsg = document.getElementById('alerta-exito-mensaje');
    const alertaError = document.getElementById('alerta-error');
    const alertaErrorMsg = document.getElementById('alerta-error-mensaje');

    // Preseleccionar producto si viene por parámetro en la URL (?producto=ReactJS)
    const urlParams = new URLSearchParams(window.location.search);
    const productoParam = urlParams.get('producto');
    if (productoParam && inputProducto) {
        for (let i = 0; i < inputProducto.options.length; i++) {
            if (inputProducto.options[i].value.toLowerCase() === productoParam.toLowerCase()) {
                inputProducto.selectedIndex = i;
                break;
            }
        }
    }

    // Actualizar resumen inicial
    actualizarResumen();

    // Eventos para cálculo en tiempo real
    if (inputProducto) inputProducto.addEventListener('change', actualizarResumen);
    if (inputTalla) inputTalla.addEventListener('change', actualizarResumen);
    if (inputCantidad) {
        inputCantidad.addEventListener('input', actualizarResumen);
        inputCantidad.addEventListener('change', actualizarResumen);
    }

    // Sincronización de accesibilidad ARIA con validación nativa
    formulario.addEventListener('blur', (e) => {
        if (e.target.matches('input[required], select[required], textarea[required]')) {
            sincronizarAria(e.target);
        }
    }, true);

    formulario.addEventListener('input', (e) => {
        if (e.target.hasAttribute('aria-invalid') && e.target.checkValidity()) {
            e.target.removeAttribute('aria-invalid');
        }
    });

    // Envío del formulario asíncrono
    formulario.addEventListener('submit', async (e) => {
        e.preventDefault();

        // Ocultar alertas anteriores
        if (alertaExito) alertaExito.style.display = 'none';
        if (alertaError) alertaError.style.display = 'none';

        // Validar todos los campos
        const camposRequeridos = formulario.querySelectorAll('input[required], select[required]');
        let formularioValido = true;
        let primerCampoInvalido = null;

        camposRequeridos.forEach(campo => {
            sincronizarAria(campo);
            if (!campo.checkValidity()) {
                formularioValido = false;
                if (!primerCampoInvalido) primerCampoInvalido = campo;
            }
        });

        if (!formularioValido) {
            if (primerCampoInvalido) primerCampoInvalido.focus();
            return;
        }

        // Preparar datos del payload
        const cantidadVal = parseInt(inputCantidad.value, 10) || 1;
        const precioUnitarioVal = 25.00;
        const totalVal = cantidadVal * precioUnitarioVal;

        const payload = {
            nombre_cliente: document.getElementById('nombre_cliente').value.trim(),
            email: document.getElementById('email').value.trim(),
            telefono: document.getElementById('telefono').value.trim(),
            direccion: document.getElementById('direccion').value.trim(),
            ciudad: document.getElementById('ciudad').value.trim(),
            producto: inputProducto.value,
            talla: inputTalla.value,
            cantidad: cantidadVal,
            precio_unitario: precioUnitarioVal,
            total: totalVal,
            metodo_pago: document.getElementById('metodo_pago').value,
            comentarios: document.getElementById('comentarios').value.trim()
        };

        // Estado de carga en el botón
        btnSubmit.disabled = true;
        if (btnTexto) btnTexto.textContent = 'Guardando en MySQL Workbench...';
        if (btnSpinner) btnSpinner.style.display = 'inline-block';

        try {
            const respuesta = await fetch(`${API_URL}/api/pedidos`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            const resultado = await respuesta.json();

            if (respuesta.ok && resultado.ok) {
                // Éxito: Mostrar alerta y limpiar
                if (alertaExito) {
                    alertaExito.style.display = 'block';
                    if (alertaExitoMsg) {
                        alertaExitoMsg.innerHTML = `
                            El pedido <strong>#${resultado.id}</strong> del cliente <strong>${payload.nombre_cliente}</strong> fue guardado en la base de datos <strong>tiend</strong> (Total: $${totalVal.toFixed(2)} USD).
                        `;
                    }
                    alertaExito.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }

                formulario.reset();
                actualizarResumen();

            } else {
                // Error de servidor o BD
                if (alertaError) {
                    alertaError.style.display = 'block';
                    if (alertaErrorMsg) {
                        alertaErrorMsg.textContent = resultado.mensaje || 'Error desconocido al guardar en la base de datos.';
                    }
                    alertaError.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            }

        } catch (error) {
            if (alertaError) {
                alertaError.style.display = 'block';
                if (alertaErrorMsg) {
                    alertaErrorMsg.textContent = `Error de red o conexión: ${error.message}. Asegúrate de tener el servidor corriendo (npm start).`;
                }
                alertaError.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        } finally {
            btnSubmit.disabled = false;
            if (btnTexto) btnTexto.textContent = 'Confirmar Pedido y Enviar a MySQL';
            if (btnSpinner) btnSpinner.style.display = 'none';
        }
    });
}

/**
 * Actualiza los valores de la tarjeta de resumen en tiempo real
 */
function actualizarResumen() {
    const inputProducto = document.getElementById('producto');
    const inputTalla = document.getElementById('talla');
    const inputCantidad = document.getElementById('cantidad');

    const resumenProd = document.getElementById('resumen-producto');
    const resumenTalla = document.getElementById('resumen-talla');
    const resumenCant = document.getElementById('resumen-cantidad');
    const resumenTotal = document.getElementById('resumen-total');

    if (inputProducto && resumenProd) {
        resumenProd.textContent = inputProducto.value ? `Camisa ${inputProducto.value}` : 'Ninguna seleccionada';
    }

    if (inputTalla && resumenTalla) {
        resumenTalla.textContent = inputTalla.value || '-';
    }

    const cantidad = (inputCantidad && parseInt(inputCantidad.value, 10) > 0) ? parseInt(inputCantidad.value, 10) : 1;
    if (resumenCant) {
        resumenCant.textContent = cantidad;
    }

    const precioUnitario = 25.00;
    const total = cantidad * precioUnitario;
    if (resumenTotal) {
        resumenTotal.textContent = `$${total.toFixed(2)} USD`;
    }
}

/**
 * Sincroniza el atributo aria-invalid con la validez del elemento
 */
function sincronizarAria(elemento) {
    if (!elemento.checkValidity()) {
        elemento.setAttribute('aria-invalid', 'true');
    } else {
        elemento.removeAttribute('aria-invalid');
    }
}

/**
 * Carga y renderiza los pedidos guardados en MySQL Workbench en la vista pedidos.html
 */
async function cargarListaPedidos() {
    const contenedor = document.getElementById('contenedor-pedidos');
    if (!contenedor) return;

    contenedor.innerHTML = `
        <div class="cargando-spinner">
            <div class="spinner spinner--grande"></div>
            <p>Consultando base de datos MySQL <strong>tiend</strong>...</p>
        </div>
    `;

    try {
        const respuesta = await fetch(`${API_URL}/api/pedidos`);
        const data = await respuesta.json();

        if (!respuesta.ok || !data.ok) {
            contenedor.innerHTML = `
                <div class="alerta alerta--error">
                    <h3>Error al cargar pedidos</h3>
                    <p>${data.mensaje || 'No se pudo conectar a la base de datos MySQL.'}</p>
                    <p><small>${data.error || ''}</small></p>
                </div>
            `;
            return;
        }

        const pedidos = data.pedidos || [];

        if (pedidos.length === 0) {
            contenedor.innerHTML = `
                <div class="pedidos-vacio">
                    <h3>No hay pedidos registrados todavía</h3>
                    <p>Los pedidos que registres en el formulario se guardarán en la base de datos <strong>tiend</strong> y aparecerán aquí automáticamente.</p>
                    <a href="pedido.html" class="boton boton--secundario">+ Crear Primer Pedido</a>
                </div>
            `;
            return;
        }

        // Renderizar tabla y tarjetas
        let html = `
            <div class="pedidos-resumen-barra">
                <span>Total de pedidos en MySQL: <strong>${pedidos.length}</strong></span>
                <span>Base de datos: <strong>tiend</strong> &bull; Tabla: <strong>pedidos</strong></span>
            </div>

            <div class="pedidos-grid">
        `;

        pedidos.forEach(p => {
            const fecha = p.fecha_registro ? new Date(p.fecha_registro).toLocaleString('es-CO') : 'Reciente';
            const total = parseFloat(p.total) || (p.cantidad * 25.00);

            html += `
                <article class="tarjeta-pedido" id="tarjeta-pedido-${p.id}">
                    <header class="tarjeta-pedido__header">
                        <span class="tarjeta-pedido__id">Pedido #${p.id}</span>
                        <time class="tarjeta-pedido__fecha">${fecha}</time>
                    </header>

                    <div class="tarjeta-pedido__cuerpo">
                        <div class="tarjeta-pedido__bloque">
                            <h4 class="tarjeta-pedido__subtitulo">👤 Datos del Cliente</h4>
                            <p class="tarjeta-pedido__dato"><strong>Nombre:</strong> ${escaparHTML(p.nombre_cliente)}</p>
                            <p class="tarjeta-pedido__dato"><strong>Email:</strong> ${escaparHTML(p.email)}</p>
                            <p class="tarjeta-pedido__dato"><strong>Teléfono:</strong> ${escaparHTML(p.telefono)}</p>
                            <p class="tarjeta-pedido__dato"><strong>Dirección:</strong> ${escaparHTML(p.direccion)}, ${escaparHTML(p.ciudad)}</p>
                        </div>

                        <div class="tarjeta-pedido__bloque">
                            <h4 class="tarjeta-pedido__subtitulo">👕 Prenda y Compra</h4>
                            <p class="tarjeta-pedido__dato"><strong>Producto:</strong> Camisa ${escaparHTML(p.producto)}</p>
                            <p class="tarjeta-pedido__dato"><strong>Talla:</strong> ${escaparHTML(p.talla)}</p>
                            <p class="tarjeta-pedido__dato"><strong>Cantidad:</strong> ${p.cantidad} unidad(es)</p>
                            <p class="tarjeta-pedido__dato"><strong>Método de Pago:</strong> ${escaparHTML(p.metodo_pago)}</p>
                            ${p.comentarios ? `<p class="tarjeta-pedido__dato"><strong>Notas:</strong> <em>${escaparHTML(p.comentarios)}</em></p>` : ''}
                        </div>
                    </div>

                    <footer class="tarjeta-pedido__footer">
                        <div class="tarjeta-pedido__total">
                            <span>Total Facturado:</span>
                            <strong>$${total.toFixed(2)} USD</strong>
                        </div>
                        <button type="button" class="boton boton--peligro" onclick="eliminarPedido(${p.id})">Eliminar</button>
                    </footer>
                </article>
            `;
        });

        html += `</div>`;
        contenedor.innerHTML = html;

    } catch (error) {
        contenedor.innerHTML = `
            <div class="alerta alerta--error">
                <h3>Error de conexión</h3>
                <p>No se pudo comunicar con el servidor backend: ${error.message}</p>
            </div>
        `;
    }
}

/**
 * Elimina un pedido por ID tras confirmar con el usuario
 */
async function eliminarPedido(id) {
    if (!confirm(`¿Estás seguro de eliminar el pedido #${id} de la base de datos MySQL (tiend)?`)) {
        return;
    }

    try {
        const respuesta = await fetch(`${API_URL}/api/pedidos/${id}`, {
            method: 'DELETE'
        });
        const data = await respuesta.json();

        const feedback = document.getElementById('mensaje-feedback');
        if (feedback) {
            feedback.style.display = 'block';
            feedback.textContent = data.mensaje || `Pedido #${id} eliminado correctamente.`;
            setTimeout(() => { feedback.style.display = 'none'; }, 4000);
        }

        // Recargar la lista
        cargarListaPedidos();

    } catch (error) {
        alert(`Error al eliminar pedido: ${error.message}`);
    }
}

/**
 * Escapa caracteres HTML para prevenir inyección XSS en renderizado
 */
function escaparHTML(texto) {
    if (!texto) return '';
    return String(texto)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
