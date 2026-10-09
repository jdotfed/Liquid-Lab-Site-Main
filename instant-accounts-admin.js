(() => {
  const config=window.LIQUID_LAB_ADMIN_CONFIG;
  const panel=document.getElementById('instantAccountsPanel');
  if(!config || !window.supabase || !panel)return;
  const db=window.supabase.createClient(config.supabaseUrl,config.supabasePublishableKey);
  const productsHost=document.getElementById('instantProducts');
  const inventoryHost=document.getElementById('instantInventoryList');
  const deliveriesHost=document.getElementById('instantDeliveryList');
  const message=document.getElementById('instantMessage');
  const inventoryForm=document.getElementById('instantInventoryForm');
  const dialog=document.getElementById('instantAccountDialog');
  const dialogBody=document.getElementById('instantAccountDialogBody');
  const gameLabels={bo2_premade:'BO2',bo3_premade:'BO3',bo2_bo3_premade:'BO2 + BO3'};
  const settings=new Map();
  let generation=0,viewGeneration=0,busy=false,loading=false,queuedRefresh=false,owner=false,snapshot=null,submission=null;
  const text=(tag,value,className)=>{const node=document.createElement(tag);node.textContent=value;if(className)node.className=className;return node;};
  const labelFor=key=>gameLabels[key]||key;
  const mutable=item=>['available','disabled'].includes(item.status) && !item.assigned_session_id;
  const availableCount=key=>(snapshot?.counts||[]).filter(row=>row.status==='available' && (!key || row.product_key===key)).reduce((total,row)=>total+Number(row.ready_quantity ?? row.quantity),0);
  const tell=(value,error=false)=>{message.textContent=value;message.classList.toggle('error',error);};
  function button(label,handler,className='',mutates=false){const node=text('button',label,className);node.type='button';node.addEventListener('click',handler);if(mutates)node.dataset.inventoryMutation='true';return node;}
  function lock(value){busy=value;panel.querySelectorAll('[data-inventory-mutation],button[type="submit"],#instantInventoryForm input,#instantInventoryForm select,#instantInventoryForm textarea,#instantProducts input,#instantProducts textarea').forEach(node=>{node.disabled=value;});dialogBody.querySelectorAll('[data-inventory-mutation]').forEach(node=>{node.disabled=value;});}
  async function invoke(action,payload={}) {
    const {data,error}=await db.functions.invoke('instant-accounts',{body:{action,...payload}});
    if(error || data?.error) {
      let detail=data?.error;
      if(!detail && error?.context?.json){try{detail=(await error.context.json())?.error;}catch{}}
      if(error?.context?.status===403){closeDetails();}
      throw new Error(detail || error?.message || 'Request failed.');
    }
    return data;
  }
  async function mutate(action,payload,success){
    if(busy)return;lock(true);tell('Updating account inventory…');
    try{const data=await invoke(action,payload);tell(success);await load(true);return data;}
    catch(error){tell(error.message,true);return null;}
    finally{lock(false);}
  }
  function field(label,value,type='text',wide=false){
    const wrapper=text('label',label,wide?'wide-field':'');
    const input=document.createElement(type==='textarea'?'textarea':'input');
    if(type!=='textarea')input.type=type;
    else input.rows=6;
    input.value=value;wrapper.append(input);return {wrapper,input};
  }
  function renderProducts(products){
    for(const product of products){
      let ui=settings.get(product.product_key);
      if(!ui){
        const card=text('article','','instant-product');const head=text('div','','instant-product-head');
        const title=text('h3',product.display_name),status=text('span','');head.append(title,status);
        const form=document.createElement('form');
        const price=field('Price ($)','', 'number');price.input.min='.01';price.input.step='.01';price.input.placeholder='Set price';
        const link=field('Stripe Payment Link','', 'url');link.input.placeholder='https://buy.stripe.com/...';
        const included=field('What’s included — one item per line','','textarea',true);included.input.maxLength=10000;
        const toggle=text('label','','toggle-row');const enabled=document.createElement('input');enabled.type='checkbox';toggle.append(enabled,text('span','Enable checkout'));
        const save=text('button','Validate & Save','primary-button');save.type='submit';
        form.append(price.wrapper,link.wrapper,included.wrapper,toggle,save);card.append(head,form);productsHost.append(card);
        ui={card,form,title,status,price:price.input,link:link.input,included:included.input,enabled,dirty:false};settings.set(product.product_key,ui);
        form.addEventListener('input',()=>{ui.dirty=true;});
        form.addEventListener('submit',async event=>{
          event.preventDefault();if(busy)return;lock(true);tell('Checking the product and saving…');
          try{
            await invoke('admin_save_product',{productKey:product.product_key,priceCents:Math.round(Number(ui.price.value||0)*100),checkoutUrl:ui.link.value.trim(),enabled:ui.enabled.checked,includedItems:ui.included.value.split('\n').map(item=>item.trim()).filter(Boolean)});
            ui.dirty=false;tell('Product saved. Stock and included items are updated.');await load(true);
          }catch(error){tell(error.message,true);}finally{lock(false);}
        });
      }
      ui.title.textContent=product.display_name;
      ui.status.textContent=`${availableCount(product.product_key)} available • ${product.enabled?'Checkout enabled':product.stripe_payment_link_id?'Checkout paused':'Needs Stripe setup'}`;
      if(!ui.dirty){ui.price.value=product.price_cents?String(product.price_cents/100):'';ui.link.value=product.checkout_url||'';ui.enabled.checked=product.enabled;ui.included.value=(product.included_items||[]).join('\n');}
    }
  }
  function renderInventory(){
    if(!snapshot)return;
    inventoryHost.replaceChildren();
    document.getElementById('instantInventoryCount').textContent=`${availableCount()} available`;
    const term=document.getElementById('instantInventorySearch').value.trim().toLowerCase();
    const status=document.getElementById('instantInventoryStatus').value;
    const rows=snapshot.inventory.filter(item=>(status==='all'||item.status===status) && `${item.label} ${labelFor(item.product_key)} ${item.id}`.toLowerCase().includes(term));
    const total=(snapshot.counts||[]).reduce((sum,row)=>sum+Number(row.quantity),0);
    document.getElementById('instantInventoryHint').textContent=total>snapshot.inventory.length?`Showing ${rows.length} matching entries from the latest ${snapshot.inventory.length} of ${total}. Click an account to view its details.`:'Click an account to view its login details. Unused duplicates can be deleted.';
    if(!rows.length){inventoryHost.append(text('p',snapshot.inventory.length?'No accounts match this filter.':'No accounts loaded yet.','instant-empty'));return;}
    for(const item of rows){
      const row=text('article','','instant-row');row.dataset.inventoryId=item.id;
      const head=text('div','','instant-row-head');
      const title=button(item.label,()=>void viewDetails(item),'instant-inventory-title');
      head.append(title,text('small',item.status.replaceAll('_',' '),`instant-status ${item.status}`));
      row.append(head,text('p',`${labelFor(item.product_key)} • Added by ${item.added_by}`),text('small',`${new Date(item.added_at).toLocaleString()} • ID …${item.id.slice(-8)}`));
      if(item.duplicateCount>1)row.append(text('p',`${item.duplicateCount} entries share this login. Review and delete the unused duplicate.`, 'instant-duplicate-note'));
      if(item.needsReview)row.append(text('p','Account details need review. Open this entry to check it.','instant-duplicate-note'));
      const actions=text('div','','instant-row-actions');actions.append(button('View Details',()=>void viewDetails(item)));
      if(mutable(item)){
        const next=item.status==='available'?'disabled':'available';
        actions.append(button(next==='disabled'?'Disable':'Return to Stock',()=>void mutate('admin_set_inventory',{inventoryId:item.id,status:next},'Inventory updated.'),'',true),button('Delete',()=>void deleteInventory(item),'instant-delete',true));
      }
      row.append(actions);inventoryHost.append(row);
    }
  }
  async function deleteInventory(item){
    if(busy || !mutable(item))return;
    if(!window.confirm(`Delete “${item.label}” (ID …${item.id.slice(-8)}) from inventory?`))return;
    const result=await mutate('admin_delete_inventory',{inventoryId:item.id},'Inventory entry deleted. Stock is updated.');
    if(result)closeDetails();
  }
  function closeDetails(){++viewGeneration;if(dialog.open)dialog.close();dialogBody.replaceChildren();}
  async function copy(value,control){try{await navigator.clipboard.writeText(value);control.textContent='Copied';setTimeout(()=>{if(control.isConnected)control.textContent='Copy';},1800);}catch{control.textContent='Select and copy';}}
  function credentialField(label,value,secret=false){
    if(!value)return null;
    const wrapper=text('div','','instant-credential');wrapper.append(text('label',label));
    const controls=text('div','','instant-credential-controls');const input=document.createElement('input');input.value=value;input.readOnly=true;input.type=secret?'password':'text';input.setAttribute('aria-label',label);input.autocomplete='off';controls.append(input);
    if(secret){const show=button('Show',()=>{input.type=input.type==='password'?'text':'password';show.textContent=input.type==='password'?'Show':'Hide';});controls.append(show);}
    const copyButton=button('Copy',()=>void copy(value,copyButton));controls.append(copyButton);wrapper.append(controls);return wrapper;
  }
  async function viewDetails(item){
    if(!owner)return;
    const current=++viewGeneration;
    document.getElementById('instantAccountDialogTitle').textContent=item.label;
    dialogBody.replaceChildren(text('p','Loading account details…','instant-note'));
    if(!dialog.open)dialog.showModal();
    try{
      const data=await invoke('admin_view_inventory',{inventoryId:item.id});
      if(current!==viewGeneration || !dialog.open || !owner)return;
      const account=data.account;dialogBody.replaceChildren();
      dialogBody.append(text('p',`${labelFor(data.item.product_key)} • ${data.item.status.replaceAll('_',' ')} • ${new Date(data.item.added_at).toLocaleString()}`,'instant-note'),text('p',`Inventory ID: ${data.item.id}`,'instant-detail-id'));
      const fields=text('div','','instant-credential-grid');
      for(const [label,value,secret] of [['Username / PSN',account.username,false],['Login email',account.loginEmail,false],['Login password',account.loginPassword,true],['Recovery email',account.recoveryEmail,false],['Recovery password',account.recoveryPassword,true]]){const node=credentialField(label,value,secret);if(node)fields.append(node);}
      dialogBody.append(fields);
      if(account.notes){dialogBody.append(text('h3','Account notes'),text('p',account.notes,'instant-account-notes'));}
      if(mutable(data.item)){const actions=text('div','','instant-row-actions');actions.append(button('Delete This Entry',()=>void deleteInventory(data.item),'instant-delete',true));dialogBody.append(actions);}
      else dialogBody.append(text('p','Assigned accounts remain in delivery history.','instant-note'));
    }catch(error){if(current!==viewGeneration || !dialog.open)return;dialogBody.replaceChildren(text('p',error.message,'instant-duplicate-note'));if(mutable(item))dialogBody.append(button('Delete This Entry',()=>void deleteInventory(item),'instant-delete',true));}
  }
  function renderDeliveries(rows){
    deliveriesHost.replaceChildren();
    if(!rows.length){deliveriesHost.append(text('p','No instant account purchases yet.','instant-empty'));return;}
    for(const delivery of rows){
      const row=text('article','','instant-row');const head=text('div','','instant-row-head');head.append(text('strong',delivery.customer_email),text('small',delivery.status.replaceAll('_',' '),`instant-status ${delivery.status}`));
      row.append(head,text('p',`${labelFor(delivery.product_key)} • ${delivery.checkout_session_id}`),text('small',`${new Date(delivery.purchased_at).toLocaleString()} • Email attempts: ${delivery.email_attempts}`));
      if(delivery.last_error)row.append(text('p',delivery.last_error));
      const actions=text('div','','instant-row-actions');
      if(['out_of_stock','failed','pending_email'].includes(delivery.status))actions.append(button(delivery.status==='out_of_stock'?'Fulfill Now':'Retry Delivery',()=>void runDelivery('admin_fulfill',delivery.checkout_session_id),'',true));
      if(['email_sent','opened'].includes(delivery.status))actions.append(button('Resend Secure Link',()=>void runDelivery('admin_resend',delivery.checkout_session_id),'',true));
      row.append(actions);deliveriesHost.append(row);
    }
  }
  async function runDelivery(action,sessionId){
    if(busy)return;lock(true);tell('Processing delivery…');
    try{const data=await invoke(action,{sessionId});const status=data.result?.status;tell(['email_sent','opened'].includes(status)?'Delivery email sent.':status==='out_of_stock'?'No matching account is available. Add stock, then use Fulfill Now.':`Delivery status: ${status||'not completed'}.`,!['email_sent','opened'].includes(status));await load(true);}
    catch(error){tell(error.message,true);}finally{lock(false);}
  }
  function hasDraft(){return [...settings.values()].some(ui=>ui.dirty) || [...inventoryForm.querySelectorAll('input,textarea')].some(input=>input.value.length>0);}
  async function load(force=false){
    if(loading){if(force){queuedRefresh=true;++generation;}return;}
    if(!force && (busy || hasDraft() || dialog.open))return;
    loading=true;const current=++generation;
    try{
      const {data:{user},error:userError}=await db.auth.getUser();if(current!==generation)return;
      if(userError)throw userError;
      if(!user){owner=false;panel.hidden=true;closeDetails();return;}
      const {data:access,error:accessError}=await db.rpc('liquidlab_my_admin_access');if(current!==generation)return;
      if(accessError)throw accessError;
      if(access?.role!=='owner'){owner=false;panel.hidden=true;closeDetails();return;}
      owner=true;panel.hidden=false;
      const data=await invoke('admin_list');if(current!==generation)return;
      snapshot=data;
      if(!Array.isArray(snapshot.counts))snapshot.counts=snapshot.inventory.reduce((rows,item)=>{const found=rows.find(row=>row.product_key===item.product_key&&row.status===item.status);if(found)found.quantity++;else rows.push({product_key:item.product_key,status:item.status,quantity:1});return rows;},[]);
      document.getElementById('instantSummary').textContent=`${availableCount()} account${availableCount()===1?'':'s'} available`;
      renderProducts(snapshot.products);renderInventory();renderDeliveries(snapshot.deliveries);
    }catch(error){if(current===generation && owner){panel.hidden=false;tell(error.message,true);}else if(current===generation)panel.hidden=true;}
    finally{loading=false;if(queuedRefresh){queuedRefresh=false;void load(true);}}
  }
  inventoryForm.addEventListener('submit',async event=>{
    event.preventDefault();if(busy)return;
    const value=(id,trim=true)=>trim?document.getElementById(id).value.trim():document.getElementById(id).value;
    const payload={productKey:value('instantProductKey'),label:value('instantLabel'),username:value('instantUsername'),loginEmail:value('instantLoginEmail'),loginPassword:value('instantLoginPassword',false),recoveryEmail:value('instantRecoveryEmail'),recoveryPassword:value('instantRecoveryPassword',false),notes:value('instantNotes',false)};
    const signature=JSON.stringify(payload);
    if(!submission || submission.signature!==signature)submission={signature,id:crypto.randomUUID()};
    lock(true);tell('Encrypting and adding account…');
    try{const data=await invoke('admin_add_inventory',{...payload,requestId:submission.id});const productKey=payload.productKey;inventoryForm.reset();document.getElementById('instantProductKey').value=productKey;submission=null;tell(data.alreadyAdded?'This account was already saved. Inventory refreshed.':'Account encrypted and added to stock.');await load(true);}
    catch(error){tell(error.message,true);}finally{lock(false);}
  });
  document.getElementById('instantInventorySearch').addEventListener('input',renderInventory);
  document.getElementById('instantInventoryStatus').addEventListener('change',renderInventory);
  document.getElementById('instantAccountDialogClose').addEventListener('click',closeDetails);
  dialog.addEventListener('close',()=>{++viewGeneration;dialogBody.replaceChildren();});
  db.auth.onAuthStateChange((event)=>{if(event==='SIGNED_OUT'){++generation;owner=false;panel.hidden=true;snapshot=null;submission=null;inventoryForm.reset();closeDetails();settings.clear();productsHost.replaceChildren();inventoryHost.replaceChildren();deliveriesHost.replaceChildren();}else setTimeout(()=>void load(),0);});
  document.getElementById('refreshButton')?.addEventListener('click',()=>void load(true));
  setInterval(()=>{if(!document.hidden)void load();},60000);
  void load();
})();
