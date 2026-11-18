// 설계 문서(md)와 그림(svg)으로 PDF를 만들고, 그림을 PNG로도 저장한다.
// 사용: node docs/tools/render.cjs <node_modules 경로> <문서.md> <그림.svg> <출력.pdf> <portrait|landscape> <그림 최대 높이, 예: 146mm>
// node_modules에는 puppeteer와 marked가 있어야 한다. 크롬은 /usr/bin/google-chrome을 쓴다.
const fs = require('fs');
const path = require('path');
const [, , nm, mdPath, svgPath, outPdf, orient, figMax] = process.argv;

(async () => {
  const puppeteer = require(path.join(nm, 'puppeteer'));
  const { marked } = require(path.join(nm, 'marked', 'lib', 'marked.cjs'));
  const svgRaw = fs.readFileSync(svgPath, 'utf8');
  const size = svgRaw.match(/width="(\d+)" height="(\d+)"/);
  const svg = svgRaw.replace(/ width="\d+" height="\d+"/, '');

  let md = fs.readFileSync(mdPath, 'utf8');
  const before = md;
  md = md.replace(/## 다이어그램\s*\n+```mermaid[\s\S]*?```\s*\n/, '\nFIGUREPLACEHOLDER\n\n');
  if (md === before) throw new Error('mermaid block not found');
  const title = md.match(/^# (.+)$/m)[1];
  let body = marked.parse(md);
  if (!body.includes('<p>FIGUREPLACEHOLDER</p>')) throw new Error('placeholder lost');
  body = body.replace('<p>FIGUREPLACEHOLDER</p>', `<figure>${svg}</figure>`);
  body = body.replace(/<h1[^>]*>/, (m) => '<div class="kicker">트라이로그 · 사장님의 작은 장사 비서</div>' + m);
  body = body.replace(/<h2/g, '</section><section><h2').replace('</section>', '') + '</section>';

  const land = orient === 'landscape';
  const mx = land ? '12mm' : '16mm';
  const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${title}</title><style>
  * { box-sizing: border-box; }
  html { font-family: 'NanumSquare','NanumBarunGothic','NanumGothic',sans-serif; color:#1A2333; font-size:${land ? '9.6pt' : '10pt'}; line-height:${land ? '1.55' : '1.62'}; word-break:keep-all; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  body { margin:0; }
  .kicker { font-size:9pt; font-weight:800; color:#1F5FBF; margin-bottom:1.2mm; }
  h1 { font-size:${land ? '18pt' : '21pt'}; line-height:1.25; margin:0 0 ${land ? '2.5mm' : '4mm'}; font-weight:800; }
  section { break-inside:avoid; }
  h2 { font-size:13pt; font-weight:800; margin:${land ? '5mm 0 2mm' : '7mm 0 2.6mm'}; padding-top:${land ? '2.4mm' : '3mm'}; border-top:0.4mm solid #1A2333; break-after:avoid; }
  p { margin:0 0 2.4mm; }
  strong { font-weight:800; }
  figure { margin:${land ? '3mm 0 0' : '5mm 0 2mm'}; break-inside:avoid; }
  figure svg { display:block; width:100%; height:auto; max-height:${figMax}; }
  table { width:calc(100% - 0.5mm); margin:0 0 3mm 0.25mm; border-collapse:collapse; font-size:8.8pt; line-height:1.5; }
  thead { display:table-header-group; }
  th { background:#EEF2F7; text-align:left; font-weight:800; white-space:nowrap; }
  th, td { border:0.25mm solid #C9D1DD; padding:${land ? '1.1mm' : '1.5mm'} 2.2mm; vertical-align:top; }
  td:first-child { white-space:nowrap; }
  tr { break-inside:avoid; }
  ul, ol { margin:0 0 3mm; padding-left:5.5mm; }
  li { margin:0 0 ${land ? '1mm' : '1.4mm'}; }
  code { font-family:'NanumGothicCoding',monospace; font-size:0.94em; background:#EEF2F7; padding:0.2mm 1mm; border-radius:0.8mm; }
  </style></head><body>${body}</body></html>`;

  const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--disable-gpu'] });
  const p = await b.newPage();
  await p.setContent(html, { waitUntil: 'load' });
  await p.evaluate(() => document.fonts.ready);
  const footer = `<div style="width:100%;font-size:7.5pt;color:#6B7686;font-family:NanumSquare,sans-serif;padding:0 ${mx};display:flex;justify-content:space-between;"><span>${title}</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`;
  await p.pdf({
    path: outPdf, format: 'A4', landscape: land, printBackground: true, displayHeaderFooter: true,
    headerTemplate: '<span></span>', footerTemplate: footer,
    margin: { top: land ? '11mm' : '15mm', bottom: land ? '13mm' : '17mm', left: mx, right: mx },
  });

  const png = svgPath.replace(/\.svg$/, '.png');
  const q = await b.newPage();
  await q.setViewport({ width: +size[1], height: +size[2], deviceScaleFactor: 2 });
  await q.setContent('<html><body style="margin:0;background:#fff">' + svgRaw + '</body></html>');
  await q.evaluate(() => document.fonts.ready);
  await q.screenshot({ path: png, clip: { x: 0, y: 0, width: +size[1], height: +size[2] } });
  await b.close();
  console.log('pdf', path.basename(outPdf), fs.statSync(outPdf).size, '| png', path.basename(png));
})().catch((err) => { console.error(err); process.exit(1); });
