"""Shared Nexus UI theme — matches Atlas layout and typography."""

NEXUS_VIEWPORT = (
    '<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">'
)

NEXUS_BASE_CSS = """
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{
--bg:#f8f9fb;--bg2:#fff;--card:#fff;--text:#111827;--muted:#6b7280;--border:#e5e7eb;
--accent:#7c3aed;--accent-hover:#6d28d9;--accent-subtle:#f3e8ff;
--green:#059669;--green-bg:#ecfdf5;--red:#dc2626;--amber:#b45309;--amber-bg:#fffbeb;
--radius:8px;--shadow:0 1px 2px rgba(0,0,0,.05);
--bottom-nav-h:56px;--mobile-header-h:48px;
--safe-bottom:env(safe-area-inset-bottom,0px);--safe-top:env(safe-area-inset-top,0px)
}
[data-theme="dark"]{
--bg:#111827;--bg2:#1f2937;--card:#1f2937;--text:#f9fafb;--muted:#9ca3af;--border:#374151;
--accent:#a78bfa;--accent-hover:#c4b5fd;--accent-subtle:rgba(124,58,237,.18);
--green-bg:rgba(5,150,105,.15);--amber-bg:rgba(180,83,9,.15);--shadow:none
}
html{scroll-behavior:smooth;-webkit-text-size-adjust:100%}
body{
font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;
background:var(--bg);color:var(--text);min-height:100vh;min-height:100dvh;
-webkit-font-smoothing:antialiased;overflow-x:hidden;font-size:15px;line-height:1.5
}
a{color:var(--accent);text-decoration:none}
a:hover{color:var(--accent-hover)}
.main{
width:100%;max-width:1080px;margin:0 auto;padding:24px 28px 40px
}
.page-header{margin-bottom:20px}
.page-header h1,.page-header .logo{
font-size:1.375rem;font-weight:600;line-height:1.3;color:var(--text)
}
.page-header p,.sub,.tag{
color:var(--muted);font-size:.875rem;margin-top:4px;line-height:1.45
}
.sub{margin-bottom:20px}
.theme-switch{
display:flex;background:var(--bg);border:1px solid var(--border);border-radius:var(--radius);
padding:2px;gap:2px;flex-shrink:0
}
.theme-switch button{
flex:1;border:none;background:transparent;color:var(--muted);font-family:inherit;
font-size:.75rem;font-weight:500;padding:6px 10px;border-radius:6px;cursor:pointer;min-width:44px
}
.theme-switch button.active{
background:var(--card);color:var(--text);font-weight:600;box-shadow:var(--shadow)
}
.mobile-header .theme-switch button{padding:5px 8px}
.mobile-header,.bottom-nav{display:none}
.desktop-topbar{
display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;
max-width:1080px;margin:0 auto;padding:20px 28px 16px;border-bottom:1px solid var(--border)
}
.desktop-nav{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
.desktop-nav a{
padding:7px 12px;border-radius:var(--radius);border:1px solid var(--border);
font-size:.8125rem;font-weight:500;color:var(--muted);background:var(--card)
}
.desktop-nav a:hover{color:var(--text)}
.desktop-nav a.active{
background:var(--accent-subtle);border-color:var(--accent-subtle);color:var(--accent);font-weight:600
}
.mobile-header{
align-items:center;justify-content:space-between;position:fixed;top:0;left:0;right:0;
height:calc(var(--mobile-header-h) + var(--safe-top));padding:var(--safe-top) 14px 0;
background:var(--bg2);border-bottom:1px solid var(--border);z-index:90
}
.mobile-brand{font-size:1rem;font-weight:600}
.bottom-nav{
position:fixed;bottom:0;left:0;right:0;height:calc(var(--bottom-nav-h) + var(--safe-bottom));
padding-bottom:var(--safe-bottom);background:var(--bg2);border-top:1px solid var(--border);z-index:90
}
.bottom-nav a{
flex:1;display:flex;align-items:center;justify-content:center;color:var(--muted);
font-size:.6875rem;font-weight:500;padding:8px 4px;text-align:center;line-height:1.2
}
.bottom-nav a.active{color:var(--accent);font-weight:600}
@media(max-width:768px){
.mobile-header,.bottom-nav{display:flex}
.desktop-topbar{display:none}
.main{
padding:calc(var(--mobile-header-h) + var(--safe-top) + 16px) 14px
calc(var(--bottom-nav-h) + var(--safe-bottom) + 16px);max-width:none
}
.page-header .hide-mobile{display:none}
}
"""

NEXUS_OWNER_CSS = """
h1{font-size:1.375rem;font-weight:600;margin-bottom:4px;line-height:1.3}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:12px;margin-bottom:24px}
.card{background:var(--card);border:1px solid var(--border);border-radius:var(--radius);padding:16px;box-shadow:var(--shadow)}
.card .num{font-size:1.5rem;font-weight:600;color:var(--text);line-height:1.2}
.card .lbl{font-size:.75rem;color:var(--muted);margin-top:4px}
table{width:100%;border-collapse:collapse;font-size:.875rem}
th,td{padding:10px 8px;text-align:left;border-bottom:1px solid var(--border)}
th{color:var(--muted);font-size:.75rem;font-weight:600}
.filters{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px}
.filters select,.filters input{
padding:9px 12px;border-radius:var(--radius);border:1px solid var(--border);
background:var(--card);color:var(--text);font-family:inherit;font-size:16px
}
.filters button{
padding:9px 16px;border-radius:var(--radius);border:none;background:var(--accent);
color:#fff;font-weight:500;cursor:pointer;font-family:inherit;font-size:.875rem
}
.report-box{
background:var(--card);border:1px solid var(--border);border-radius:var(--radius);
padding:16px;margin-bottom:12px;box-shadow:var(--shadow)
}
.report-box h3{margin-bottom:6px;font-size:.9375rem;font-weight:600}
.badge{display:inline-block;padding:2px 8px;border-radius:4px;font-size:.75rem;font-weight:500}
.badge.dead{background:#fef2f2;color:var(--red)}
.badge.none{background:var(--amber-bg);color:var(--amber)}
.badge.client{background:var(--green-bg);color:var(--green)}
.badge.interested{background:var(--accent-subtle);color:var(--accent)}
"""

