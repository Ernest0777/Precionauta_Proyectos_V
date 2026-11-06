# Registro gratuito, comunidad y recomendaciones

Decisión del usuario: visitante como muestra de **6 ofertas**, registro gratuito para ver más y guardar; sin acceso visitante a temporadas. La cuenta gratuita sigue siendo útil sin contratar Plus: catálogo completo con la espera existente de dos horas para novedades, tres alertas y 30 días de historial. Plus conserva acceso inmediato, 365 días, temporadas completas y Telegram configurado.

Se añaden votos «Vale la pena»/«No tanto» por oferta y recomendaciones personales por cuenta basadas en consultas, búsquedas y acciones. Una cuenta puede cambiar o retirar su voto; no se publica la identidad del votante. La actividad se conserva por cuenta y no se mezcla entre personas ni navegadores. No se requiere IA externa.

## Tareas y propiedad

1. Permisos backend: muestra estable antes de filtros, protección de detalle/redirección/estadísticas y temporadas; mantener límites gratis/Plus. Responsable: acceso_visitantes. Completado.
2. Comunidad y actividad: SQLite, rutas autenticadas, voto único y recomendador por cuenta con protección contra respuestas tardías. Responsable: comunidad_personalizacion. Completado.
3. Invitación al registro: catálogo, guardados, temporadas, recomendaciones y textos de planes; conservar estilo y navegación. Responsable: registro_frontend. Completado.
4. Integración: detalle, votos, historial disponible, montaje de rutas, pruebas de navegador y documentación. Responsable: raíz. Completado.

## Contratos y decisiones

- `selectDealsForAccess(deals, access)` selecciona seis ofertas liberadas únicas para visitante antes de cualquier filtro; cuenta gratuita y Plus conservan sus catálogos.
- Backend devuelve `registrationRequired` y mensajes de cuenta gratuita. Un ID conocido no permite saltarse la muestra.
- Rutas `/api/community/deals/:id/votes` y `/api/community/activity`, montadas después de la sesión de cuenta. Las escrituras exigen origen permitido y cuenta.
- El recomendador conserva su API de frontend y cambia el almacenamiento global del navegador por actividad privada de la cuenta. No se atribuye actividad anónima anterior a una persona.
- El historial sigue siendo observado, con fecha y cobertura reales. Importar periodos anteriores exige una fuente autorizada verificable, fuera de este cambio. No se crearán precios ficticios.

## Verificación

Suite completa: **57 pruebas aprobadas**. Se verificaron autorización y aislamiento, cambio/retiro de voto, actividad y recomendaciones, navegación de registro, visitante con seis ofertas/sin guardados/sin temporadas, cuenta gratuita y Plus. Chrome comprobó también la muestra, registro al guardar, bloqueo de temporada y detalle fuera de muestra, votos y cobertura histórica, cambio de cuenta entre dos pestañas, rechazo de un voto con identidad antigua y cierre de sesión sincronizado. Se conservaron los recorridos previos de permisos, correo, planes, móvil y moderación.

Se usaron bases y servidores temporales sin correos, Telegram ni consultas comerciales reales. La revisión independiente detectó dos problemas corregidos: actividad que podía atribuirse a otra cuenta por una cookie cambiada en otra pestaña y recorte de temporada antes de excluir novedades bloqueadas. Las rutas de comunidad comprueban `X-Account-Id` contra la sesión; ante discrepancia, el cliente descarta la acción y actualiza la sesión. La cuenta gratuita selecciona tres ofertas liberadas antes de aplicar filtros. La re-revisión de estas correcciones fue limpia.

La cobertura histórica se presenta con fecha inicial, número de observaciones y período disponible. Los avisos de privacidad, cookies y la selección de intereses reflejan el almacenamiento por cuenta. El respaldo periódico y una posible importación de históricos autorizados quedan registrados como trabajo posterior.
