// Fake cursor, click ripple and drag ghost for the demo recording (browser only).
(() => {
  const install = () => {
    const c = document.createElement('div');
    c.id='__cursor';
    c.innerHTML='<svg width="22" height="22" viewBox="0 0 24 24"><path d="M4 2 L4 19 L8.5 14.8 L11.6 21.5 L14.3 20.3 L11.3 13.8 L17.5 13.8 Z" fill="white" stroke="black" stroke-width="1.4" stroke-linejoin="round"/></svg>';
    Object.assign(c.style,{position:'fixed',left:'0',top:'0',zIndex:2147483647,pointerEvents:'none',transform:'translate(-100px,-100px)',filter:'drop-shadow(0 1px 2px rgba(0,0,0,.5))'});
    const g = document.createElement('div');
    g.id='__ghost';
    g.innerHTML='<div style="display:flex;align-items:center;gap:8px;padding:8px 12px;border-radius:10px;background:rgba(255,255,255,.92);color:#111;font:600 13px Inter,system-ui,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.35)"><span style="display:inline-flex;width:26px;height:26px;border-radius:6px;background:#6366f1;color:#fff;align-items:center;justify-content:center;font-size:10px">MP4</span>ranked-clutch.mp4</div>';
    Object.assign(g.style,{position:'fixed',left:'0',top:'0',zIndex:2147483646,pointerEvents:'none',display:'none',opacity:'.95'});
    document.body.appendChild(g); document.body.appendChild(c);
    const st=document.createElement('style'); st.textContent='.ambient-orb{animation-play-state:paused!important}'; document.head.appendChild(st);
    document.addEventListener('mousemove', e => {
      c.style.transform=`translate(${e.clientX-3}px,${e.clientY-2}px)`;
      g.style.transform=`translate(${e.clientX+14}px,${e.clientY+16}px)`;
    }, true);
    document.addEventListener('mousedown', e => {
      const r=document.createElement('div');
      Object.assign(r.style,{position:'fixed',left:(e.clientX-14)+'px',top:(e.clientY-14)+'px',width:'28px',height:'28px',borderRadius:'50%',border:'2px solid rgba(255,255,255,.85)',zIndex:2147483645,pointerEvents:'none',transition:'all .35s ease-out',opacity:'1'});
      document.body.appendChild(r);
      requestAnimationFrame(()=>{r.style.transform='scale(1.8)';r.style.opacity='0';});
      setTimeout(()=>r.remove(),400);
    }, true);
    window.__ghost = (on) => { g.style.display = on ? 'block' : 'none'; };
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install); else install();
})();
