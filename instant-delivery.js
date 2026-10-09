(() => {
  const config = window.LIQUID_LAB_ADMIN_CONFIG;
  const select = document.getElementById('premiumAccountOption');
  const card = select?.closest('.product-card');
  const price = document.getElementById('premiumAccountPrice');
  const buy = document.getElementById('premiumAccountBuy');
  const stock = document.getElementById('premiumAccountStock');
  const includes = document.getElementById('premiumAccountIncludes');
  const includesTitle = document.getElementById('premiumAccountIncludesTitle');
  const availability = document.getElementById('premiumAccountAvailability');
  if (!config || !window.supabase || !select || !price || !buy || !stock) return;
  const db = window.supabase.createClient(config.supabaseUrl, config.supabasePublishableKey,
    { auth: { persistSession: false, autoRefreshToken: false } });
  const names = {bo2_premade:'BO2',bo3_premade:'BO3',bo2_bo3_premade:'BO2 + BO3'};
  const defaults = {
    bo2_premade:['Multiplayer:','All unlocks — calling cards, camos, emblems, and more','Master Prestige','Modded stats','Colored classes','2 modded trickshot classes — Class 1 and Class 2','Zombies:','Full recovery','Max rank','5 tally marks','All Navcards','Max bank','All quests completed','Modded career stats','All 14 Perma-Perks (Perma-Perks can be lost)'],
    bo3_premade:['BO3 pre-made modded PSN account','PS4 / PS5','Account login email and password','Private account delivery link sent by email'],
    bo2_bo3_premade:['One pre-made PSN account with BO2 + BO3','BO2 Multiplayer + Zombies','BO3 modded account setup','PS4 / PS5','One set of account login details','Private account delivery link sent by email']
  };
  let products = new Map();
  let state = 'loading';
  let loading = false;
  let choseInitial = false;
  let userSelected = false;
  const selectedProduct = () => products.get(select.selectedOptions[0]?.dataset.instantKey);
  const configured = product => Boolean(product?.enabled && Number(product.priceCents)>0 && /^https:\/\/buy\.stripe\.com\/[A-Za-z0-9_]+$/.test(product.checkoutUrl||''));
  function ready() {
    const product = selectedProduct();
    return state==='ready' && card.dataset.paused!=='true' && configured(product) && Number(product.stock)>0;
  }
  function renderSelection() {
    const option = select.selectedOptions[0];
    if (!option) return;
    const key = option.dataset.instantKey;
    const product = products.get(key);
    const paused = card.dataset.paused==='true';
    const count = Math.max(0,Number(product?.stock)||0);
    const items = Array.isArray(product?.includedItems) && product.includedItems.length ? product.includedItems : defaults[key] || [];
    if (includesTitle) includesTitle.textContent=`${names[key] || 'Selected'} account includes`;
    if (includes) {
      includes.replaceChildren();
      for (const item of items) {
        const li=document.createElement('li');
        const value=String(item).trim();
        li.textContent=value;
        includes.append(li);
      }
    }
    price.textContent=Number(product?.priceCents)>0 ? `$${(Number(product.priceCents)/100).toFixed(2)}` : '—';
    select.disabled=paused;
    select.setAttribute('aria-disabled',String(paused));
    let badge, message, button;
    if (paused) {badge='TEMPORARILY UNAVAILABLE';message='This listing is temporarily paused.';button='Temporarily Unavailable';}
    else if (state==='loading') {badge='CHECKING STOCK';message='Checking account availability…';button='Checking Stock';}
    else if (state==='error') {badge='STOCK UNAVAILABLE';message='Stock could not be checked. Refresh the page to try again.';button='Stock Unavailable';}
    else if (!configured(product)) {badge='NOT AVAILABLE YET';message='This account option is not available for checkout yet.';button='Unavailable';}
    else if (!count) {badge='SOLD OUT';message='This account option is sold out. Check back for new stock.';button='Sold Out';}
    else {badge=`${count} ACCOUNT${count===1?'':'S'} IN STOCK`;message='Instant delivery to the email you enter at Stripe checkout.';button='Buy • Instant Delivery';}
    stock.replaceChildren(document.createElement('i'),document.createTextNode(` ${badge}`));
    stock.style.color=ready()?'':'#a7a0af';
    if (availability) availability.textContent=message;
    buy.textContent=button;
    const arrow=document.createElement('span');arrow.textContent='→';buy.append(' ',arrow);
    buy.removeAttribute('target');buy.removeAttribute('rel');
    if (ready()) {
      buy.href=product.checkoutUrl;buy.removeAttribute('aria-disabled');buy.removeAttribute('tabindex');
      buy.style.pointerEvents='';buy.style.opacity='';buy.style.cursor='';
    } else {
      buy.removeAttribute('href');buy.setAttribute('aria-disabled','true');buy.setAttribute('tabindex','-1');
      buy.style.pointerEvents='none';buy.style.opacity='.55';buy.style.cursor='not-allowed';
    }
  }
  async function refresh() {
    if (loading) return;
    loading=true;
    try {
      const {data,error}=await db.functions.invoke('instant-accounts',{body:{action:'stock'}});
      if(error || !Array.isArray(data?.products)) throw new Error('Stock unavailable');
      products=new Map(data.products.map(product=>[product.productKey,product]));
      state='ready';
      for(const option of select.querySelectorAll('option[data-instant-key]')) {
        const key=option.dataset.instantKey, product=products.get(key), count=Math.max(0,Number(product?.stock)||0);
        const dollars=Number(product?.priceCents)/100;
        option.hidden=false;option.disabled=false;option.value=String(Number.isFinite(dollars)?dollars:0);
        option.dataset.stock=String(count);option.dataset.link=configured(product)?product.checkoutUrl:'';
        option.textContent=`${product?.displayName || `${names[key]} Pre-made Modded Account`}${Number(product?.priceCents)>0?` — $${dollars.toFixed(2)}`:''} — ${!configured(product)?'Not available yet':count?`${count} In Stock`:'Sold Out'}`;
        option.dataset.originalLabel=option.textContent;
      }
      if(!choseInitial && !userSelected) {
        const first=[...select.options].find(option=>configured(products.get(option.dataset.instantKey)) && Number(option.dataset.stock)>0);
        if(first) first.selected=true;
      }
      choseInitial=true;
      select.dispatchEvent(new Event('change',{bubbles:true}));
    } catch {
      state='error';
      for(const option of select.querySelectorAll('option[data-instant-key]')) {option.dataset.link='';option.dataset.stock='0';}
    } finally {loading=false;renderSelection();}
  }
  select.addEventListener('change',event=>{if(event.isTrusted)userSelected=true;queueMicrotask(renderSelection);});
  buy.addEventListener('click',event=>{if(!ready())event.preventDefault();});
  window.addEventListener('liquidlab:instant-controls-updated',renderSelection);
  window.addEventListener('liquidlab:products-updated',renderSelection);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)void refresh();});
  setInterval(()=>{if(!document.hidden)void refresh();},60000);
  renderSelection();void refresh();
})();
