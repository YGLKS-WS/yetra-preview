'use strict';

const root = document.querySelector('#kiosk');
const platforms = ['ps5', 'xbox', 'nintendo', 'ps4pro'];
const consoleBonus = {10: 2, 20: 3, 30: 4, 60: 5};
// Public copy: console pictures (manufacturer logos/products) removed
const consoleArt = {ps5:'art-controller.svg', xbox:'art-controller.svg', nintendo:'art-controller.svg', ps4pro:'art-controller.svg'};
const categories = [
  ['Consoles','console','art-controller.svg'], ['PC Gaming','pc','tile-pc.jpg'],
  ['Virtual Reality','vr','art-vr.svg'], ['Racing Simulators','racing','tile-racing.jpg'],
  ['Karaoke','karaoke','tile-karaoke.jpg'], ['VIP Events & Parties','events','tile-events.jpg'],
  ['VIP Movies','movies','tile-movies.jpg'], ['Streaming Booth','streaming','tile-streaming.jpg'],
  ['Card Games','cards','review-cards.svg','UNO and WHOT'], ['Drinks','drinks','tile-drinks-nov12.jpg'],
  ['Snacks & Treats','snacks','tile-snacks-nov12.jpg'], ['Accessories','accessories','art-headphones.svg'],
  ['Printing & Stationery','printing','tile-printing.jpg']
];
const groups = {
  pc: ['pc', 'pc_tournament'], vr: ['vr1', 'vr2', 'vr_both'],
  racing: ['sim1', 'sim2', 'sim_both', 'sim_vr'],
  karaoke: ['karaoke_single', 'karaoke_couple', 'karaoke_kids', 'karaoke_group', 'karaoke_family4', 'karaoke_family5'],
  events: ['vip_standard','vip_plus','vip_premium','hall_open','hall_exclusive'],
  streaming: ['streaming'], cards: ['games_table'], printing: ['printing','scan_copy','stationery']
};
const emailSettings = { gmailVerified: false, ownerEnabled: false };
const emailEnabled = emailSettings.gmailVerified && emailSettings.ownerEnabled;
const partyMinutes = 60;
const bookingStationLimits = {ps5: 4, xbox: 4, nintendo: 4, ps4pro: 4, sim1: 1, sim2: 1, sim_both: 1, sim_vr: 1, vr1: 1, vr2: 1, vr_both: 1};
const roomAddons = [30, 60].flatMap(minutes => ['Console', 'Karaoke'].map(kind => ({
  sku: 'room-' + kind + '-' + minutes, name: kind + ' · ' + minutes + ' minutes', service: 'room_addons',
  minutes, price: minutes * 10000 / 30
})));
const terms = 'No refunds. T&Cs apply. See the cashier for details.';
const samplePhone = '0240000000';
const sampleRef = 'BK-001';
const sampleOrderRef = 'DEMO-001';
const idleMs = 120000;
let catalogue, idleTimer, idleDeadline;
let page, history, cart, bookingLines, context, draft, listPage, details, method, network, ticket, verified, error, savedBookingLines;

function reset() {
  page = 'welcome'; history = []; cart = []; bookingLines = []; context = 'order';
  draft = {}; listPage = 0; details = {}; method = ''; network = ''; ticket = null;
  verified = false; error = ''; savedBookingLines = [];
  clearTimeout(idleTimer);
  idleDeadline = 0;
  render();
}

function scheduleReset() {
  clearTimeout(idleTimer);
  if (page === 'welcome') { idleDeadline = 0; return; }
  idleDeadline = Date.now() + idleMs;
  idleTimer = setTimeout(reset, idleMs);
}

function go(next, nextContext = context) {
  history.push({page, context, draft: {...draft}, listPage});
  page = next; context = nextContext; listPage = 0; error = '';
  scheduleReset();
  render();
}

function back() {
  const previous = history.pop();
  if (!previous) { reset(); return; }
  ({page, context, draft, listPage} = previous);
  error = '';
  scheduleReset();
  render();
}

