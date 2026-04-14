# 09_DECISIONES_TECNICAS.md
## Decisiones técnicas

(Registrar aquí decisiones que cambian reglas, dominios, endpoints o esquemas.)


## 2026-04-09 — Estándar de fechas operacionales

Se adopta la siguiente convención:

- `created_at` / `updated_at`: timestamps absolutos del sistema (Postgres / UTC).
- `as_of_date` / `fecha` de snapshots diarios: fecha operacional local de la app en `America/Argentina/Cordoba`.

Alcance del cambio implementado en esta iteración:
- alta por URL (`/api/ofertas`, `/api/ofertas/bulk`) deja de sembrar `item_price_daily_pres` con `current_date` implícito y usa una fecha calculada explícitamente en zona local de la app;
- la UI recibe `as_of_date` para reflejar la misma fecha usada por backend.

Fuera de alcance por ahora:
- migrar en una sola iteración todos los cron y snapshots existentes que hoy dependen de `current_date`.

## 2026-04-09 — SKU opcional en PuraQuimica

- `articulo_prov` sigue existiendo como campo opcional en `item_seguimiento`.
- En PuraQuimica la ausencia de SKU no bloquea ni degrada el preview/create.
- La identidad mínima aceptada del item proveedor PuraQuimica es `url_canonica` + `descripcion_fuente` cuando existe.

## 2026-04-14 — Línea de trabajo aceptada para capa comercial (no implementada aún)

Se fija la siguiente terminología operativa para la evolución comercial de la app:

- **Items Comerciales**: nombre preferido para la futura capa comercial operativa.
- **Items Envases** y **Items Paquetería**: listas separadas, fuera de las listas actuales de Proveedor / Manual / Formulado.

Aclaraciones:

- Esto **no** implica cambio inmediato de esquema ni migración masiva.
- Mientras no exista un cambio explícito de dominio, la app mantiene sus entidades actuales (`producto`, `item_formulado`, `offers`, `producto_oferta`, `cost_option`, etc.).
- La intención aceptada es que la capa comercial se apoye sobre un objeto listo para vender, etiquetar, envasar, costear y luego publicar, pero su implementación concreta queda pendiente de diagnóstico completo.

Regla de alcance aceptada para la próxima etapa:

- No se crearán ítems comerciales de forma masiva.
- Solo se crearán manualmente los ítems comerciales de interés a partir de ítems Proveedor, Manual o Formulado que efectivamente se quieran comercializar.

Regla operativa proyectada (todavía no implementada):

- Las futuras hojas **Items Comerciales**, **Items Envases** e **Items Paquetería** deberán integrarse a la tabla general de `/items` para poder verificar su actualización de precios / costos con el mismo criterio operacional visible desde la hoja Items.

## 2026-04-14 — Línea futura de etiquetado con BarTender (no implementada aún)

Se adopta la siguiente línea técnica para no perder continuidad funcional:

- `mgq-admin` será la **fuente de verdad** para los datos de etiquetado.
- **BarTender Designer 2022 R8** y las impresoras **Honeywell PC42t Plus** / **TSC TE200** se consideran parte de la futura capa de impresión estandarizada.
- La integración objetivo será de **lectura** desde una estructura preparada por la app (vista, consulta o tabla derivada), evitando que BarTender gobierne estados operativos del sistema.
- El etiquetado queda separado conceptualmente de pricing, snapshots y publicación comercial; se documenta ahora como línea futura, no como funcionalidad vigente.

