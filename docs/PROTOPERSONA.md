# Protopersona — Precionauta

Versión de trabajo: 2026-11-04.

## Naturaleza del documento

Esta protopersona es una **hipótesis de diseño**, no el resultado de entrevistas, una encuesta ni un estudio de mercado. El nombre y la situación son ilustrativos. No atribuye estadísticas, citas reales ni representatividad a un grupo de compradores.

## Ana, compradora que compara antes de decidir

Ana quiere comprar un producto cuando su precio le convenga. Compara opciones en México desde el celular y, cuando necesita revisar detalles, también desde computadora. Tiene un presupuesto para esa compra y un tiempo limitado para consultar tiendas. Estos rasgos son supuestos que deben validarse; no se infieren edad, ingresos ni hábitos medidos.

Su tarea principal es encontrar una oferta que pueda evaluar con confianza: cuánto cuesta, qué datos respaldan la comparación y cómo volver a verla si todavía no decide comprar.

## Objetivos supuestos

- Comparar precio actual y precio observado anteriormente sin confundir el precio de referencia de la tienda con evidencia histórica.
- Guardar productos para revisar después y seguir una baja de precio sin recorrer todo el catálogo.
- Comprender cuándo una oferta estará disponible y qué cambia al crear una cuenta o elegir Plus.
- Saber si una acción cobra dinero y cuál sería el precio final con IVA.

## Dificultades a investigar

- Un descuento alto puede resultar difícil de evaluar si falta historial o el precio anterior no es claro.
- La espera de 2 horas y los límites de alertas o temporadas pueden parecer un fallo si no se explican antes de actuar.
- Perder guardados al cambiar de dispositivo o al iniciar sesión puede romper la continuidad de una compra.
- Un checkout de demostración con apariencia de pago puede generar confusión si no declara que no cobra ni acepta tarjeta real.

## Recorrido de referencia

1. **Explora como visitante.** Consulta el catálogo liberado sin cuenta y guarda productos en el navegador. Comprende que no tiene historial ni alertas y que el acceso gratuito a temporada se limita a 3 ofertas en total por evento.
2. **Crea una Cuenta gratuita.** Usa correo y contraseña para conservar guardados en su cuenta, activar hasta 3 alertas y consultar hasta 30 días de historial existente. Las ofertas nuevas posteriores a la primera carga esperan 2 horas.
3. **Evalúa Plus.** Compara $79 MXN/mes y $790 MXN/año, ambos con IVA incluido. Reconoce el ahorro anual de $158 y entiende los beneficios: alertas ilimitadas, hasta 365 días de historial y ofertas nuevas al instante.
4. **Prueba la demo.** Entra a su cuenta y solicita activación sin cobro. Solo considera Plus activo después de la respuesta del servidor. Ante un error, ve una explicación y conserva el plan anterior.
5. **Regresa a Cuenta gratuita.** Conserva los guardados y las alertas; entiende cuáles exceden las 3 activas y quedan pausadas.

Este recorrido no presupone que Ana quiera pagar ni que el historial tenga observaciones de todos los días. El perfil pide dirección solo como dato opcional, sin impedir la exploración o el registro si se omite.

## Implicaciones de diseño

Explicar los límites en el punto de acción, mantener el precio final visible y distinguir datos reales de ejemplos. Presentar estados sin cuenta, sin datos, pendiente de confirmación y error con acciones claras. Mantener navegación y lectura utilizables con teclado, móvil y ambos temas, conservando la identidad neobrutalista.

No anunciar OAuth de Google/Facebook, recuperación por correo, una tienda adicional ni una afiliación comercial como funciones disponibles.

## Validación propuesta

Observar a personas que estén comparando una compra: pedirles que encuentren una oferta, interpreten el historial, guarden un producto, creen una alerta y expliquen la diferencia entre Cuenta gratuita y Plus. Preguntar qué esperan que ocurra al activar la demo o regresar al acceso gratuito.

Registrar errores de interpretación, pasos donde abandonan, datos que echan de menos y qué información consideran suficiente para decidir. Comparar los hallazgos con estos supuestos y ajustar o reemplazar la protopersona. El método, participantes y resultados se documentarán cuando esa investigación ocurra; hoy no hay hallazgos que presentar.
