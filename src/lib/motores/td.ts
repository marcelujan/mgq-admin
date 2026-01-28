// Motor minimo para pruebas (Proveedor TD)
// Reemplazar luego por scraping real (Playwright/Cheerio)

export type MotorResultStatus = "OK" | "WARNING" | "ERROR";

export type MotorResult = {
  status: MotorResultStatus;
  candidatos: any[];
  warnings: any[];
  errors: any[];
};

export async function scrapeTD(url: string): Promise<MotorResult> {
  const u = (url || "").trim();
  if (!u) {
    return {
      status: "ERROR",
      candidatos: [],
      warnings: [],
      errors: [{ code: "EMPTY_URL", message: "URL vacia" }],
    };
  }

  // Dummy: si parece URL de producto, devuelve un candidato.
  const looksLikeProduct = /producto|product|p\//i.test(u);
  if (!looksLikeProduct) {
    return {
      status: "WARNING",
      candidatos: [],
      warnings: [{ code: "NO_PRODUCT_PATTERN", message: "No se detecto patron de producto en URL" }],
      errors: [],
    };
  }

  return {
    status: "OK",
    candidatos: [
      {
        articulo_prov: null,
        descripcion: "Candidato TD (dummy)",
        presentacion: null,
        uom: "UN",
        costo_base_usd: null,
        fx_usado_en_alta: null,
        densidad: null,
        fecha_scrape_base: new Date().toISOString().slice(0, 10),
      },
    ],
    warnings: [],
    errors: [],
  };
}
