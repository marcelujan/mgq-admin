-- Habilita el canal DIRECTO en app.publicacion
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'app'
      AND t.relname = 'publicacion'
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) ILIKE '%canal%'
  LOOP
    EXECUTE format('ALTER TABLE app.publicacion DROP CONSTRAINT %I', r.conname);
  END LOOP;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'app'
      AND t.relname = 'publicacion'
      AND c.conname = 'publicacion_canal_check'
  ) THEN
    ALTER TABLE app.publicacion
      ADD CONSTRAINT publicacion_canal_check
      CHECK (canal in ('DIRECTO', 'WEB', 'MERCADO_LIBRE'));
  END IF;
END $$;