const money = amount => 'GH₵ ' + (amount / 100).toFixed(2);
const products = service => service === 'room_addons' ? roomAddons : catalogue.products.filter(p => p.service === service);
const name = service => ({
  nintendo: 'Nintendo Switch', vr1: 'VR · Station 1', vr2: 'VR · Station 2',
  vr_both: 'VR · Both stations', sim_vr: 'Racing Simulator + VR'
}[service] || catalogue.services.find(s => s[0] === service)?.[2] || service);
const productName = p => p.name.replaceAll('PSVR2', 'VR');
function duration(mins) {
  const hours = Math.floor(mins / 60);
  const minutes = mins % 60;
  const hourText = hours ? hours + (hours === 1 ? ' hour' : ' hours') : '';
  const minuteText = minutes ? minutes + (minutes === 1 ? ' minute' : ' minutes') : '';
  return [hourText, minuteText].filter(Boolean).join(' ');
}
const total = lines => lines.reduce((sum, item) => sum + item.product.price * item.quantity + (item.addon?.price || 0), 0);
const activeLines = () => context === 'booking' ? bookingLines : cart;
const activeReview = () => context === 'booking' ? 'bookingReview' : 'review';
const unique = values => [...new Set(values)].sort((a,b) => a-b);
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const button = (text, action, css = '', disabled = false) => `<button class="${css}" data-action="${action}" ${disabled ? 'disabled' : ''}>${text}</button>`;
const grid = (cards, columns = 4, extra = '') => `<div class="grid ${extra}" style="--cols:${columns}">${cards.join('')}</div>`;
const tile = (title, action, subtitle = '', art) => button(
  `${art ? `<img src="assets/${art}" alt="">` : ''}
  <span class="tile-label"><span>${escape(title)}</span>${subtitle ? `<small>${escape(subtitle)}</small>` : ''}</span>`, action, 'tile'
);

function paged(items, pageSize, template, columns = 4) {
  const pages = Math.max(1, Math.ceil(items.length / pageSize));
  const start = listPage * pageSize;
  return grid(items.slice(start, start + pageSize).map((item, index) => template(item, start + index)), columns) +
    (pages > 1 ? `<nav class="pages" aria-label="Pages">${button('Previous','prev','',listPage === 0)}
      <span>${listPage + 1} of ${pages}</span>${button('Next','next','',listPage + 1 === pages)}</nav>` : '');
}

function fee(amount, provider) {
  if (!provider || !amount) return 0;
  if (provider === 'Visa') return amount <= 100 ? 1 : amount <= 2000 ? 10 : amount <= 5000 ? 25 : amount <= 10000 ? 50 : Math.round(amount / 100);
  return amount <= 100 ? 1 : amount <= 1000 ? 10 : amount <= 5000 ? 50 :
    amount <= (provider === 'MTN' ? 200000 : 100000) ? Math.round(amount / 100) : provider === 'MTN' ? 2000 : 1000;
}

function paymentQuote() {
  const amount = total(cart);
  const charge = fee(amount, network);
  return {amount, charge, payable: amount + charge};
}

function slotOptions() {
  const date = new Date();
  date.setDate(date.getDate() + 2);
  return Array.from({length: 3}, (_, index) => {
    const slot = new Date(date);
    slot.setHours(16, index * 30, 0, 0);
    return slot;
  });
}

const longDate = date => new Intl.DateTimeFormat('en-GB', {weekday:'long',day:'numeric',month:'long',year:'numeric'}).format(date).replace(',', '');
const clock = date => new Intl.DateTimeFormat('en-US',{hour:'numeric',minute:'2-digit',hour12:true}).format(date);

function stationSlots(minutes) {
  return slotOptions().filter((slot,index)=> +slot > Date.now() && index*30+minutes <= partyMinutes);
}
function dateFields() {
  const start = slotOptions()[0];
  const months = Array.from({length:12},(_,i)=>new Intl.DateTimeFormat('en-GB',{month:'long'}).format(new Date(2026,i,1)));
  const select = (label,key,values,current) => `<label>${label}<select data-field="${key}">${values.map(([value,text])=>`<option value="${value}" ${String(details[key]??current)===String(value)?'selected':''}>${text}</option>`).join('')}</select></label>`;
  return '<div class="form date-form">' +
    select('Day','day',Array.from({length:31},(_,i)=>[i+1,i+1]),start.getDate()) +
    select('Month','month',months.map((m,i)=>[i,m]),start.getMonth()) +
    select('Year','year',[start.getFullYear(),start.getFullYear()+1].map(y=>[y,y]),start.getFullYear()) + '</div>';
}
function beginService(service) {
  const available = products(service);
  if (!available.length) return;
  const players = unique(available.map(p => p.players).filter(Boolean));
  draft = {...draft, start:null, service, players: players.length === 1 ? players[0] : null, product: null, quantity: 1};
  go(players.length > 1 ? 'players' : 'duration');
}

