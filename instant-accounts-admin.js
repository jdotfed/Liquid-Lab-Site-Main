(() => {
  const config = window.LIQUID_LAB_ADMIN_CONFIG;
  const panel = document.getElementById('instantAccountsPanel');
  const productsHost = document.getElementById('instantProducts');
  const inventoryHost = document.getElementById('instantInventoryList');
  const deliveriesHost = document.getElementById('instantDeliveryList');
  const message = document.getElementById('instantMessage');
  if (!config || !window.supabase || !panel) return;
  const db = window.supabase.createClient(config.supabaseUrl, config.supabasePublishableKey);
  const gameLabels = { bo2_premade: 'BO2', bo3_premade: 'BO3', bo2_bo3_premade: 'BO2 + BO3' };
  let generation = 0;
  const money = cents => new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Number(cents || 0)/100);
  const text = (tag,value,className) => { const node=document.createElement(tag);node.textContent=value;if(className)node.className=className;return node; };
  function tell(value,error=false){message.textContent=value;message.classList.toggle('error',error);}
  function button(label,handler){const node=text('button',label);node.type='button';node.addEventListener('click',handler);return node;}
  async function invoke(action,payload={}){
    const {data,error}=await db.functions.invoke('instant-accounts',{body:{action,...payload}});
    if(error||data?.error)throw new Error(data?.error||error?.message||'Request failed.');return data;
  }
  function renderProducts(products,inventory){
    productsHost.replaceChildren();
    products.forEach(product=>{
      const count=inventory.filter(item=>item.product_key===product.product_key&&item.status==='available').length;
      const card=text('article','','instant-product');
      const head=text('div','','instant-product-head');const title=text('h3',product.display_name);
      head.append(title,text('span',`${count} available • ${product.stripe_payment_link_id?'Stripe verified':'Needs setup'}`));
      const form=document.createElement('form');
      const priceLabel=text('label','Price');const price=document.createElement('input');price.type='number';price.min='1';price.step='.01';price.required=true;price.value=product.price_cents?String(product.price_cents/100):'';priceLabel.append(price);
      const linkLabel=text('label','Stripe Payment Link');const link=document.createElement('input');link.type='url';link.placeholder='https://buy.stripe.com/...';link.value=product.checkout_url||'';linkLabel.append(link);
      const enabledLabel=text('label','','toggle-row');const enabled=document.createElement('input');enabled.type='checkbox';enabled.checked=product.enabled;enabledLabel.append(enabled,text('span','Show when inventory is available'));
      const save=text('button','Validate & Save','primary-button');save.type='submit';
      form.append(priceLabel,linkLabel,enabledLabel,save);
      form.addEventListener('submit',async event=>{
        event.preventDefault();save.disabled=true;tell('Checking the Stripe link and saving…');
        try{await invoke('admin_save_product',{productKey:product.product_key,priceCents:Math.round(Number(price.value)*100),checkoutUrl:link.value.trim(),enabled:enabled.checked});tell('Product saved. Public stock is updated.');await load();}
        catch(error){tell(error.message,true);}finally{save.disabled=false;}
      });
      card.append(head,form);productsHost.append(card);
    });
  }
  function renderInventory(rows){
    inventoryHost.replaceChildren();
    document.getElementById('instantInventoryCount').textContent=`${rows.filter(row=>row.status==='available').length} available`;
    if(!rows.length){inventoryHost.append(text('p','No accounts loaded yet.','instant-empty'));return;}
    rows.forEach(item=>{
      const row=text('article','','instant-row');const head=text('div','','instant-row-head');
      head.append(text('strong',item.label),text('small',item.status.replaceAll('_',' '),`instant-status ${item.status}`));
      row.append(head,text('p',`${gameLabels[item.product_key] || item.product_key} • Added by ${item.added_by}`),text('small',new Date(item.added_at).toLocaleString()));
      if(['available','disabled'].includes(item.status)){
        const actions=text('div','','instant-row-actions');const next=item.status==='available'?'disabled':'available';
        const action=button(next==='disabled'?'Disable':'Return to Stock',async()=>{
          action.disabled=true;tell('Updating inventory…');try{await invoke('admin_set_inventory',{inventoryId:item.id,status:next});tell('Inventory updated.');await load();}catch(error){tell(error.message,true);}finally{action.disabled=false;}
        });actions.append(action);row.append(actions);
      }
      inventoryHost.append(row);
    });
  }
  function renderDeliveries(rows){
    deliveriesHost.replaceChildren();
    if(!rows.length){deliveriesHost.append(text('p','No instant account purchases yet.','instant-empty'));return;}
    rows.forEach(delivery=>{
      const row=text('article','','instant-row');const head=text('div','','instant-row-head');
      head.append(text('strong',delivery.customer_email),text('small',delivery.status.replaceAll('_',' '),`instant-status ${delivery.status}`));
      row.append(head,text('p',`${gameLabels[delivery.product_key] || delivery.product_key} • ${delivery.checkout_session_id}`),
        text('small',`${new Date(delivery.purchased_at).toLocaleString()} • Email attempts: ${delivery.email_attempts}`));
      if(delivery.last_error)row.append(text('p',delivery.last_error));
      const actions=text('div','','instant-row-actions');
      if(['out_of_stock','failed','pending_email'].includes(delivery.status)){
        const fulfill=button(delivery.status==='out_of_stock'?'Fulfill Now':'Retry Delivery',()=>runDelivery(fulfill,'admin_fulfill',delivery.checkout_session_id));actions.append(fulfill);
      }
      if(['email_sent','opened'].includes(delivery.status)){
        const resend=button('Resend Secure Link',()=>runDelivery(resend,'admin_resend',delivery.checkout_session_id));actions.append(resend);
      }
      if(actions.childElementCount)row.append(actions);deliveriesHost.append(row);
    });
  }
  async function runDelivery(control,action,sessionId){
    control.disabled=true;tell(action==='admin_resend'?'Sending a fresh private link…':'Assigning inventory and sending delivery…');
    try{await invoke(action,{sessionId});tell('Delivery email sent.');await load();}catch(error){tell(error.message,true);}finally{control.disabled=false;}
  }
  async function load(){
    const current=++generation;
    try{
      const {data:{user}}=await db.auth.getUser();if(current!==generation)return;
      if(!user){panel.hidden=true;return;}
      const {data:access}=await db.rpc('liquidlab_my_admin_access');if(current!==generation)return;
      if(access?.role!=='owner'){panel.hidden=true;return;}
      panel.hidden=false;const snapshot=await invoke('admin_list');if(current!==generation)return;
      const available=snapshot.inventory.filter(item=>item.status==='available').length;
      document.getElementById('instantSummary').textContent=`${available} account${available===1?'':'s'} ready`;
      renderProducts(snapshot.products,snapshot.inventory);renderInventory(snapshot.inventory);renderDeliveries(snapshot.deliveries);
    }catch(error){if(current===generation)panel.hidden=true;}
  }
  document.getElementById('instantInventoryForm').addEventListener('submit',async event=>{
    event.preventDefault();const submit=event.currentTarget.querySelector('button[type="submit"]');submit.disabled=true;tell('Encrypting and adding account…');
    const value=id=>document.getElementById(id).value.trim();
    try{await invoke('admin_add_inventory',{productKey:value('instantProductKey'),label:value('instantLabel'),username:value('instantUsername'),loginEmail:value('instantLoginEmail'),loginPassword:value('instantLoginPassword'),recoveryEmail:value('instantRecoveryEmail'),recoveryPassword:value('instantRecoveryPassword'),notes:value('instantNotes')});event.currentTarget.reset();tell('Account encrypted and added to available stock.');await load();}
    catch(error){tell(error.message,true);}finally{submit.disabled=false;}
  });
  db.auth.onAuthStateChange(()=>{++generation;panel.hidden=true;setTimeout(()=>void load(),0);});
  document.getElementById('refreshButton')?.addEventListener('click',()=>setTimeout(()=>void load(),0));
  setInterval(()=>{if(!document.hidden)void load();},60000);
  setTimeout(()=>void load(),0);
})();
