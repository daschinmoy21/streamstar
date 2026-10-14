#!/usr/bin/env python3
"""Render experiment CSV/summary files without third-party Python dependencies."""
import argparse
import csv
import html
import json
import statistics
from collections import defaultdict
from pathlib import Path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path)
    args = parser.parse_args()
    root = args.directory
    summaries = json.loads((root / "summary.json").read_text())
    groups = defaultdict(list)
    for row in summaries:
        groups[(row["initial_width"], row["method"])].append(row)

    def mean(rows, key):
        return statistics.mean(row[key] for row in rows)

    headers = ["Initial width", "Method", "Mean ℓ∞", "Seed SD", "Mean MSE", "Mean NCR", "Final ε", "Releases", "Total MB", "Processing ms"]
    table = []
    for (width, method), rows in sorted(groups.items()):
        table.append([
            str(width), method,
            f'{mean(rows, "mean_linf"):.5f}',
            f'{statistics.stdev(r["mean_linf"] for r in rows):.5f}' if len(rows) > 1 else "—",
            f'{mean(rows, "mean_mse"):.6f}', f'{mean(rows, "mean_ncr"):.4f}',
            f'{mean(rows, "final_epsilon"):.3f}', f'{mean(rows, "releases"):.1f}',
            f'{mean(rows, "total_bytes") / (1024**2):.2f}', f'{mean(rows, "mean_processing_ms"):.2f}',
        ])
    markdown = "# Streamstar experiment aggregate\n\n"
    markdown += "Mean across seeds; SD is between-seed sample standard deviation. "
    markdown += "PrivSketch has a different target and conditional privacy. Deterministic noise is research-only.\n\n"
    markdown += "| " + " | ".join(headers) + " |\n| " + " | ".join(["---"] * len(headers)) + " |\n"
    markdown += "".join("| " + " | ".join(row) + " |\n" for row in table)
    (root / "report.md").write_text(markdown)

    data = defaultdict(lambda: defaultdict(list))
    configs = {}
    for path in sorted(root.glob("seed-*-width-*.csv")):
        width = int(path.stem.rsplit("-", 1)[1])
        configs[width] = json.loads(path.with_suffix(".config.json").read_text())
        with path.open() as f:
            for row in csv.DictReader(f):
                data[str(width)][row["method"]].append({
                    "round": int(row["round"]), "linf": float(row["linf"]),
                    "epsilon": float(row["epsilon"]), "width": int(row["width"]),
                    "drift": row["injected_drift"] == "true",
                })
    aggregate = {}
    for width, methods in data.items():
        aggregate[width] = {}
        for method, rows in methods.items():
            rounds = defaultdict(list)
            for row in rows:
                rounds[row["round"]].append(row)
            aggregate[width][method] = [{
                "round": number,
                **{key: statistics.mean(r[key] for r in values) for key in ("linf", "epsilon", "width")},
                "drift": any(r["drift"] for r in values),
            } for number, values in sorted(rounds.items())]
    table_html = "<table><thead><tr>" + "".join(f"<th>{html.escape(h)}</th>" for h in headers) + "</tr></thead><tbody>"
    table_html += "".join("<tr>" + "".join(f"<td>{html.escape(v)}</td>" for v in row) + "</tr>" for row in table)
    table_html += "</tbody></table>"
    document = TEMPLATE.replace("__DATA__", json.dumps(aggregate)).replace("__CONFIG__", json.dumps(configs)).replace("__TABLE__", table_html)
    (root / "report.html").write_text(document)
    print(f"Wrote {root / 'report.html'} and {root / 'report.md'}")