function chooseProduct(product) {
  draft.product = product;
  if (context === 'booking' && draft.group === 'stations') go('stationQuantity');
  else if (['events','room','room_addons'].includes(draft.group)) go(draft.group === 'events' ? 'eventSlot' : 'confirmItem');
  else go('quantity');
}

function consoleNumber(index) {
  const service = cart[index].product.service;
  return cart.slice(0, index + 1).filter(item => item.product.service === service).length;
}

function matchingConsoles() {
  return cart.map((item, index) => ({item, index})).filter(({item}) => item.product.sku === draft.product.sku);
}

function addItem(consoleIndex = null) {
  if (!draft.product || draft.product.service.startsWith('movie_')) return;
  if (context === 'booking' && !verified) return;
  if (draft.group === 'stations' && (!bookingStationLimits[draft.service] ||
      draft.quantity > bookingStationLimits[draft.service] ||
      !stationSlots(draft.product.minutes).some(slot=>+slot===+draft.start))) return;
  if (consoleIndex === null) {
    activeLines().push({product:draft.product, quantity:draft.quantity, start:draft.start, station:context === 'booking' && draft.group === 'stations'});
  } else {
    cart[consoleIndex].quantity += draft.quantity;
  }
  go(activeReview());
}

function renderReview(lines) {
  const start = listPage * 2;
  const rows = lines.slice(start,start + 2).map((item,index) => {
    const i = start + index;
    return `<div class="panel"><div class="row"><span><strong>${item.quantity} ${item.station?(item.quantity===1?'station · ':'stations · '):'× '}${escape(productName(item.product))}</strong>
      ${context === 'order' && platforms.includes(item.product.service) ? `<br><small>Console ${consoleNumber(i)} · ${duration(item.quantity * item.product.minutes)} paid time</small>` : ''}
      ${item.start ? `<br><small>${longDate(item.start)} · ${clock(item.start)}</small>` : ''}</span>
      <strong>${money(total([item]))}</strong>${button('Remove selection','remove:'+i)}</div>
      ${context === 'order' && ['ps5','ps4pro'].includes(item.product.service) && products('accessories').some(p=>p.sku==='pulse3d-headset') ?
        `<div class="row"><span>Pulse 3D headset · ${money(products('accessories').find(p=>p.sku==='pulse3d-headset').price)}</span>
        ${button('No','pulseNo:'+i,item.addon?'':'selected')}${button('Yes','pulseYes:'+i,item.addon?'selected':'')}</div>` : ''}
    </div>`;
  }).join('');
  return rows + (lines.length > 2 ? `<nav class="pages">${button('Previous','prev','',listPage===0)}<span>${listPage+1} of ${Math.ceil(lines.length/2)}</span>${button('Next','next','',start+2>=lines.length)}</nav>`:'');
}

function field(label, key, type='text', source=details, placeholder='') {
  return `<label>${label}<input data-field="${key}" type="${type}" value="${escape(source[key])}" placeholder="${placeholder}" autocomplete="off"></label>`;
}

