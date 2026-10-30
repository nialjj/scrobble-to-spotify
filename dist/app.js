'use strict';
const $ = id => document.getElementById(id);
const read = (store, key, fallback = null) => { try { return JSON.parse(store.getItem(key)) ?? fallback; } catch { return fallback; } };
let config = read(localStorage, 'scrobble-config', {});
let auth = read(sessionStorage, 'scrobble-auth');
let snapshot = read(sessionStorage, 'scrobble-draft', {});
let tracks = snapshot.tracks || [], busy = false, saved = false;
let rangeController = null, loadedSource = snapshot.source || '';
let loadedDescription = snapshot.description || (loadedSource ? `Top tracks from Last.fm user ${loadedSource}. Created with Scrobble to Spotify.` : '');
loadedDescription = loadedDescription.replaceAll('Australia/Sydney', 'Australia/Melbourne');
let pending = read(sessionStorage, 'scrobble-pending');
const redirectUri = location.origin + location.pathname;
const write = (key, value) => sessionStorage.setItem(key, JSON.stringify(value));
function notice(message, error = false) { $('status').textContent = message; $('status').classList.toggle('error', error); }
function remember() { write('scrobble-draft', {tracks, username:$('username').value,period:$('period').value,start:$('startDate').value,end:$('endDate').value,source:loadedSource,description:loadedDescription,limit:$('limit').value,name:$('playlistName').value}); }
function controls() {
  $('connect').textContent = auth ? 'Spotify connected' : 'Connect Spotify';
  $('connect').disabled = busy || !!auth;
  $('disconnect').hidden = !auth;
  $('disconnect').disabled = busy;
  $('setupButton').disabled = busy;
  for (const el of $('loadForm').elements) el.disabled = busy;
  $('cancelLoad').disabled = false;
  $('playlistName').disabled = busy || !!pending;
  $('create').disabled = busy || saved || !auth || (!pending && !tracks.some(t => t.selected && t.match));
  $('create').textContent = pending ? 'Retry saving tracks' : 'Create Spotify playlist';
  for (const el of document.querySelectorAll('.track input')) el.disabled = busy || !!pending || saved || !tracks[Number(el.dataset.index)]?.match;
}
function render() {
  $('descriptionPreview').textContent = loadedDescription;
  $('descriptionPreview').hidden = !loadedDescription;
  $('tracks').replaceChildren();
  $('count').textContent = `${tracks.filter(t => t.selected && t.match).length} selected / ${tracks.length}`;
  $('previewTitle').textContent = tracks.length ? `${$('username').value}’s top tracks` : 'Tracks';
  for (const [i,t] of tracks.entries()) {
    const row = document.createElement('div'); row.className = 'track';
    const check = document.createElement('input'); check.type = 'checkbox'; check.checked = !!t.selected; check.dataset.index = i; check.setAttribute('aria-label', `Include ${t.name} by ${t.artist}`);
    check.onchange = () => { t.selected = check.checked; remember(); render(); };
    const art = document.createElement(t.match?.album?.images?.length ? 'img' : 'span'); art.className = 'art';
    if (art.tagName === 'IMG') { art.src = t.match.album.images.at(-1).url; art.alt = ''; art.loading = 'lazy'; } else art.textContent = '♪';
    const text = document.createElement('div'), name = document.createElement('div'); name.className = 'song';
    if (t.match?.external_urls?.spotify) { const link = document.createElement('a'); link.href = t.match.external_urls.spotify; link.target = '_blank'; link.rel = 'noopener'; link.textContent = t.match.name; name.append(link); } else name.textContent = t.name;
    const artist = document.createElement('div'); artist.className = 'artist'; artist.textContent = t.match ? t.match.artists.map(a=>a.name).join(', ') : t.artist; text.append(name,artist);
    const meta = document.createElement('div'); meta.className = 'track-meta'; const count = document.createElement('div'); count.textContent = `${Number(t.plays).toLocaleString()} plays`; const state = document.createElement('div'); state.textContent = t.match ? 'Matched' : t.checked ? 'No exact match' : 'Awaiting Spotify'; if(t.match) state.className='match'; meta.append(count,state); row.append(check,art,text,meta); $('tracks').append(row);
  }
  controls();
}
function openSetup() { $('lastfmKey').value=config.key || ''; $('clientId').value=config.client || ''; $('redirect').textContent=redirectUri; $('setup').showModal(); }
$('setupButton').onclick=openSetup; $('closeSetup').onclick=()=>$('setup').close();
$('copyRedirect').onclick=async()=>{try{await navigator.clipboard.writeText(redirectUri); $('copyRedirect').textContent='Copied';}catch{$('copyRedirect').textContent='Select & copy';}};
$('settings').onsubmit=e=>{e.preventDefault(); const next={key:$('lastfmKey').value.trim(),client:$('clientId').value.trim()}; if(config.client!==next.client){auth=null;sessionStorage.removeItem('scrobble-auth');} config=next;localStorage.setItem('scrobble-config',JSON.stringify(config));$('setup').close();controls();notice('Setup saved. Enter a username or connect Spotify.');};
const base64 = bytes => btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
async function connect() {
  if(!config.client){openSetup();return;}
  busy=true;controls();
  try{remember(); const verifier=base64(crypto.getRandomValues(new Uint8Array(64))), state=base64(crypto.getRandomValues(new Uint8Array(24))); const challenge=base64(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier)))); write('scrobble-oauth',{verifier,state,redirect:redirectUri,client:config.client,at:Date.now()}); const url=new URL('https://accounts.spotify.com/authorize');url.search=new URLSearchParams({client_id:config.client,response_type:'code',redirect_uri:redirectUri,scope:'playlist-modify-private',state,code_challenge_method:'S256',code_challenge:challenge});location.assign(url);}catch(e){busy=false;notice(e.message,true);controls();}
}
$('connect').onclick=connect;
$('disconnect').onclick=()=>{auth=null;sessionStorage.removeItem('scrobble-auth');sessionStorage.removeItem('scrobble-oauth');controls();notice('Spotify disconnected.');};
async function tokenRequest(params) {
  const r=await fetch('https://accounts.spotify.com/api/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams(params),signal:AbortSignal.timeout(30000)}); const d=await r.json();if(!r.ok)throw new Error(d.error_description || 'Spotify sign-in failed. Check your Client ID and exact redirect URI.');auth={...d,refresh_token:d.refresh_token || auth?.refresh_token,expires:Date.now()+d.expires_in*1000};write('scrobble-auth',auth);
}
async function spotify(path, options={}) {
  if(!auth)throw new Error('Connect Spotify first.');
  if(Date.now()>auth.expires-30000){try{await tokenRequest({grant_type:'refresh_token',refresh_token:auth.refresh_token,client_id:config.client});}catch{auth=null;sessionStorage.removeItem('scrobble-auth');throw new Error('Your Spotify session expired. Connect Spotify again.');}}
  const r=await fetch('https://api.spotify.com/v1'+path,{...options,headers:{Authorization:`Bearer ${auth.access_token}`,'Content-Type':'application/json'},signal:AbortSignal.timeout(30000)});
  if(r.status===429)throw new Error(`Spotify is rate limiting requests. Wait ${r.headers.get('Retry-After') || '60'} seconds and try again.`);
  if(r.status===401){auth=null;sessionStorage.removeItem('scrobble-auth');throw new Error('Spotify session expired. Connect again.');}
  if(r.status===403)throw new Error('Spotify denied access. Check that your account is allowed in the developer app’s User Management and meets Spotify’s account requirements.');
  const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error?.message || `Spotify returned an error (${r.status}).`);return d;
}
const normalize = s=>s.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
const titleKey = s=>normalize(s.replace(/\s*[-–]\s*(?:\d{4}\s*)?remaster(?:ed)?(?:\s*\d{4})?\s*$/i,'').replace(/\s*\(remaster(?:ed)?(?:\s*\d{4})?\)\s*$/i,''));
async function matchTracks() {
  $('progress').hidden=false;$('progress').max=tracks.length;$('progress').value=0; const seen=new Set();
  try{for(let i=0;i<tracks.length;i++){const t=tracks[i];notice(`Matching Spotify tracks… ${i+1} of ${tracks.length}`);if(!t.checked){const q=`track:${t.name.replace(/"/g,'')} artist:${t.artist.replace(/"/g,'')}`;const d=await spotify('/search?'+new URLSearchParams({q,type:'track',limit:'10'}));t.match=(d.tracks?.items || []).find(m=>titleKey(m.name)===titleKey(t.name)&&m.artists.some(a=>normalize(a.name)===normalize(t.artist))) || null;t.checked=true;t.selected=!!t.match;}if(t.match){if(seen.has(t.match.uri))t.selected=false;seen.add(t.match.uri);}$('progress').value=i+1;remember();render();await new Promise(r=>setTimeout(r,180));}const matched=tracks.filter(t=>t.match).length;notice(`${matched} of ${tracks.length} tracks matched. Review your selection; unmatched tracks will be skipped.`);}finally{$('progress').hidden=true;}
}
function syncRange() {
  const custom=$('period').value==='custom';
  $('customRange').hidden=!custom;
  $('startDate').required=custom;$('endDate').required=custom;
  $('dateNote').textContent='Includes both dates in Melbourne time. Large ranges may take a while.';
}
$('period').onchange=()=>{syncRange();remember();};
$('startDate').onchange=remember;$('endDate').onchange=remember;
$('cancelLoad').onclick=()=>rangeController?.abort();
function rangeLabel() {return $('period').value==='custom' ? $('startDate').value+' to '+$('endDate').value : $('period').selectedOptions[0].textContent;}
function playlistDescription(username) {
  const zone='Australia/Melbourne';
  const today=new Date().toLocaleDateString('en-CA',{timeZone:zone});
  const period=$('period').value==='custom'
    ? `Date range: ${$('startDate').value} to ${$('endDate').value} (inclusive, ${zone}).`
    : `Period: ${rangeLabel()} as of ${today} (${zone}).`;
  return `Top tracks from Last.fm user ${username}. ${period} Created with Scrobble to Spotify.`;
}
$('loadForm').onsubmit=async e=>{
  e.preventDefault();if(!config.key){openSetup();return;}if(pending){notice('Finish retrying your existing playlist before loading another username.',true);return;}
  let range;try{if($('period').value==='custom')range=ListeningHistory.bounds($('startDate').value,$('endDate').value);}catch(e){notice(e.message,true);return;}
  busy=true;saved=false;$('success').hidden=true;tracks=[];render();notice('Fetching Last.fm listening history…');
  try{
    const username=$('username').value.trim();$('username').value=username;
    loadedSource=username+' · '+rangeLabel();
    loadedDescription=playlistDescription(username);
    if(range){
      rangeController=new AbortController();$('cancelLoad').hidden=false;$('progress').hidden=false;
      tracks=await ListeningHistory.topInRange({user:username,key:config.key,range,limit:Number($('limit').value),signal:rangeController.signal,onProgress:({page,pages,scrobbles})=>{notice('Reading listening history… page '+page+' of '+pages+' · '+scrobbles.toLocaleString()+' plays');$('progress').max=pages;$('progress').value=page;}});
      $('cancelLoad').hidden=true;$('progress').hidden=true;rangeController=null;
    }else{
      const r=await fetch('https://ws.audioscrobbler.com/2.0/?'+new URLSearchParams({method:'user.gettoptracks',user:username,api_key:config.key,period:$('period').value,limit:$('limit').value,format:'json'}),{signal:AbortSignal.timeout(30000)});
      if(!r.ok)throw new Error('Last.fm is unavailable ('+r.status+'). Try again later.');const d=await r.json();if(d.error)throw new Error(d.message || 'Last.fm could not find this user.');
      tracks=(d.toptracks?.track || []).map(t=>({name:t.name,artist:t.artist.name,plays:t.playcount,selected:false,checked:false,match:null}));
    }
    $('playlistName').value=loadedSource;remember();render();
    if(!tracks.length)notice('No listening history for this time range. Try a longer time range.');
    else if(auth)await matchTracks();else notice(tracks.length+' top tracks loaded. Connect Spotify to find matches.');
  }catch(e){notice(e.name==='AbortError'?'Loading cancelled. No playlist was created.':e.message==='Failed to fetch'?'Could not reach Last.fm or Spotify. Check your connection and try again.':e.message,e.name!=='AbortError');remember();}
  finally{rangeController=null;$('cancelLoad').hidden=true;$('progress').hidden=true;busy=false;controls();}
};
$('playlistName').oninput=remember;
function showPlaylist(message, playlist) {const box=$('success');box.replaceChildren();box.hidden=false;const p=document.createElement('span');p.textContent=message;const a=document.createElement('a');a.href=playlist.external_urls?.spotify || `https://open.spotify.com/playlist/${playlist.id}`;a.target='_blank';a.rel='noopener';a.textContent='Open in Spotify';box.append(p,a);}
$('create').onclick=async()=>{
  const name=$('playlistName').value.trim();if(!name){$('playlistName').focus();notice('Give your playlist a name first.',true);return;}busy=true;controls();notice('Saving your private playlist…');
  try{if(!pending){const uris=[...new Set(tracks.filter(t=>t.selected&&t.match).map(t=>t.match.uri))];if(!uris.length)throw new Error('Select at least one matched track.');const playlist=await spotify('/me/playlists',{method:'POST',body:JSON.stringify({name,public:false,description:loadedDescription})});pending={playlist,uris};write('scrobble-pending',pending);}await spotify(`/playlists/${encodeURIComponent(pending.playlist.id)}/items`,{method:'PUT',body:JSON.stringify({uris:pending.uris})});showPlaylist(`${pending.uris.length} tracks saved to your private playlist.`,pending.playlist);pending=null;sessionStorage.removeItem('scrobble-pending');saved=true;notice('Your playlist is ready. Load another listening history to create a new one.');}catch(e){notice(pending?`${e.message} Your playlist exists; use Retry saving tracks to finish without creating another playlist.`:`${e.message} If the request timed out, check your Spotify library before trying again.`,true);if(pending)showPlaylist('Playlist created. Tracks still need to be saved.',pending.playlist);}finally{busy=false;controls();}
};
async function init(){
  for(const [id,key] of [['username','username'],['period','period'],['startDate','start'],['endDate','end'],['limit','limit'],['playlistName','name']])if(snapshot[key])$(id).value=snapshot[key];
  syncRange();
  if(tracks.length)render();controls();
  if(pending)showPlaylist('A playlist is waiting for its tracks. Connect Spotify, then retry saving.',pending.playlist);
  const query=new URLSearchParams(location.search);if(query.has('code')||query.has('error')){busy=true;controls();const oauth=read(sessionStorage,'scrobble-oauth');history.replaceState({},'',redirectUri);try{if(query.has('error'))throw new Error('Spotify connection was cancelled. You can connect again.');if(!oauth||oauth.state!==query.get('state')||Date.now()-oauth.at>600000)throw new Error('Sign-in expired or could not be verified. Connect Spotify again.');await tokenRequest({grant_type:'authorization_code',code:query.get('code'),redirect_uri:oauth.redirect,client_id:oauth.client,code_verifier:oauth.verifier});notice('Spotify connected.');if(tracks.length&&!pending)await matchTracks();}catch(e){notice(e.message,true);}finally{sessionStorage.removeItem('scrobble-oauth');busy=false;controls();}}
}
init();
