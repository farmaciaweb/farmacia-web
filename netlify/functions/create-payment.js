const { createClient } = require('@supabase/supabase-js');
exports.handler = async (event) => {
 if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method not allowed' };
 const { MP_ACCESS_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SITE_URL } = process.env;
 if (!MP_ACCESS_TOKEN || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return { statusCode: 503, headers: {'Content-Type':'application/json'}, body: JSON.stringify({error:'Mercado Pago ainda não configurado no Netlify.'}) };
 try {
  const { order_id } = JSON.parse(event.body || '{}'); if (!order_id) throw new Error('Pedido não informado.');
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data: order, error } = await supabase.from('orders').select('*').eq('id', order_id).single(); if (error || !order) throw new Error('Pedido não encontrado.');
  const ids = order.items.map(x => Number(x.product_id));
  const { data: products, error: pErr } = await supabase.from('products').select('id,name,price,stock,active,category').in('id', ids); if (pErr || !products || products.length !== ids.length) throw new Error('Produto indisponível.');
  // Itens que exigem controle/receita não seguem para pagamento automático sem validação adequada.
  if (products.some(p => ['tarja','hormonios'].includes(p.category))) return { statusCode: 422, headers:{'Content-Type':'application/json'}, body:JSON.stringify({error:'Este pedido precisa de análise e validação de dispensação antes do pagamento.'}) };
  const items=[]; let total=0;
  for (const line of order.items) { const p=products.find(x=>String(x.id)===String(line.product_id)); const qty=Number(line.quantity); if(!p||!p.active||!Number.isInteger(qty)||qty<1||p.stock<qty) throw new Error('Estoque insuficiente ou produto indisponível.'); total += Number(p.price)*qty; items.push({title:p.name,quantity:qty,currency_id:'BRL',unit_price:Number(p.price)}); }
  const site=SITE_URL || `https://${event.headers.host}`;
  const r=await fetch('https://api.mercadopago.com/checkout/preferences',{method:'POST',headers:{Authorization:`Bearer ${MP_ACCESS_TOKEN}`,'Content-Type':'application/json'},body:JSON.stringify({items,payer:{name:order.customer_name,email:order.customer_email},external_reference:order.id,notification_url:`${site}/.netlify/functions/mp-webhook`,back_urls:{success:`${site}/?pagamento=sucesso`,failure:`${site}/?pagamento=falhou`,pending:`${site}/?pagamento=pendente`},auto_return:'approved'})});
  const pref=await r.json(); if(!r.ok) throw new Error(pref.message || 'Falha ao criar preferência no Mercado Pago.');
  const {error:updateError}=await supabase.from('orders').update({total,payment_preference_id:pref.id}).eq('id',order.id); if(updateError) throw updateError;
  return {statusCode:200,headers:{'Content-Type':'application/json'},body:JSON.stringify({init_point:pref.init_point})};
 } catch(e) { return {statusCode:400,headers:{'Content-Type':'application/json'},body:JSON.stringify({error:e.message || 'Erro ao criar pagamento.'})}; }
};