function content() {
  switch(page) {
    case 'welcome': return ['','',`<div class="welcome"><strong>Welcome</strong><span>to</span><strong>Yetra Gaming Lounge</strong>
      ${button('Tap to begin','experiences','primary')}<div class="actions">${button('My booking','lookup')}${button('My order','orderLookup')}</div></div>`];
    case 'experiences': return ['Choose your experience','',
      grid(categories.map(([title,key,art,subtitle])=>tile(title,'category:'+key,subtitle,art)),4,'experiences')];
    case 'stationTypes': return ['Choose your gaming station','Sample availability for this booking.',grid([
      tile('Console','stationKind:console'),tile('Racing simulator','stationKind:racing'),tile('Virtual reality','stationKind:vr'),
      button('PC · Ask the cashier','', 'tile', true)
    ])];
    case 'platforms': return [context==='booking'?'Choose a console for this booking':'Choose your console','',
      grid(platforms.map(s=>tile(name(s),'service:'+s,'',consoleArt[s])),4,'platforms')];
    case 'stationServices': return ['Choose a gaming station','',grid(groups[draft.stationKind].map(s=>tile(name(s),'service:'+s)))];
    case 'services': return ['Choose an option','',grid(groups[draft.group].map(s=>tile(name(s),'service:'+s)))];
    case 'movies': return ['VIP Movies','Unavailable for ordering',grid(['Single','Couple','Under 13'].map(kind=>button(kind+' · Unavailable','', 'tile',true)),3)];
    case 'players': return ['How many players?',name(draft.service),grid(unique(products(draft.service).map(p=>p.players).filter(Boolean)).map(n=>tile(n+' '+(n===1?'player':'players'),'players:'+n)))];
    case 'duration': {
      const choices=products(draft.service).filter(p=>(!draft.players||p.players===draft.players)&&(draft.group!=='stations'||stationSlots(p.minutes).length));
      const title = draft.service === 'games_table' ? 'Choose your card game' : 'Choose your time';
      return [title,name(draft.service),paged(choices,8,p=>{
        const bonus = platforms.includes(p.service) && consoleBonus[p.minutes];
        return tile(p.minutes?duration(p.minutes):productName(p),'product:'+p.sku,money(p.price)+(bonus?' · +'+bonus+' min bonus':''));
      })];
    }
    case 'items': {
      const items=products(draft.group).filter(p=>!p.addon_scope);
      return [draft.group==='drinks'?'Drinks':draft.group==='snacks'?'Snacks & Treats':draft.group==='room_addons'?'Room add-ons':'Accessories','',items.length?paged(items,8,p=>tile(productName(p),'product:'+p.sku,money(p.price))):'<p>Ask the cashier for help with accessories.</p>'];
    }
    case 'quantity':
    case 'stationQuantity': {
      const stations = page === 'stationQuantity';
      const consoleTime = !stations && context === 'order' && platforms.includes(draft.product.service);
      return [stations?'How many stations?':consoleTime?'How many sessions on one console?':'Choose a quantity',
        escape(productName(draft.product))+(consoleTime?' · Sessions run back-to-back. To play on another console, add it separately.':''),
        grid(Array.from({length:stations?bookingStationLimits[draft.service]:4},(_,i)=>i+1).map(n=>tile(String(n),'quantity:'+n,money(draft.product.price*n))))];
    }
    case 'consoleGroup': return ['Same console or another console?', 'Add time to a console already in your order, or play on another console at the same time.',
      paged([{index:null}, ...matchingConsoles()], 4, ({item,index}) => {
        if (!item) return tile('Another console', 'consoleGroup:new');
        return tile('Same console · Console '+consoleNumber(index), 'consoleGroup:'+index,
          duration(item.product.minutes*item.quantity)+' → '+duration(item.product.minutes*(item.quantity+draft.quantity)));
      })];
    case 'eventSlot': return ['Choose your event date and time','',dateFields()+grid(slotOptions().map((s,i)=>tile(clock(s),'slot:'+i)),3)];
    case 'stationSlot': return ['Choose a station start',longDate(slotOptions()[0]),grid(stationSlots(draft.product.minutes).map((s,i)=>tile(clock(s),'slot:'+i)),3)];
    case 'confirmItem': return ['Check your selection','',`<div class="panel"><h2>${escape(productName(draft.product))}</h2><p>${draft.group==='stations'?'Stations':context==='order'&&platforms.includes(draft.product.service)?'Sessions on one console':'Quantity'}: ${draft.quantity}</p>
      ${draft.start?`<p>${longDate(draft.start)} at ${clock(draft.start)}</p>`:''}<strong>${money(draft.product.price*draft.quantity)}</strong></div>`];
    case 'review':
    case 'bookingReview': return [page==='review'?'Your order':'Review booking additions','',activeLines().length ? renderReview(activeLines()) : '<p>There are no items here yet.</p>'];
    case 'details': return ['Guest details','',`<div class="form">${field('Name','name')}${field('Phone number','phone','tel')}
      ${emailEnabled?`${field('Email address','email','email')}<div><label class="check"><input type="checkbox" data-field="receipt" ${details.receipt?'checked':''}>Receipt</label><label class="check"><input type="checkbox" data-field="news" ${details.news?'checked':''}>News &amp; offers</label></div>`:''}</div>`];
    case 'payment': return ['How will you pay?','Pay at the cashier.',grid(['Cash','MoMo','Card'].map(m=>tile(m,'method:'+m)),3)];
    case 'network': return ['Choose your MoMo network','',grid(['MTN','Telecel','AT'].map(n=>tile(n,'network:'+n)),3)];
    case 'quote': {
      const {amount, charge, payable}=paymentQuote();
      return ['Review payment','',`<div class="panel"><div class="row"><span>Payment method</span><strong>${method}${network?' · '+network:''}</strong></div>
        <div class="row"><span>Order amount</span><strong>${money(amount)}</strong></div><div class="row"><span>Payment provider charge</span><strong>${money(charge)}</strong></div>
        <div class="row"><span>Total to pay at cashier</span><strong>${money(payable)}</strong></div></div><p>${terms}</p>`];
    }
    case 'ticket': return ['','',`<div class="panel ticket"><h1>PAYMENT PENDING</h1><strong>${sampleOrderRef}</strong>
      <p>Take your order number to the cashier.</p><p>${escape(ticket.method)} · Awaiting payment · ${money(ticket.total)}</p><p>${terms}</p></div>`];
    case 'lookup': return ['Find your booking','Enter both the booking reference and the phone number used for the booking.',`<div class="form">${field('Booking reference','reference','text',details,sampleRef)}${field('Booking phone number','bookingPhone','tel',details,samplePhone)}</div><p>Sample booking: ${sampleRef} · ${samplePhone}</p>`];
    case 'orderLookup': return ['Find your order','',`<div class="form">${field('Order number','orderReference','text',details,sampleOrderRef)}</div>`];
    case 'booking': return verified ? ['Your booking · '+sampleRef,longDate(slotOptions()[0]),`<div class="panel"><h2>VIP Standard</h2><p>Event starts at ${clock(slotOptions()[0])}</p><p>Sample booking balance: ${money(48600+total(savedBookingLines))}</p>${savedBookingLines.length?`<p>Saved additions · ${savedBookingLines.length} selections · ${money(total(savedBookingLines))}</p>`:''}</div>`] : ['Find your booking','',''];
    case 'bookingCategories': return ['Add to this booking','',grid([
      tile('Drinks','bookingGroup:drinks','','tile-drinks-nov12.jpg'),tile('Snacks & sweets','bookingGroup:snacks','','tile-snacks-nov12.jpg'),
      tile('Extend room time','bookingGroup:room'),tile('Extra gaming stations','bookingGroup:stations'),tile('Room add-ons','bookingGroup:room_addons')
    ])];
    default: return ['Yetra','',''];
  }
}