NEXUS_CALLER_CSS = """
.panel{
background:var(--card);border:1px solid var(--border);border-radius:var(--radius);
padding:16px;margin-top:16px;box-shadow:var(--shadow)
}
.row{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px}
.field{flex:1;min-width:130px}
label{display:block;font-size:.8125rem;font-weight:500;color:var(--text);margin-bottom:5px}
select,input{
width:100%;padding:10px 12px;border-radius:var(--radius);border:1px solid var(--border);
background:var(--card);color:var(--text);font-family:inherit;font-size:16px;
appearance:none;-webkit-appearance:none
}
select:focus,input:focus{
outline:none;border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-subtle)
}
.seg{
display:flex;background:var(--bg);border:1px solid var(--border);border-radius:var(--radius);
padding:3px;gap:3px
}
.seg button{
flex:1;padding:9px;border:none;background:transparent;color:var(--muted);
font-family:inherit;font-weight:500;font-size:.8125rem;border-radius:6px;cursor:pointer
}
.seg button.active{background:var(--card);color:var(--accent);font-weight:600;box-shadow:var(--shadow)}
.generate{
width:100%;margin-top:6px;padding:12px;border:1px solid var(--accent);border-radius:var(--radius);
background:var(--accent);color:#fff;font-family:inherit;font-weight:500;font-size:.9375rem;cursor:pointer
}
.generate:active{opacity:.9}
.generate:disabled{opacity:.5;cursor:not-allowed}
.status{
display:none;margin-top:16px;align-items:center;gap:12px;background:var(--card);
border:1px solid var(--border);border-radius:var(--radius);padding:14px 16px
}
.status.show{display:flex}
.spinner{
width:18px;height:18px;border:2px solid var(--border);border-top-color:var(--accent);
border-radius:50%;animation:spin .8s linear infinite;flex-shrink:0
}
@keyframes spin{to{transform:rotate(360deg)}}
.status .msg{font-size:.875rem;color:var(--muted)}
.results{margin-top:16px}
.results-bar{display:none;gap:8px;margin-bottom:12px}
.results-bar.show{display:flex}
.copybtn{
flex:1;padding:12px;border:1px solid var(--border);border-radius:var(--radius);
background:var(--card);color:var(--text);font-weight:500;font-family:inherit;font-size:.875rem;cursor:pointer
}
.copybtn:hover{background:var(--bg)}
.copybtn.copied{background:var(--green-bg);border-color:var(--green);color:var(--green)}
.count-pill{
background:var(--bg);border:1px solid var(--border);color:var(--muted);border-radius:var(--radius);
padding:0 14px;display:flex;align-items:center;font-weight:500;font-size:.8125rem;white-space:nowrap
}
.lead{
background:var(--card);border:1px solid var(--border);border-radius:var(--radius);
padding:14px;margin-bottom:10px;box-shadow:var(--shadow)
}
.lead.called{opacity:.55}
.lead-actions{display:flex;gap:6px;margin-top:10px;flex-wrap:wrap}
.markbtn{
padding:6px 12px;border-radius:var(--radius);border:1px solid var(--border);
background:var(--card);color:var(--muted);font-size:.75rem;font-weight:500;cursor:pointer
}
.markbtn.done{background:var(--green-bg);border-color:var(--green);color:var(--green)}
.outcome-btn{
padding:6px 10px;border-radius:var(--radius);border:1px solid var(--border);
background:var(--card);color:var(--muted);font-size:.75rem;font-weight:500;cursor:pointer
}
.outcome-btn.picked{background:var(--green-bg);border-color:var(--green);color:var(--green)}
.outcome-btn.client-pick{background:var(--accent-subtle);border-color:var(--accent);color:var(--accent)}
.opener{font-size:.8125rem;line-height:1.5;color:var(--muted);margin-bottom:8px}
.lead-top{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:6px}
.lead-name{font-weight:600;font-size:.9375rem;line-height:1.3}
.score{
flex-shrink:0;min-width:40px;height:40px;border-radius:var(--radius);display:flex;align-items:center;
justify-content:center;font-weight:600;font-size:.9375rem;background:var(--bg);border:1px solid var(--border)
}
.score.hot{background:var(--accent);color:#fff;border-color:var(--accent)}
.meta{font-size:.8125rem;color:var(--muted);margin-bottom:8px}
.meta a{color:var(--accent)}
.phone{display:inline-block;font-weight:600;color:var(--text);font-size:.9375rem;margin-bottom:6px}
.angle{font-size:.875rem;line-height:1.5;margin-bottom:6px}
.gaps{display:flex;flex-wrap:wrap;gap:6px}
.gap{
font-size:.75rem;background:#fef2f2;border:1px solid #fecaca;color:var(--red);
border-radius:4px;padding:2px 8px
}
.empty{text-align:center;color:var(--muted);padding:32px 10px;font-size:.875rem}
.reset{
display:block;width:100%;margin-top:16px;background:none;border:none;color:var(--muted);
font-size:.8125rem;text-decoration:underline;cursor:pointer
}
"""
