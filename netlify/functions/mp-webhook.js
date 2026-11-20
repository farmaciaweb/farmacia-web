const { createClient } = require('@supabase/supabase-js');
exports.handler = async (event) => {
 if (event.httpMethod !== 'POST') return {statusCode:405,body:'Method not allowed'};
 try {
  const {MP_ACCESS_TOKEN,SUPABASE_URL,SUPABASE_SERVICE_ROLE_KEY}=process.env;
  if(!MP_ACCESS_TOKEN||!SUPABASE_URL||!SUPABASE_SERVICE_ROLE_KEY) return {statusCode:503,body:'Not configured'};
  const body=JSON.parse(event.body||'{}'); const paymentId=body?.data?.id; if(!paymentId) return {statusCode:200,body:'Ignored'};
  const r=await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`,{headers:{Authorization:`Bearer ${MP_ACCESS_TOKEN}`}}); const payment=await r.json(); if(!r.ok) throw new Error('Não foi possível consultar pagamento.');
  const orderId=payment.external_reference; if(!orderId) return {statusCode:200,body:'No external reference'};
  const status=payment.status==='approved'?'paid':payment.status==='rejected'?'payment_rejected':payment.status==='cancelled'?'cancelled':'pending_payment';
  const supabase=createClient(SUPABASE_URL,SUPABASE_SERVICE_ROLE_KEY);
  const {error}=await supabase.from('orders').update({status,payment_id:String(payment.id)}).eq('id',orderId); if(error) throw error;
  return {statusCode:200,body:'OK'};
 } catch(e) { return {statusCode:500,body:e.message||'Webhook error'}; }
};
