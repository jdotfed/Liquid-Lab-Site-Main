(() => {
  const config = window.LIQUID_LAB_ADMIN_CONFIG;
  const message = document.getElementById('orderMessage');
  const lookupMessage = document.getElementById('lookupMessage');
  if (!config?.supabaseUrl || !config?.supabasePublishableKey || !window.supabase) {
    message.textContent = 'Order lookup is temporarily unavailable.';
    message.classList.add('error');
    return;
  }
  const db = window.supabase.createClient(config.supabaseUrl, config.supabasePublishableKey);
  const panel = document.getElementById('orderPanel');
  const money = (amount, currency) => new Intl.NumberFormat('en-US', {
    style: 'currency', currency: String(currency || 'usd').toUpperCase()
  }).format(amount / 100);

  async function request(body) {
    const { data, error } = await db.functions.invoke('order-status', { body });
    if (!error && data?.order) return data.order;
    let detail = data?.error;
    if (!detail && error?.context?.json) {
      try { detail = (await error.context.json()).error; } catch { /* use default below */ }
    }
    throw new Error(detail || 'Could not find your order. Try again shortly.');
  }

  function showOrder(order) {
    document.getElementById('orderReference').textContent = order.reference;
    document.getElementById('orderAmount').textContent = money(order.amountTotal, order.currency);
    document.getElementById('discordStatus').textContent = order.discordLinked ? 'Linked at checkout' : 'Guest checkout';
    const items = document.getElementById('orderItems');
    items.replaceChildren();
    (order.items || []).forEach(item => {
      const li = document.createElement('li');
      li.textContent = `${item.name}${item.quantity > 1 ? ` ×${item.quantity}` : ''}`;
      items.append(li);
    });
    if (!items.children.length) {
      const li = document.createElement('li'); li.textContent = 'Stripe purchase'; items.append(li);
    }
    const states = ['paid', 'in_progress', 'completed'];
    const current = states.indexOf(order.serviceStatus);
    document.querySelectorAll('#progressSteps li').forEach((step, index) => {
      step.classList.toggle('done', index <= Math.max(0, current));
      step.querySelector('.step-icon').textContent = index <= Math.max(0, current) ? '✓' : String(index + 1);
    });
    document.getElementById('statusBadge').textContent = ({
      paid: 'Payment received', in_progress: 'In progress', completed: 'Completed'
    })[order.serviceStatus] || 'Payment received';
    panel.hidden = false;
    message.textContent = '';
    document.getElementById('lookupReference').value = order.reference;
  }

  document.getElementById('copyReference').addEventListener('click', async () => {
    const reference = document.getElementById('orderReference').textContent;
    try {
      await navigator.clipboard.writeText(reference);
      document.getElementById('copyMessage').textContent = 'Copied. Paste this in your ticket.';
    } catch {
      document.getElementById('copyMessage').textContent = 'Select the reference above to copy it.';
    }
  });

  document.getElementById('lookupForm').addEventListener('submit', async event => {
    event.preventDefault();
    const button = event.currentTarget.querySelector('button');
    button.disabled = true; lookupMessage.textContent = 'Looking up your order…'; lookupMessage.classList.remove('error');
    try {
      const order = await request({ action: 'lookup',
        email: document.getElementById('lookupEmail').value,
        reference: document.getElementById('lookupReference').value });
      showOrder(order); lookupMessage.textContent = '';
      panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (error) {
      lookupMessage.textContent = error.message;
      lookupMessage.classList.add('error');
    } finally { button.disabled = false; }
  });

  const sessionId = new URLSearchParams(location.search).get('session_id');
  if (sessionId) {
    message.textContent = 'Confirming your Stripe payment…';
    request({ action: 'session', sessionId }).then(order => {
      showOrder(order);
      try { localStorage.removeItem('liquidlab-cart-v1'); } catch { /* private browsing */ }
    }).catch(error => {
      message.textContent = error.message;
      message.classList.add('error');
    });
  }
})();
