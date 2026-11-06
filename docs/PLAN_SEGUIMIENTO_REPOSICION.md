# Seguimiento continuo, reposición y tarjetas

**Objetivo:** conservar los ciclos de precio de productos guardados o con avisos aunque salgan del catálogo de descuentos, avisar de reposiciones confirmadas y descargar tarjetas compartibles con foto, precio observado y enlace.

**Decisiones del usuario:** la cuenta gratuita comparte tres alertas activas entre precio y reposición; Plus mantiene su límite ampliado y puede recibir Telegram si está vinculado. El pago sigue siendo opcional. Se mantienen los seis productos de muestra para visitante, la espera de dos horas de novedades en Gratis y las ventanas históricas actuales.

**Tecnología:** Express, SQLite, módulos JS y Canvas; reutilizar dependencias instaladas. Conservar cambios de trabajo anteriores en Neo_Brutalism. No activar servicios comerciales, publicar ni enviar mensajes reales durante las pruebas.

## Tareas

- [x] Registro de productos seguidos y recolección por lotes con rotación persistente. Responsable: seguimiento_continuo. Archivos tracked-products/product-tracker/deal-fetcher y pruebas.
- [x] Suscripciones y eventos de reposición, cupo combinado, pausas tras downgrade, historial propio fuera de catálogo y Telegram opcional. Responsable: reposiciones_backend. Archivos restock/account/routes/telegram y pruebas.
- [x] Canvas de tarjeta y proxy de imágenes autorizado, con límites, validación de destinos y fallback de imagen. Responsable: tarjetas_compartir. Nuevos shareCard/share-routes y pruebas.
- [x] Integración de recolector, perfil/avisos/detalle, pruebas de navegador y configuración de ejecución continua con almacenamiento persistente. Responsable: raíz.

## Contratos

- tracked.remember(deals,{source,at}), tracked.get(id) y tracked.owned(userId) usan snapshots de proveedor por ID, con disponibilidad y fecha de validación. No se atribuye precio actual a una consulta fallida.
- productTracker.refresh() retorna observaciones reales frescas, guarda precios y snapshots y limita concurrencia/lote; no inicia red al importar el módulo.
- restock.observe(deals,{source,at}) produce eventos nuevos sólo ante transición confirmada agotado → disponible. Un dato desconocido o error no confirma agotamiento ni reposición.
- Nuevas rutas de cuenta requieren sesión y propietario esperado X-Account-Id; mutaciones verifican origen. No permiten leer productos seguidos por otra persona.
- El historial se conserva por ID al pasar descuento → precio normal → nuevo descuento. Las observaciones faltantes no se inventan.
- Una tarjeta refleja precio observado; compartirla no garantiza precio ni inventario futuro. El proxy sólo obtiene imágenes de productos autorizados y destinos de imagen permitidos.

## Revisión y aceptación

Probar múltiples vendedores, cantidades desconocidas, errores de red, lotes sin solapamiento, rotación y reinicios, deduplicación de reposición, aislamiento entre cuentas y pestañas, cupo combinado y downgrade, permisos de catálogo/historia, precio sin descuento registrado, descarga PNG con imagen fallida y acceso al proxy. Verificar que el servidor importa sin arrancar recolectores ni Telegram en pruebas.

Verificación final: **86 pruebas aprobadas**, sintaxis válida en **97 archivos JS** y recorrido de Chrome aprobado. Se probaron suscripción desde Detalle, cupo combinado, reposición única y lectura del aviso en Perfil, detalle e historial propios fuera del catálogo, precio normal conservado al volver el descuento y PNG de 1200×630 con imagen y con fallback. Se conservaron los recorridos previos de cuenta, comunidad, permisos, móvil y moderación.

La revisión independiente detectó y se corrigieron IDs arbitrarios usados como autorización, snapshots moderados expuestos, evasión del cupo mediante merge, pérdida de Telegram ante errores, falta de migración autorizada de seguimientos anteriores, bloqueo de la cola por 100 fallos y mezcla de precio agotado con disponibilidad de otro vendedor sin precio. Se exige prueba por cuenta o acceso conocido, se recupera evidencia antigua confiable sin consultar IDs adivinados, se respetan decisiones manuales y Telegram reintenta con rotación tras confirmación de envío. La re-revisión de estos caminos fue limpia.

Ejecución continua: Docker Compose pasó validación de configuración y el respaldo pasó prueba SQLite WAL en vivo. Docker Engine no estaba iniciado; no se construyó ni ejecutó el contenedor ni se desplegó o contrató infraestructura. Se requiere host activo y almacenamiento persistente; Docker no mantiene encendida una computadora suspendida ni un servicio de hosting dormido. Guía: [BACKEND_CONTINUO.md](BACKEND_CONTINUO.md).