function footer() {
  switch(page) {
    case 'confirmItem': return button('Add to order','add','primary');
    case 'review': return button('Add another experience or item','experienceMore') + button('Continue','details','primary',!cart.length);
    case 'bookingReview': return button('Add another item','bookingCategories') + button('Save additions','saveBooking','primary',!bookingLines.length);
    case 'details': return button('Continue','validateDetails','primary');
    case 'quote': return button('Place order','place','primary');
    case 'ticket': return button('Done','reset','primary');
    case 'lookup': return button('Find booking','verify','primary');
    case 'orderLookup': return button('Find order','findOrder','primary');
    case 'booking': return verified ? button('Add to this booking','bookingCategories','primary') : '';
    case 'bookingCategories': return bookingLines.length ? button('Review additions','bookingReview','primary') : '';
    default: return '';
  }
}

function render() {
  if (!catalogue) return;
  const [title,sub,body]=content();
  root.innerHTML=`<header><img src="assets/yetra-logo.png" alt="Yetra Gaming Lounge"><span class="preview">Kiosk preview · Sample data</span>
    ${page==='ticket'?'':(page!=='welcome'?button('Back','back'):'')+button('Order ('+cart.reduce((n,item)=>n+item.quantity,0)+')','order')}</header>
    <main aria-label="${escape(title||'Yetra Gaming Lounge')}">${title?`<h1>${title}</h1>`:''}${sub?`<p>${sub}</p>`:''}${body}
    ${error?`<p role="alert" class="${page==='booking'?'status':'error'}">${escape(error)}</p>`:''}</main>
    <footer><small>Need help? Ask a Yetra staff member.</small><div class="actions">${activeLines().length&&!['quote','ticket','booking'].includes(page)?`<strong>${money(total(activeLines()))}</strong>`:''}${footer()}</div></footer>`;
}

