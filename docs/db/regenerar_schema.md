# Regenerar schema (snapshot)

Se genera un snapshot del schema Postgres (solo DDL, sin datos) para la base **v2**.

## Comando

```bash
pg_dump --schema=app --schema-only --no-owner --no-privileges "$DATABASE_URL" > schema_v2.sql
```

Notas:
- En Windows PowerShell, `>` redirige la salida a archivo.
- Si el archivo resultante aparece con bytes nulos, suele ser UTF-16; convertir a UTF-8 facilita diffs.
- Este snapshot se usa solo para documentación; no es un mecanismo de migración.
