import { sql } from '@/lib/db';
export async function PATCH(req:Request){
  const body=await req.json(); const productIds:number[]=body.productIds||[]; const setPct:number|null=body.setPct??null; const setFixed:number|null=body.setFixed??null;
  if(!Array.isArray(productIds)||productIds.length===0) return new Response('productIds required',{status:400});
  await sql.begin(async(trx)=>{
    for(const pid of productIds){
      await trx`
        UPDATE app.pricing_rules
           SET ganancia_variable_pct = COALESCE(${setPct}, ganancia_variable_pct),
               ganancia_fija_ars = COALESCE(${setFixed}, ganancia_fija_ars)
         WHERE product_id = ${pid}
           AND vigencia_desde <= CURRENT_DATE
           AND (vigencia_hasta IS NULL OR vigencia_hasta >= CURRENT_DATE)`;
      await trx`
        INSERT INTO app.pricing_rules (product_id, ganancia_fija_ars, ganancia_variable_pct, vigencia_desde)
        SELECT ${pid}, ${setFixed ?? 0}, ${setPct ?? 0}, CURRENT_DATE
        WHERE NOT EXISTS (
          SELECT 1 FROM app.pricing_rules r
          WHERE r.product_id=${pid}
            AND r.vigencia_desde <= CURRENT_DATE
            AND (r.vigencia_hasta IS NULL OR r.vigencia_hasta >= CURRENT_DATE)
        )`;
    }
  });
  return Response.json({ok:true});
}