'use strict';
const ListeningHistory = (() => {
  function melbourneMidnight(date) {
    const target=date.getTime();let instant=target;
    const formatter=new Intl.DateTimeFormat('en-GB',{timeZone:'Australia/Melbourne',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
    for(let i=0;i<4;i++){
      const p=Object.fromEntries(formatter.formatToParts(new Date(instant)).map(v=>[v.type,v.value]));
      const offset=Date.UTC(+p.year,+p.month-1,+p.day,+p.hour,+p.minute,+p.second)-instant;
      const next=target-offset;if(next===instant)break;instant=next;
    }
    return instant;
  }
  function bounds(start, end) {
    const parse = value => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Choose both a start and end date.');
      const [y,m,d] = value.split('-').map(Number), date = new Date(Date.UTC(y,m-1,d));
      if(date.getUTCFullYear()!==y || date.getUTCMonth()!==m-1 || date.getUTCDate()!==d) throw new Error('Choose valid dates.');
      return date;
    };
    const a=parse(start), b=parse(end);
    if(a>b)throw new Error('The end date must be on or after the start date.');
    if(melbourneMidnight(a)>Date.now())throw new Error('The start date cannot be in the future.');
    b.setUTCDate(b.getUTCDate()+1);
    return {from:Math.floor(melbourneMidnight(a)/1000),to:Math.floor(melbourneMidnight(b)/1000)};
  }
  async function topInRange({user,key,range,limit,signal,onProgress=()=>{},request=fetch}) {
    const counts=new Map();let pages=1,scrobbles=0;
    const to=Math.min(range.to,Math.floor(Date.now()/1000)+1);
    for(let page=1;page<=pages;page++) {
      const params=new URLSearchParams({method:'user.getrecenttracks',user,api_key:key,format:'json',from:String(range.from-1),to:String(to),limit:'200',page:String(page)});
      const r=await request('https://ws.audioscrobbler.com/2.0/?'+params,{signal:signal ? AbortSignal.any([signal,AbortSignal.timeout(30000)]) : AbortSignal.timeout(30000)});
      if(!r.ok)throw new Error(`Last.fm is unavailable (${r.status}). Try again later.`);
      const data=await r.json();if(data.error)throw new Error(data.message || 'Last.fm could not load this date range.');
      const recent=data.recenttracks;if(!recent)throw new Error('Last.fm returned an incomplete listening history. Please retry.');
      const total=Number(recent['@attr']?.totalPages);
      if(!Number.isSafeInteger(total)||total<0)throw new Error('Last.fm did not return a valid page count. Please retry.');
      if(page===1)pages=Math.max(1,total);
      const rows=Array.isArray(recent.track)?recent.track:recent.track?[recent.track]:[];
      for(const t of rows) {
        const timestamp=Number(t.date?.uts);
        if(t['@attr']?.nowplaying==='true'||!Number.isFinite(timestamp)||timestamp<range.from||timestamp>=to)continue;
        const artist=t.artist?.['#text'] || t.artist?.name;
        if(!t.name||!artist)continue;
        const identity=JSON.stringify([artist.normalize('NFC').toLowerCase(),t.name.normalize('NFC').toLowerCase()]);
        const item=counts.get(identity)||{name:t.name,artist,plays:0};item.plays++;counts.set(identity,item);scrobbles++;
      }
      onProgress({page,pages,scrobbles});
      if(page<pages)await new Promise(resolve=>setTimeout(resolve,250));
    }
    return [...counts.values()].sort((a,b)=>b.plays-a.plays||a.artist.localeCompare(b.artist)||a.name.localeCompare(b.name)).slice(0,limit).map(t=>({...t,selected:false,checked:false,match:null}));
  }
  return {bounds,topInRange};
})();
if(typeof module!=='undefined')module.exports=ListeningHistory;
