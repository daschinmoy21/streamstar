'use strict';
const $=id=>document.getElementById(id);
let state=null,history=[],generation=0,selected='gated',metric='linf',view='overview',busy=false;
const visible=new Set(['hybrid','adaptive','gated']);
const fmt=(n,d=3)=>Number.isFinite(n)?n.toFixed(d):'—';
const int=n=>new Intl.NumberFormat('en',{maximumFractionDigits:0}).format(n||0);
const bytes=n=>n>=1048576?`${fmt(n/1048576,1)} MB`:n>=1024?`${fmt(n/1024,1)} KB`:`${int(n)} B`;
function result(id=selected,round=state?.latest){return round?.results.find(r=>r.id===id)}
function method(id){return state?.methods.find(m=>m.id===id)}
function safe(text){return String(text).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
async function poll(){
  try{
    const since=history.at(-1)?.number||0;
    const response=await fetch(`/api/state?since=${since}&generation=${generation}`);
    if(!response.ok)throw new Error(`Engine returned ${response.status}`);
    const next=await response.json();
    if(generation!==next.generation){history=[];generation=next.generation}
    history.push(...next.history);history=history.slice(-120);state=next;
    document.body.classList.remove('offline');render();
  }catch(err){$('run-status').textContent='Disconnected';$('footer-status').textContent=err.message;document.body.classList.add('offline')}
}
async function control(action,config){
  if(busy)return;busy=true;
  try{const response=await fetch('/api/control',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,...(config?{config}:{})})});if(!response.ok)throw new Error(await response.text());await poll()}
  catch(err){const target=action==='reset'?$('settings-error'):$('error-notice');target.textContent=err.message;target.hidden=false}
  finally{busy=false}
}
function render(){
  const c=state.config,r=result(),latest=state.latest;
  $('method-list').innerHTML=state.methods.map(m=>`<button class="method-button ${m.id===selected?'selected':''}" data-method="${m.id}" aria-pressed="${m.id===selected}"><i class="color-dot" style="background:${m.color}"></i><span>${m.id==='gated'?'Adaptive + private gate':safe(m.name)}${m.id==='privsketch'?'<small>Conditional privacy · presence</small>':''}</span>${m.id===selected?'<span class="selected-indicator">↗</span>':''}</button>`).join('');
  $('source-name').textContent=state.source==='synthetic'?'Synthetic source connected':`${state.source} source`;
  $('mobile-method-picker').innerHTML=state.methods.map(m=>`<option value="${m.id}" ${m.id===selected?'selected':''}>${safe(m.name)}</option>`).join('');
  $('seed-label').textContent=`SEED ${c.seed}`;
  $('scenario-name').textContent=state.source==='synthetic'?(c.drift_every?'Drifting Zipf stream':'Stationary Zipf stream'):`${state.source[0].toUpperCase()+state.source.slice(1)} event stream`;
  $('scenario-meta').textContent=`${int(c.clients)} client groups · ${int(c.domain)}-item domain · ${c.window_rounds} cohorts`;
  $('round-badge').textContent=`ROUND ${String(latest?.number||0).padStart(3,'0')}`;
  $('run-status').innerHTML=`<i></i> ${state.running?'Live experiment':'Paused'}`;$('run-status').classList.toggle('paused',!state.running);
  $('play-button').textContent=state.running?'Ⅱ Pause stream':'▶ Resume stream';
  const controllable=state.source==='synthetic'||state.source==='replay';
  $('play-button').disabled=!controllable;$('step-button').disabled=!controllable;$('drift-button').disabled=state.source!=='synthetic';
  $('settings-button').disabled=state.source!=='synthetic';
  $('error-notice').hidden=!state.error;$('error-notice').textContent=state.error||'';
  $('kpi-error').textContent=r?fmt(r.metrics.linf,4):'—';
  $('error-tag').textContent=r?(r.metrics.linf<=c.target_error?'Within target accuracy':'Above target accuracy'):'Waiting for first window';
  $('error-tag').style.color=r&&r.metrics.linf>c.target_error?'#dfb993':'#68d9be';
  $('selected-name').textContent=method(selected)?.name||'';
  $('kpi-epsilon').innerHTML=`${r?fmt(r.epsilon,2):'—'} <small>/ ${fmt(c.epsilon_limit,0)}</small>`;
  $('budget-fill').style.width=`${Math.min(100,(r?.epsilon||0)/c.epsilon_limit*100)}%`;
  $('budget-fill').style.background=r?.exhausted?'#fbbf24':'#2dd4bf';
  $('remaining-budget').textContent=r?.exhausted?'Budget exhausted':`${fmt(100*(1-(r?.epsilon||0)/c.epsilon_limit),0)}% budget remaining`;
  $('kpi-width').innerHTML=`${r?.width||'—'} <small>buckets</small>`;
  $('width-tag').textContent=r?.adaptive?'Selected from private probe':'Fixed experimental layout';
  $('sketch-size').textContent=`${c.rows} rows · ${bytes(r?.memory_bytes||0)}`;
  $('kpi-throughput').innerHTML=`${latest?int(latest.throughput):'—'} <small>evt/s</small>`;
  $('latency-tag').textContent=`${fmt(latest?.latency_ms,1)} ms per round`;
  $('window-count').textContent=`${int(latest?.window_events)} events in window`;
  $('accuracy-caption').textContent=latest?`${history.length} rounds shown · ${latest.phase}`:'Waiting for streaming events';
  const gate=result('gated');
  $('release-count').innerHTML=`${gate?.releases||0} <small>of ${latest?.number||0} rounds</small>`;
  $('release-grid').innerHTML=history.slice(-60).map(round=>{const g=result('gated',round);return `<span class="release-cell ${g.released?'published':''} ${round.injected_drift?'injected':''}" title="Round ${round.number}: ${safe(g.reason)}"></span>`}).join('');
  $('release-reason').textContent=gate?.reason||'Awaiting a private probe';$('staleness').textContent=`${gate?.staleness||0} rounds`;
  $('query-count').textContent=`${gate?.ledger.probe_queries||0} / ${gate?.ledger.release_queries||0}`;
  $('fit-alpha').textContent=`Zipf α ${gate?.fit.alpha?fmt(gate.fit.alpha,2):'—'}`;
  $('communication-caption').textContent=r?`${bytes(r.bytes_per_client)} / client this round · ${bytes(r.total_bytes)} total`:'Includes both helper shares';
  $('heavy-subtitle').textContent=r?`${r.target} · ${r.name}`:'Estimated leaders in the current window';
  const maxValue=Math.max(.0001,...(r?.top||[]).flatMap(item=>[item.estimate,item.truth]));
  $('heavy-body').innerHTML=r?r.top.map(item=>`<tr><td>item_${String(item.id).padStart(3,'0')}</td><td>${fmt(item.estimate,4)}</td><td>${fmt(item.truth,4)}</td><td class="delta">${item.estimate>=item.truth?'+':''}${fmt(item.estimate-item.truth,4)}</td><td><div class="frequency-bars"><i style="width:${Math.max(0,item.estimate/maxValue*100)}%"></i><i class="truth" style="width:${item.truth/maxValue*100}%"></i></div></td></tr>`).join(''):'<tr><td colspan="5" class="empty-row">Waiting for the first streaming window…</td></tr>';
  $('comparison-body').innerHTML=(latest?.results||[]).map(r=>`<tr class="${r.id===selected?'selected':''}"><td><i class="color-dot" style="background:${r.color}"></i>${safe(r.name)}<small>${safe(r.target)} · ${safe(r.privacy)}</small></td><td>${fmt(r.metrics.linf,4)}</td><td>${fmt(r.metrics.mse,6)}</td><td>${fmt(r.metrics.ncr,3)}</td><td>${fmt(r.metrics.top_k_recall*100,0)}%</td><td>${r.width}</td><td class="${r.exhausted?'exhausted':''}">${fmt(r.epsilon,2)}${r.id==='privsketch'?'*':''}</td><td>${r.releases}</td><td>${bytes(r.bytes_per_client)}</td><td>${fmt(r.latency_ms,1)} ms</td></tr>`).join('');
  $('privacy-body').innerHTML=(latest?.results||[]).map(r=>`<tr><td><i class="color-dot" style="background:${r.color}"></i>${safe(r.name)}</td><td class="${r.id==='privsketch'?'conditional':''}">${safe(r.privacy)}</td><td>${r.ledger.probe_queries}</td><td>${r.ledger.release_queries}</td><td>${fmt(r.ledger.rho,4)}</td><td>${fmt(r.ledger.pure_epsilon,2)}</td><td>${fmt(r.epsilon,2)}${r.id==='privsketch'?'*':''}</td><td class="${r.exhausted?'exhausted':''}">${r.exhausted?'Cap reached':r.id==='privsketch'?'Conditional only':'Active'}</td></tr>`).join('');
  $('privacy-contribution').textContent=`Each client group contributes at most ${c.contribution_cap} events per cohort, across ${c.window_rounds} sliding cohorts. Public domain: ${int(c.domain)} items; public population: ${int(c.clients)} groups.`;
  $('footer-status').textContent=latest?`${int(latest.events)} events processed · ${int(latest.clipped)} clipped this round`:'Connected · waiting for first round';
  legend('accuracy-legend');legend('privacy-legend');drawCharts();
}
function legend(id){$(id).innerHTML=(state?.methods||[]).map(m=>`<button class="${visible.has(m.id)?'enabled':''}" data-series="${m.id}" aria-pressed="${visible.has(m.id)}"><i class="color-dot" style="background:${m.color}"></i>${safe(m.name)}</button>`).join('')}
function chart(id,series,getValue,{target=null,step=false,height=242}={}){
  const svg=$(id),width=Math.max(240,svg.clientWidth),pad={left:51,right:19,top:14,bottom:32},w=width-pad.left-pad.right,h=height-pad.top-pad.bottom;
  svg.setAttribute('viewBox',`0 0 ${width} ${height}`);
  const values=history.flatMap(round=>series.map(m=>getValue(result(m.id,round)))).filter(Number.isFinite);
  let ymax=Math.max(target||0,...values,step?state.config.width:0,.001)*1.17;
  if(!history.length){svg.innerHTML=`<text x="${width/2}" y="${height/2}" text-anchor="middle" class="chart-empty">The next window starts the story.</text>`;return}
  if(step)ymax=Math.max(state.config.max_width,ymax);
  const x=i=>pad.left+(history.length===1?w/2:i*w/(history.length-1)),y=v=>pad.top+h-Math.max(0,v)/ymax*h;
  let markup='';
  for(let i=0;i<=4;i++){const value=ymax*i/4,yy=y(value);markup+=`<line x1="${pad.left}" x2="${width-pad.right}" y1="${yy}" y2="${yy}" stroke="#283142" stroke-dasharray="3 4"/><text x="${pad.left-10}" y="${yy+3}" text-anchor="end" fill="#687a94" font-size="8" font-family="monospace">${step?Math.round(value):fmt(value,value<.01?4:2)}</text>`}
  const tickCount=Math.min(6,history.length);
  for(let i=0;i<tickCount;i++){const index=tickCount===1?0:Math.round(i*(history.length-1)/(tickCount-1));markup+=`<text x="${x(index)}" y="${height-10}" text-anchor="middle" fill="#687a94" font-size="8" font-family="monospace">${String(history[index].number).padStart(2,'0')}</text>`}
  history.forEach((round,i)=>{if(round.injected_drift)markup+=`<line x1="${x(i)}" x2="${x(i)}" y1="${pad.top}" y2="${pad.top+h}" stroke="#c8993e" stroke-dasharray="3 4" opacity=".55"/>`});
  if(target!==null)markup+=`<line x1="${pad.left}" x2="${width-pad.right}" y1="${y(target)}" y2="${y(target)}" stroke="#748c7b" stroke-dasharray="5 5" opacity=".6"/><text x="${width-pad.right}" y="${y(target)-5}" text-anchor="end" fill="#819b8a" font-size="7">target ${target}</text>`;
  series.forEach(m=>{let path='';history.forEach((round,i)=>{const value=getValue(result(m.id,round));if(!Number.isFinite(value))return;const xx=x(i),yy=y(value);path+=i===0?`M ${xx} ${yy}`:step?` H ${xx} V ${yy}`:` L ${xx} ${yy}`});markup+=`<path d="${path}" fill="none" stroke="${m.color}" stroke-width="${m.id==='gated'?2.3:1.6}" stroke-linejoin="round" stroke-linecap="round" opacity="${m.id==='gated'?1:.85}"/>`;const last=getValue(result(m.id,history.at(-1)));if(Number.isFinite(last))markup+=`<circle cx="${x(history.length-1)}" cy="${y(last)}" r="3" fill="${m.color}"/>`});
  svg.innerHTML=markup;
  if(id==='accuracy-chart'){svg.onpointermove=event=>{const box=svg.getBoundingClientRect(),index=Math.max(0,Math.min(history.length-1,Math.round(((event.clientX-box.left)-pad.left)/w*(history.length-1))));const round=history[index],tooltip=$('accuracy-tooltip');tooltip.innerHTML=`<strong>ROUND ${round.number}${round.injected_drift?' · DRIFT':''}</strong>`+series.map(m=>`<div style="color:${m.color}">${safe(m.name)} ${fmt(getValue(result(m.id,round)),4)}</div>`).join('');tooltip.hidden=false;tooltip.style.left=`${Math.max(0,Math.min(width-210,event.clientX-box.left+10))}px`;tooltip.style.top='30px'};svg.onpointerleave=()=>{$('accuracy-tooltip').hidden=true}}
}
function drawCharts(){if(!state)return;const series=state.methods.filter(m=>visible.has(m.id));chart('accuracy-chart',series,r=>r?.metrics[metric],{target:metric==='linf'?state.config.target_error:null,height:$('accuracy-chart').clientHeight});chart('width-chart',state.methods.filter(m=>m.id==='adaptive'||m.id==='gated'),r=>r?.width,{step:true,height:$('width-chart').clientHeight});if(view==='privacy')chart('privacy-chart',series,r=>r?.epsilon,{target:state.config.epsilon_limit,height:$('privacy-chart').clientHeight});const vals=history.slice(-20).map(round=>result(selected,round)?.metrics.linf||0);const max=Math.max(.001,...vals);$('error-spark').setAttribute('viewBox','0 0 82 32');$('error-spark').innerHTML=`<path d="${vals.map((v,i)=>`${i?'L':'M'} ${i*82/Math.max(1,vals.length-1)} ${30-v/max*25}`).join(' ')}" fill="none" stroke="#2dd4bf" stroke-width="1.5"/>`}
document.addEventListener('click',event=>{
  const nav=event.target.closest('[data-view]');if(nav){view=nav.dataset.view;document.querySelectorAll('.view').forEach(el=>el.hidden=el.id!==`${view}-view`);document.querySelectorAll('[data-view]').forEach(el=>el.classList.toggle('active',el===nav));const names={overview:['Every event counts.','Frequency analytics that adapt to change, with privacy in the loop.'],comparison:['Put the methods to the test.','Compare accuracy, communication, and privacy on the same live windows.'],privacy:['Account for every query.','Private releases, private decisions, and a finite budget.']};$('page-title').textContent=names[view][0];$('page-subtitle').textContent=names[view][1];$('breadcrumb-view').textContent=nav.textContent.replace(/[◈≋◇]/g,'').trim();drawCharts()}
  const m=event.target.closest('[data-method]');if(m){selected=m.dataset.method;render()}
  const s=event.target.closest('[data-series]');if(s){visible.has(s.dataset.series)?visible.delete(s.dataset.series):visible.add(s.dataset.series);render()}
  const met=event.target.closest('[data-metric]');if(met){metric=met.dataset.metric;document.querySelectorAll('[data-metric]').forEach(el=>el.classList.toggle('selected',el===met));drawCharts()}
});
$('play-button').onclick=()=>control(state?.running?'pause':'play');$('step-button').onclick=()=>control('step');$('drift-button').onclick=()=>control('drift');
$('mobile-method-picker').onchange=event=>{selected=event.target.value;render()};
function drawer(open){$('settings-drawer').hidden=!open;$('drawer-backdrop').hidden=!open;if(open&&state){const form=$('settings-form');for(const [key,value] of Object.entries(state.config)){const input=form.elements.namedItem(key);if(input)input.value=value}form.elements.scenario.value=state.config.drift_every===0?'stable':state.config.drift_every<=6?'fast':'drifting';$('settings-error').hidden=true;form.elements.scenario.focus()}if(!open)$('settings-button').focus()}
$('settings-button').onclick=()=>drawer(true);$('close-settings').onclick=()=>drawer(false);$('drawer-backdrop').onclick=()=>drawer(false);document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!$('settings-drawer').hidden)drawer(false)});
$('settings-form').onsubmit=async event=>{event.preventDefault();const config={...state.config},data=new FormData(event.currentTarget);for(const [key,value] of data){if(key!=='scenario')config[key]=Number(value)}config.drift_every=data.get('scenario')==='stable'?0:data.get('scenario')==='fast'?5:15;$('settings-error').hidden=true;await control('reset',config);if($('settings-error').hidden)drawer(false)};
let resizeTimer;window.addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(drawCharts,100)});
(async()=>{await poll();while(true){await new Promise(resolve=>setTimeout(resolve,1000));await poll()}})();
