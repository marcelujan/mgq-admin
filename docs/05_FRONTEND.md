# 05_FRONTEND

## Item Comercial

La hoja de edición sigue el comportamiento operativo de `Editar items formulados`:

- el registro puede arrancar como borrador
- al escribir `nombre`, se crea automáticamente el `Item Comercial`
- el resto de campos se completa después
- la hoja muestra estado de guardado (`Guardando...` / `Guardado`)
- no depende de un botón `Guardar`

### Asociaciones

- `Envases asociados` y `Etiquetas asociadas` quedan visibles una vez creado el borrador
- la relación se agrega desde la propia hoja
- la cantidad se edita inline y se guarda al salir del campo
- la casilla `Obligatorio` ya no se muestra en UI