TEMPLATE = r'''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Streamstar experiment report</title><style>
body{margin:0;padding:30px;background:#0c1019;color:#dbe5f3;font:14px system-ui;max-width:1400px;margin:auto}h1{font-size:30px;font-weight:600;letter-spacing:-1px}p{color:#8c9eb7;line-height:1.7}select,label{font:13px system-ui}select{background:#1a2434;color:#dde8f5;border:1px solid #334459;padding:8px;border-radius:5px;margin:0 15px 20px 8px}.charts{display:grid;grid-template-columns:1fr 1fr;gap:20px}.panel{background:#121a27;border:1px solid #283549;border-radius:8px;padding:20px;min-width:0}h2{font-size:16px;margin:0 0 12px}.chart{height:270px;width:100%;display:block}.legend{display:flex;gap:16px;font-size:11px;flex-wrap:wrap;margin:12px 0}.legend span:before{content:'';background:var(--color);width:7px;height:7px;border-radius:50%;display:inline-block;margin-right:7px}.note{font-size:12px;border-left:2px solid #2dd4bf;padding-left:15px;margin:22px 0}.table{overflow:auto;margin-top:25px}table{width:100%;border-collapse:collapse;font:11px monospace;white-space:nowrap}td,th{padding:13px;border-bottom:1px solid #293649;text-align:left}th{color:#91a5bf;background:#162132}a{color:#2dd4bf}@media(max-width:750px){body{padding:18px}.charts{grid-template-columns:1fr}.panel{padding:15px}}@media print{body{color:#111;background:#fff}.panel{background:#fff}.chart{height:240px}p{color:#333}}
</style></head><body><h1>Adaptive releases, measured.</h1><p>A research evaluation of federated frequency sketches on the same drifting stream. Curves show the mean across independent seeds.</p><label>Initial / fixed width<select id="width"></select></label><label>Include local protocols<input type="checkbox" id="local"></label><div class="legend" id="legend"></div><div class="charts"><section class="panel"><h2>Maximum frequency error</h2><svg id="error" class="chart" role="img" aria-label="Mean infinity error over rounds"></svg></section><section class="panel"><h2>Cumulative privacy spend</h2><svg id="privacy" class="chart" role="img" aria-label="Mean cumulative epsilon over rounds"></svg></section></div><p class="note">Dashed vertical lines mark known drift; the gate does not read these labels. Private probes are included in the privacy spend. Stale estimates remain in the error measurement. PrivSketch estimates client presence and has conditional privacy, so it is a separate reproduction. Deterministic noise is for research only.</p><div class="table">__TABLE__</div><p>The source config and raw per-round CSV files accompany this report. Do not interpret a three-seed exploratory experiment as a proof of the proposal's hypotheses.</p><script>
const DATA=__DATA__,CONFIG=__CONFIG__;
const colors={shared:'#94a3b8',fresh:'#a78bfa',hybrid:'#60a5fa',adaptive:'#fbbf24',gated:'#2dd4bf',local:'#fb7185',privsketch:'#f97316'},names={shared:'Shared',fresh:'Fresh',hybrid:'Hybrid',adaptive:'Adaptive width',gated:'Adaptive + gate',local:'Count-Min LDP',privsketch:'PrivSketch*'};
const select=document.getElementById('width');Object.keys(DATA).sort((a,b)=>a-b).forEach(w=>select.add(new Option(w,w)));if(DATA['64'])select.value='64';
function draw(id,key){const svg=document.getElementById(id),data=DATA[select.value],config=CONFIG[select.value],width=Math.max(280,svg.clientWidth),height=270,pad={l:48,r:15,t:15,b:28},w=width-pad.l-pad.r,h=height-pad.t-pad.b;const methods=Object.keys(data).filter(m=>document.getElementById('local').checked||!['local','privsketch'].includes(m));const target=key==='epsilon'?config.epsilon_limit:config.target_error;const ymax=Math.max(target,...methods.flatMap(m=>data[m].map(r=>r[key])))*1.13;const rounds=data[methods[0]],xmin=rounds[0].round,xmax=rounds.at(-1).round,x=n=>pad.l+(n-xmin)*w/Math.max(1,xmax-xmin),y=v=>pad.t+h-v/ymax*h;let html='';for(let i=0;i<=4;i++){const v=ymax*i/4,yy=y(v);html+=`<line x1="${pad.l}" x2="${width-pad.r}" y1="${yy}" y2="${yy}" stroke="#2c3a4d" stroke-dasharray="3 4"/><text x="${pad.l-8}" y="${yy+3}" text-anchor="end" fill="#8297b2" font-size="9">${v.toFixed(key==='epsilon'?1:3)}</text>`}for(let i=0;i<6;i++){const n=Math.round(xmin+i*(xmax-xmin)/5);html+=`<text x="${x(n)}" y="${height-7}" fill="#8297b2" text-anchor="middle" font-size="9">${n}</text>`}rounds.forEach(r=>{if(r.drift)html+=`<line x1="${x(r.round)}" x2="${x(r.round)}" y1="${pad.t}" y2="${pad.t+h}" stroke="#fbbf24" opacity=".4" stroke-dasharray="3 4"/>`});html+=`<line x1="${pad.l}" x2="${width-pad.r}" y1="${y(target)}" y2="${y(target)}" stroke="#829889" stroke-dasharray="5 5"/><text x="${width-pad.r}" y="${y(target)-5}" text-anchor="end" fill="#829889" font-size="9">target ${target}</text>`;methods.forEach(m=>{const d=data[m].map((r,i)=>`${i?'L':'M'} ${x(r.round)} ${y(r[key])}`).join(' ');html+=`<path d="${d}" fill="none" stroke="${colors[m]}" stroke-width="${m==='gated'?2.5:1.5}"/>`});svg.setAttribute('viewBox',`0 0 ${width} ${height}`);svg.innerHTML=html;document.getElementById('legend').innerHTML=methods.map(m=>`<span style="--color:${colors[m]}">${names[m]}</span>`).join('')}
function render(){draw('error','linf');draw('privacy','epsilon')}select.onchange=render;document.getElementById('local').onchange=render;window.addEventListener('resize',render);render();
</script></body></html>'''

if __name__ == "__main__":
    main()
