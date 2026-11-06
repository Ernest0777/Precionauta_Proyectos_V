# Mantener Precionauta recolectando datos

El backend consulta el catálogo y los productos seguidos sin depender de visitas a la página. El intervalo de trabajo es de cinco minutos. El seguimiento adicional usa lotes de hasta 60 productos y cuatro consultas simultáneas, con rotación y deduplicación. Una lista grande puede tardar varios ciclos en revisarse completa. Los fallos del proveedor no crean precios ni inventario ficticios.

## Qué necesitas

Un servidor que permanezca encendido, acceso permitido a Mercado Libre, almacenamiento persistente para SQLite y copias de respaldo. Puede ser un VPS o un servicio de hosting que no suspenda el proceso. En una PC local, cerrar el backend, apagarla, suspenderla o perder Internet interrumpe la recolección.

Los servicios web gratuitos de Render se suspenden tras 15 minutos sin tráfico y no admiten disco persistente; no sirven para este recolector continuo con SQLite local. Un servicio sin suspensión con disco persistente es una alternativa, además de un VPS. Revisar las condiciones antes de contratar: [Render Free](https://render.com/docs/free), [discos persistentes](https://render.com/docs/disks).

## Configuración preparada con Docker

`Dockerfile` ejecuta Node 22 en producción como usuario sin privilegios. `compose.yaml` configura `restart: unless-stopped`, comprobación `/health` y volúmenes separados para datos y caché. `.dockerignore` excluye credenciales, datos privados y archivos de trabajo de la imagen.

1. Configura `backend/.env` en el servidor usando `.env.example` como guía. Mantén las credenciales fuera de Git. Usa `FRONTEND_URL` y `PUBLIC_URL` con tus direcciones HTTPS reales, y configura la URL del API del frontend antes de cargar sus módulos.
2. Usa frontend y API bajo el mismo sitio, por ejemplo `precionauta.example` y `api.precionauta.example`, o un proxy con `/api`. La sesión de producción requiere HTTPS; CORS debe permitir el origen exacto del frontend.
3. Antes de migrar, genera un respaldo de la base existente. Los volúmenes nuevos comienzan vacíos: importar el respaldo es un paso explícito; no asumas que Docker incorpora tu base local.
4. En un equipo con Docker Engine iniciado, desde el repositorio:

```bash
docker compose config --quiet
docker compose up -d --build
docker compose logs --tail=100 backend
```

El puerto se publica sólo en `127.0.0.1:3001` del servidor para colocarlo detrás de un proxy HTTPS. `/health` informa si el proceso responde y muestra el último ciclo del recolector; no garantiza por sí solo que el proveedor haya entregado datos nuevos.

El frontend se despliega por separado como sitio estático. Esta configuración no publica automáticamente el dominio ni configura certificados. Para una plataforma que construya directamente el Dockerfile, monta almacenamiento persistente en `/app/backend/data` y `/app/backend/cache`.

Conserva los volúmenes al actualizar el servicio. `restart: unless-stopped` reinicia el contenedor ante interrupciones mientras Docker y el host estén activos; no enciende una computadora suspendida ni vence las políticas de suspensión del hosting. [Referencia de Docker Compose](https://docs.docker.com/reference/compose-file/services/#restart).

## Respaldos consistentes

```bash
npm run backup
```

En el contenedor:

```bash
docker compose exec backend npm run backup
```

El comando usa `VACUUM INTO`, verifica la copia y la guarda en `backend/data/backups` junto a la base configurada. Puede ejecutarse mientras el backend usa WAL. No reemplaza el archivo original ni inicia el recolector o Telegram. [Documentación de SQLite](https://www.sqlite.org/lang_vacuum.html).

El respaldo contiene cuentas y otros datos privados; no lo publiques ni lo subas a Git. Copia periódicamente respaldos verificados a un almacenamiento separado del servidor y comprueba la restauración en un entorno aislado. La programación periódica y el almacenamiento externo deben configurarse en el servidor elegido.

## Verificación de esta entrega

La configuración de Compose pasó `docker compose config --quiet`. El comando de respaldo se probó con SQLite temporal en WAL y mantuvo intacta la fuente. Docker Desktop está instalado en el equipo de desarrollo, pero su servicio no estaba iniciado: la construcción y ejecución real de la imagen no están verificadas aquí. No se desplegó ni contrató infraestructura.
