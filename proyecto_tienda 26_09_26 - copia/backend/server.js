require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname)));

// Configuración de MySQL Workbench
const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT, 10) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '12345',
    database: process.env.DB_NAME || 'tiend'
};

let pool = null;
let dbStatus = {
    connected: false,
    message: 'Iniciando conexión...',
    database: dbConfig.database,
    host: dbConfig.host,
    user: dbConfig.user,
    lastError: null
};

// Función para inicializar base de datos y tabla si no existen
// Función para inicializar base de datos y tabla si no existen
async function inicializarBaseDeDatos() {
    try {
        console.log(`[MySQL] Intentando conectar con Aiven en ${dbConfig.host}:${dbConfig.port}...`);

        // 1. Crear el pool de conexiones apuntando DIRECTAMENTE a la base de datos
        // Omitimos la creación de la BD porque Aiven ya nos entrega "defaultdb" creada
        pool = mysql.createPool({
            ...dbConfig,
            waitForConnections: true,
            connectionLimit: 10,
            queueLimit: 0,
            ssl: {
                rejectUnauthorized: false
            }
        });

        // 2. Crear la tabla 'pedidos' si no existe
        const crearTablaSQL = `
            CREATE TABLE IF NOT EXISTS pedidos (
                id INT AUTO_INCREMENT PRIMARY KEY,
                nombre_cliente VARCHAR(120) NOT NULL,
                email VARCHAR(120) NOT NULL,
                telefono VARCHAR(30) NOT NULL,
                direccion VARCHAR(200) NOT NULL,
                ciudad VARCHAR(80) NOT NULL,
                producto VARCHAR(100) NOT NULL,
                talla VARCHAR(20) NOT NULL,
                cantidad INT NOT NULL DEFAULT 1,
                precio_unitario DECIMAL(10,2) NOT NULL DEFAULT 25.00,
                total DECIMAL(10,2) NOT NULL,
                metodo_pago VARCHAR(50) NOT NULL,
                comentarios TEXT,
                fecha_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `;

        await pool.query(crearTablaSQL);
        console.log(`[MySQL] Tabla 'pedidos' verificada/creada con éxito en '${dbConfig.database}'.`);

        dbStatus.connected = true;
        dbStatus.message = `Conectado exitosamente a Aiven (Base de datos: ${dbConfig.database})`;
        dbStatus.lastError = null;

    } catch (error) {
        dbStatus.connected = false;
        dbStatus.lastError = error.message;
        dbStatus.message = `Error de conexión: ${error.message}`;
        console.error('[MySQL Error]', error.message);
        console.warn(`[MySQL Aviso] Por favor verifica la contraseña y el host de Aiven en el archivo .env.`);
    }
}

// ----------------------------------------------------
// RUTAS DE LA API
// ----------------------------------------------------

// 1. Estado de la conexión
app.get('/api/estado', async (req, res) => {
    // Si no está conectado, reintentar conexión rápida
    if (!dbStatus.connected) {
        await inicializarBaseDeDatos();
    }
    res.json(dbStatus);
});

// 2. Registrar un nuevo pedido (Formulario Amplio)
app.post('/api/pedidos', async (req, res) => {
    try {
        if (!pool || !dbStatus.connected) {
            await inicializarBaseDeDatos();
            if (!pool || !dbStatus.connected) {
                return res.status(503).json({
                    ok: false,
                    mensaje: `No hay conexión activa con la base de datos '${dbConfig.database}'. Verifica tus credenciales en .env y que MySQL Workbench / MySQL Server esté en ejecución.`,
                    error: dbStatus.lastError
                });
            }
        }

        const {
            nombre_cliente,
            email,
            telefono,
            direccion,
            ciudad,
            producto,
            talla,
            cantidad,
            precio_unitario,
            metodo_pago,
            comentarios
        } = req.body;

        // Validaciones requeridas
        if (!nombre_cliente || !email || !telefono || !direccion || !ciudad || !producto || !talla || !cantidad) {
            return res.status(400).json({
                ok: false,
                mensaje: 'Todos los campos obligatorios del cliente y producto deben ser completados.'
            });
        }

        const cant = parseInt(cantidad, 10) || 1;
        const precioUnit = parseFloat(precio_unitario) || 25.00;
        const total = cant * precioUnit;

        const sql = `
            INSERT INTO pedidos (
                nombre_cliente, email, telefono, direccion, ciudad, 
                producto, talla, cantidad, precio_unitario, total, metodo_pago, comentarios
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        const [resultado] = await pool.query(sql, [
            nombre_cliente.trim(),
            email.trim().toLowerCase(),
            telefono.trim(),
            direccion.trim(),
            ciudad.trim(),
            producto.trim(),
            talla.trim(),
            cant,
            precioUnit,
            total,
            metodo_pago ? metodo_pago.trim() : 'No especificado',
            comentarios ? comentarios.trim() : ''
        ]);

        console.log(`[Pedido Nuevo] ID: ${resultado.insertId} - Cliente: ${nombre_cliente} - Producto: ${producto} - Total: $${total}`);

        return res.status(201).json({
            ok: true,
            mensaje: '¡Pedido guardado con éxito en la base de datos MySQL tiend!',
            id: resultado.insertId,
            detalles: {
                cliente: nombre_cliente,
                producto,
                talla,
                cantidad: cant,
                total
            }
        });

    } catch (error) {
        console.error('[Error al guardar pedido]', error);
        return res.status(500).json({
            ok: false,
            mensaje: 'Ocurrió un error al guardar el pedido en la base de datos MySQL.',
            error: error.message
        });
    }
});

// 3. Listar pedidos guardados
app.get('/api/pedidos', async (req, res) => {
    try {
        if (!pool || !dbStatus.connected) {
            await inicializarBaseDeDatos();
            if (!pool || !dbStatus.connected) {
                return res.status(503).json({
                    ok: false,
                    mensaje: `No hay conexión con la base de datos '${dbConfig.database}'.`,
                    error: dbStatus.lastError,
                    pedidos: []
                });
            }
        }

        const [filas] = await pool.query('SELECT * FROM pedidos ORDER BY fecha_registro DESC');
        return res.json({
            ok: true,
            total: filas.length,
            pedidos: filas
        });

    } catch (error) {
        console.error('[Error al obtener pedidos]', error);
        return res.status(500).json({
            ok: false,
            mensaje: 'Error al consultar los pedidos en la base de datos.',
            error: error.message,
            pedidos: []
        });
    }
});

// 4. Eliminar un pedido por ID
app.delete('/api/pedidos/:id', async (req, res) => {
    try {
        if (!pool || !dbStatus.connected) {
            return res.status(503).json({ ok: false, mensaje: 'Sin conexión a base de datos' });
        }

        const id = parseInt(req.params.id, 10);
        await pool.query('DELETE FROM pedidos WHERE id = ?', [id]);

        return res.json({
            ok: true,
            mensaje: `Pedido #${id} eliminado correctamente.`
        });
    } catch (error) {
        return res.status(500).json({ ok: false, error: error.message });
    }
});

// Iniciar servidor e inicializar base de datos
app.listen(PORT, async () => {
    console.log(`=======================================================`);
    console.log(` Servidor FrontEnd Store corriendo en http://localhost:${PORT}`);
    console.log(` Base de datos objetivo en MySQL Workbench: '${dbConfig.database}'`);
    console.log(`=======================================================`);
    await inicializarBaseDeDatos();
});
