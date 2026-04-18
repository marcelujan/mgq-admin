BEGIN;

ALTER TABLE app.item_etiqueta
  ADD COLUMN IF NOT EXISTS ancho_mm integer,
  ADD COLUMN IF NOT EXISTS largo_mm integer;

UPDATE app.item_etiqueta
SET
  ancho_mm = COALESCE(ancho_mm, (regexp_match(medidas, '^\s*([0-9]+)\s*[xX]\s*([0-9]+)\s*$'))[1]::integer),
  largo_mm = COALESCE(largo_mm, (regexp_match(medidas, '^\s*([0-9]+)\s*[xX]\s*([0-9]+)\s*$'))[2]::integer)
WHERE medidas IS NOT NULL
  AND (ancho_mm IS NULL OR largo_mm IS NULL);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'item_etiqueta_ancho_mm_positive_ck'
      AND conrelid = 'app.item_etiqueta'::regclass
  ) THEN
    ALTER TABLE app.item_etiqueta
      ADD CONSTRAINT item_etiqueta_ancho_mm_positive_ck
      CHECK (ancho_mm IS NULL OR ancho_mm > 0);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'item_etiqueta_largo_mm_positive_ck'
      AND conrelid = 'app.item_etiqueta'::regclass
  ) THEN
    ALTER TABLE app.item_etiqueta
      ADD CONSTRAINT item_etiqueta_largo_mm_positive_ck
      CHECK (largo_mm IS NULL OR largo_mm > 0);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'item_etiqueta_medidas_pair_ck'
      AND conrelid = 'app.item_etiqueta'::regclass
  ) THEN
    ALTER TABLE app.item_etiqueta
      ADD CONSTRAINT item_etiqueta_medidas_pair_ck
      CHECK ((ancho_mm IS NULL) = (largo_mm IS NULL));
  END IF;
END $$;

COMMIT;
