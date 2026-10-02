(() => {
'use strict';
const $ = id => document.getElementById(id);
const config = window.LIQUID_LAB_ADMIN_CONFIG || {};
const base = String(config.supabaseUrl || '').replace(/\/$/, '');
const headers = { apikey: config.supabasePublishableKey || '' };
const pageSize = 12;
let reviews = [], summary = null, cursor = null, hasMore = false, featured = false, filter = 'all', rating = 'all', busy = false;
let generation = 0, refreshBusy = false;
const node = (tag, cls, text) => { const el=document.createElement(tag); if(cls)el.className=cls;if(text!==undefined)el.textContent=text;return el; };
function safeUrl(value, image = false) {
  if (!value) return null;
  try { const u = new URL(value, location.href); if(u.protocol !== 'https:' && !(u.origin===location.origin && u.protocol==='http:'))return null;
    if (!image) return ['discord.com','discord.gg'].includes(u.hostname) ? u.href : null;
    return u.origin===location.origin || u.origin===new URL(base).origin || ['cdn.discordapp.com','media.discordapp.net'].includes(u.hostname) ? u.href : null;
  } catch { return null; }
}
async function api(path, options={}) {
  if (!base || !headers.apikey) throw new Error('Reviews connection unavailable');
  const response = await fetch(`${base}/rest/v1/${path}`, { headers, signal:AbortSignal.timeout(12000), ...options });
  if (!response.ok) throw new Error('Reviews temporarily unavailable');return response.json();
}
function filterParams(params) {
  if(filter==='bo2')params.set('product','ilike.*BO2*');
  if(filter==='bo3')params.set('product','ilike.*BO3*');
  if(filter==='other')params.set('and','(product.not.ilike.*BO2*,product.not.ilike.*BO3*)');
  if(rating!=='all')params.set('rating',`eq.${rating}`);
}
async function fetchPage(after = null) {
  const p=new URLSearchParams({select:'id,display_name,avatar_url,product,price,rating,review_text,proof_path,source_url,created_at',visible:'eq.true',order:'created_at.desc,id.desc',limit:String(pageSize+1)});
  filterParams(p);
  if(after) p.set('or',`(created_at.lt.${after.created_at},and(created_at.eq.${after.created_at},id.lt.${after.id}))`);
  return api(`liquidlab_reviews?${p}`);
}
function showSummary(data) {
  summary=data;
  $('average').textContent=data.total ? Number(data.average).toFixed(1) : '—';
  $('total').textContent=Number(data.total).toLocaleString();
  $('stats-label').textContent=featured?'Featured customer stories':'From the Discord community';
  $('source-title').textContent=featured?'Community feedback':'Live from Discord';
  $('source-label').textContent=featured?'Previously shared customer stories':'New vouches appear automatically';
  $('count').textContent=String(data.total);
}
function proofUrl(r) {
  return safeUrl(r.proof_path ? `${base}/storage/v1/object/public/liquidlab-review-proof/${r.proof_path.split('/').map(encodeURIComponent).join('/')}` : r.proof_url, true);
}
function card(r) {
  const article=node('article','review-card');article.dataset.reviewId=r.id;
  const body=node('div','review-body'), top=node('div','review-top');
  const stars=node('span','stars','★'.repeat(r.rating)+'☆'.repeat(5-r.rating));stars.setAttribute('aria-label',`${r.rating} out of 5 stars`);
  top.append(stars,node('span','from-discord','Discord feedback'));
  body.append(top,node('p','review-text',`“${r.review_text}”`));
  const user=node('div','review-user'), avatar=node('div','avatar',r.display_name.split(/\s+/).map(x=>x[0]).slice(0,2).join('').toUpperCase());
  const url=safeUrl(r.avatar_url,true);
  if(url) { const image=node('img');image.src=url;image.alt='';image.loading='lazy';const initials=avatar.textContent;image.addEventListener('error',()=>{avatar.textContent=initials;},{once:true});avatar.replaceChildren(image); }
  const info=node('div','user-info');info.append(node('strong','',r.display_name),node('small','',r.product+(r.price?` · ${r.price}`:'')));user.append(avatar,info);body.append(user);article.append(body);
  const proof=proofUrl(r);
  if(proof) {
    const button=node('button','proof-button');button.type='button';button.setAttribute('aria-label',`View screenshot from ${r.display_name}`);
    const img=node('img');img.src=proof;img.alt=`Screenshot shared by ${r.display_name}`;img.loading='lazy';img.addEventListener('error',()=>button.remove(),{once:true});
    button.append(img,node('span','','View screenshot ↗'));button.addEventListener('click',()=>{
      $('proof-image').src=proof;$('proof-image').alt=img.alt;$('proof-caption').textContent=`${r.display_name} · ${r.product}`;
      $('proof-original').href=proof;$('proof-dialog').showModal();
    });article.append(button);
  }
  const footer=node('div','card-footer');
  const date=r.created_at?new Date(r.created_at):null;
  const time=node('time','',date ? date.toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'}) : 'Community story');if(date)time.dateTime=date.toISOString();footer.append(time);
  const source=safeUrl(r.source_url);if(source){const a=node('a','','View in Discord ↗');a.href=source;a.target='_blank';a.rel='noopener';footer.append(a);}article.append(footer);return article;
}
function render() {
  const visible=featured ? reviews.filter(r=>(rating==='all'||r.rating===Number(rating))&&(filter==='all'||filter==='bo2'&&/BO2/i.test(r.product)||filter==='bo3'&&/BO3/i.test(r.product)||filter==='other'&&!/BO[23]/i.test(r.product))) : reviews;
  $('review-grid').replaceChildren(...visible.map(card));$('review-grid').setAttribute('aria-busy','false');
  $('load-more').hidden=!hasMore||featured;
  $('end-note').textContent=visible.length&&!hasMore?(featured?'A selection of community feedback.':'You’re all caught up.') : '';
  if(!visible.length)$('status').textContent=featured?'No featured reviews match this filter.':'No reviews here yet. Check back after the next customer vouch.';
}
async function load(reset = false) {
  const requestGeneration=++generation;busy=true;$('load-more').disabled=true;
  if(reset){cursor=null;$('status').textContent='Loading customer feedback…';$('review-grid').setAttribute('aria-busy','true');}
  try {
    const rows=await fetchPage(reset?null:cursor);if(requestGeneration!==generation)return;
    const page=rows.slice(0,pageSize);hasMore=rows.length>pageSize;featured=false;
    reviews=reset?page:Array.from(new Map([...reviews,...page].map(r=>[r.id,r])).values());
    cursor=page.at(-1)||cursor;$('status').textContent='';render();
  } catch {
    if(requestGeneration!==generation)return;
    if(reset && !reviews.length) {
      try {const response=await fetch('reviews-featured.json',{signal:AbortSignal.timeout(10000)});if(!response.ok)throw new Error();const data=await response.json();if(requestGeneration!==generation)return;reviews=data;featured=true;hasMore=false;showSummary({total:data.length,average:data.length?data.reduce((sum,r)=>sum+r.rating,0)/data.length:null});render();}
      catch {$('review-grid').replaceChildren();$('review-grid').setAttribute('aria-busy','false');}
    }
    $('status').textContent=featured?'Showing featured feedback while the live feed reconnects.':'The live feed is reconnecting. Please try again shortly.';
    if(!reviews.length){$('load-more').hidden=false;$('load-more').textContent='Try again';}
  } finally {if(requestGeneration===generation){busy=false;$('load-more').disabled=false;}}
}
async function refresh() {
  if(busy||refreshBusy||document.hidden)return;refreshBusy=true;
  const g=generation;
  try {
    const [stats,latest]=await Promise.all([api('rpc/liquidlab_review_summary'),fetchPage()]);
    if(g!==generation)return;
    if(featured||!reviews.length){featured=false;hasMore=latest.length>pageSize;reviews=latest.slice(0,pageSize);cursor=reviews.at(-1)||null;}
    else {
      // Refetch the loaded window so moderation/deletions and new reviews are reflected,
      // while keeping keyset pagination accurate when many new reviews arrive.
      const p=new URLSearchParams({select:'id,display_name,avatar_url,product,price,rating,review_text,proof_path,source_url,created_at',visible:'eq.true',order:'created_at.desc,id.desc',limit:String(Math.max(pageSize,reviews.length)+1)});filterParams(p);
      const windowRows=await api(`liquidlab_reviews?${p}`);if(g!==generation)return;
      const size=Math.max(pageSize,reviews.length);reviews=windowRows.slice(0,size);hasMore=windowRows.length>size;cursor=reviews.at(-1)||null;
    }
    if(stats[0])showSummary(stats[0]);$('status').textContent='';render();
  } catch { if(g===generation&&!featured){$('source-label').textContent='Reconnecting to the latest feedback…';} }
  finally {refreshBusy=false;}
}
for(const button of document.querySelectorAll('[data-filter]'))button.addEventListener('click',()=>{
  filter=button.dataset.filter;for(const b of document.querySelectorAll('[data-filter]')){const on=b===button;b.classList.toggle('active',on);b.setAttribute('aria-pressed',String(on));}
  if(featured)render();else void load(true);
});
$('rating-filter').addEventListener('change',()=>{rating=$('rating-filter').value;if(featured)render();else void load(true);});
$('load-more').addEventListener('click',()=>{if(!busy)void load(!reviews.length);});
$('close-proof').addEventListener('click',()=>$('proof-dialog').close());
$('proof-dialog').addEventListener('click',event=>{const rect=$('proof-dialog').getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)$('proof-dialog').close();});
$('proof-dialog').addEventListener('close',()=>{$('proof-image').removeAttribute('src');});
void load(true);void api('rpc/liquidlab_review_summary').then(rows=>{if(!featured&&rows[0])showSummary(rows[0]);}).catch(()=>{});
setInterval(()=>void refresh(),30000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)void refresh();});
})();