function activate(action) {
  const [key,value]=action.split(':');
  switch(key) {
    case 'reset': reset(); break;
    case 'back': back(); break;
    case 'order': if (page!=='review') go('review', 'order'); break;
    case 'experienceMore': go('experiences', 'order'); break;
    case 'experiences': case 'details': case 'lookup': case 'orderLookup':
      go(key); break;
    case 'category':
      draft={group:value,quantity:1};
      go(value==='console'?'platforms':value==='movies'?'movies':groups[value]?'services':'items'); break;
    case 'stationKind':
      draft.stationKind=value;
      go(value==='console'?'platforms':'stationServices');
      break;
    case 'service': beginService(value); break;
    case 'players': draft.players=Number(value); go('duration'); break;
    case 'product': {
      const product=[...catalogue.products,...roomAddons].find(p=>p.sku===value);
      if(product && !product.service.startsWith('movie_')) chooseProduct(product);
      break;
    }
    case 'quantity':
      draft.quantity=Number(value);
      go(page==='stationQuantity'?'stationSlot':'confirmItem'); break;
    case 'slot':
      if(page==='stationSlot') draft.start=stationSlots(draft.product.minutes)[Number(value)];
      else {
        const base=slotOptions()[Number(value)];
        const day=Number(details.day??base.getDate()), month=Number(details.month??base.getMonth()), year=Number(details.year??base.getFullYear());
        draft.start=new Date(year,month,day,base.getHours(),base.getMinutes());
        if(draft.start.getDate()!==day) {error='Choose a valid event date.';render();break;}
      }
      if (+draft.start>Date.now()) go('confirmItem');
      else {error='Choose a future date and time.';render();}
      break;
    case 'add':
      if (context === 'order' && platforms.includes(draft.product.service) && matchingConsoles().length) go('consoleGroup');
      else addItem();
      break;
    case 'consoleGroup': addItem(value === 'new' ? null : Number(value)); break;
    case 'next': listPage++;render();break;
    case 'prev': listPage=Math.max(0,listPage-1);render();break;
    case 'remove':
      activeLines().splice(Number(value),1);
      listPage=Math.min(listPage,Math.max(0,Math.ceil(activeLines().length/2)-1));
      render();break;
    case 'pulseYes': case 'pulseNo':
      cart[Number(value)].addon=key==='pulseYes'?products('accessories').find(p=>p.sku==='pulse3d-headset'):null;render();break;
    case 'validateDetails':
      if(!details.name?.trim()||!/^[+0-9 ()-]{9,17}$/.test(details.phone||'')) {error='Enter your name and phone number.';render();}
      else go('payment');
      break;
    case 'method':
      method=value; network=value==='Card'?'Visa':'';
      go(value==='MoMo'?'network':'quote'); break;
    case 'network': network=value; go('quote');break;
    case 'place':
      if(cart.length && method && (method!=='MoMo'||network)) {
        ticket={method,total:paymentQuote().payable};
        cart=[];details={};draft={};history=[];page='ticket';scheduleReset();render();
      }
      break;
    case 'verify':
      verified=details.reference?.trim().toUpperCase()===sampleRef && details.bookingPhone?.replace(/[ ()-]/g,'')===samplePhone;
      if(verified) go('booking'); else {error='Enter the matching booking reference and phone number.';render();}
      break;
    case 'findOrder':
      if(ticket && details.orderReference?.trim().toUpperCase()===sampleOrderRef) go('ticket');
      else {error='No matching order in this kiosk session.';render();}
      break;
    case 'bookingCategories':
      if (verified) {go('bookingCategories', 'booking');draft={};}
      break;
    case 'bookingGroup':
      if(verified) {
        draft={group:value,quantity:1};
        if(value==='room') beginService('vip_standard'); else go(value==='stations'?'stationTypes':'items');
      }
      break;
    case 'bookingReview': if(verified) go('bookingReview');break;
    case 'saveBooking':
      if(verified && bookingLines.length) {
        savedBookingLines.push(...bookingLines);
        bookingLines=[];
        const bookingIndex = history.findLastIndex(entry => entry.page === 'booking');
        history = bookingIndex >= 0 ? history.slice(0, bookingIndex) : [];
        page='booking'; context='booking'; draft={}; listPage=0;
        error='Sample additions saved to your booking.';
        scheduleReset(); render();
      }
      break;
  }
}

root.addEventListener('click',event=> {
  const control=event.target.closest('button[data-action]');
  if(control && !control.disabled) activate(control.dataset.action);
});
root.addEventListener('input',event=>{
  if(event.target.dataset.field) details[event.target.dataset.field]=event.target.type==='checkbox'?event.target.checked:event.target.value;
});
for(const type of ['pointerdown','keydown','input']) document.addEventListener(type,()=>{if(page && page!=='welcome')scheduleReset();},true);
document.addEventListener('visibilitychange',()=>{if(idleDeadline && Date.now()>=idleDeadline)reset();});
fetch('catalogue.json').then(response=> {
  if(!response.ok) throw Error('Catalogue unavailable');
  return response.json();
}).then(data=>{catalogue=data;reset();}).catch(()=>{root.textContent='The preview catalogue could not load. Refresh to try again.';});
