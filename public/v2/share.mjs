const WIDTH = 1200;
const HEIGHT = 1500;
const navy = '#262a45';
const orange = '#ffa01e';
const paper = '#faf7f1';

function year(value, name) {
  if (!Number.isInteger(value) || value < 1900 || value > new Date().getFullYear()) {
    throw new Error(`${name} must be a known year`);
  }
}

function count(value, name) {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${name} must be a verified count`);
}

function check(data) {
  if (data?.mode !== 'verified' && data?.mode !== 'sample') throw new Error('Share data must be verified or explicitly marked sample');
  if (typeof data.forestImage !== 'string' || !data.forestImage.startsWith('data:image/png;base64,')) throw new Error('A PNG forest capture is required');
  year(data.subscriberSinceYear, 'Subscriber since');
  count(data.opens, 'Opens');
  count(data.clicks, 'Clicks');
  count(data.trees, 'Trees');
  if (typeof data.latestMilestone !== 'string' || !data.latestMilestone.trim() || data.latestMilestone.length > 80) {
    throw new Error('Latest milestone must be known');
  }
  year(data.coverage?.opensFromYear, 'Opens coverage');
  year(data.coverage?.clicksFromYear, 'Clicks coverage');
  if (typeof data.coverage.opensComplete !== 'boolean') throw new Error('Opens coverage completeness must be known');
  if (typeof data.coverage.clicksComplete !== 'boolean') throw new Error('Clicks coverage completeness must be known');
  if (data.coverage.opensFromYear < data.subscriberSinceYear || data.coverage.clicksFromYear < data.subscriberSinceYear) {
    throw new Error('Coverage cannot start before the subscription');
  }
  if ((data.coverage.opensComplete && data.coverage.opensFromYear > data.subscriberSinceYear) ||
      (data.coverage.clicksComplete && data.coverage.clicksFromYear > data.subscriberSinceYear)) {
    throw new Error('Incomplete history cannot be marked complete');
  }
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Share image could not be loaded'));
    image.src = src;
  });
}

let fontsReady;
function loadFonts() {
  return fontsReady ||= Promise.all([
    ['ShareBowlby', 'bowlby-one-sc.woff2'], ['ShareRubik', 'rubik.woff2'],
  ].map(async ([name, file]) => {
    const font = new FontFace(name, `url(${new URL(`./assets/${file}`, import.meta.url)})`);
    document.fonts.add(await font.load());
  }));
}

function fit(ctx, image, x, y, width, height) {
  const scale = Math.min(width / image.width, height / image.height);
  const drawnWidth = image.width * scale;
  const drawnHeight = image.height * scale;
  ctx.drawImage(image, x + (width - drawnWidth) / 2, y + (height - drawnHeight) / 2, drawnWidth, drawnHeight);
}

function fitVisibleForest(ctx, image, x, y, width, height) {
  const source = document.createElement('canvas');
  source.width = image.width;
  source.height = image.height;
  const sourceCtx = source.getContext('2d', { willReadFrequently: true });
  sourceCtx.drawImage(image, 0, 0);
  const pixels = sourceCtx.getImageData(0, 0, image.width, image.height).data;
  let left = image.width, top = image.height, right = 0, bottom = 0;
  for (let row = 0; row < image.height; row += 2) {
    for (let column = 0; column < image.width; column += 2) {
      if (pixels[(row * image.width + column) * 4 + 3] < 20) continue;
      left = Math.min(left, column); right = Math.max(right, column);
      top = Math.min(top, row); bottom = Math.max(bottom, row);
    }
  }
  if (right <= left || bottom <= top) return fit(ctx, image, x, y, width, height);
  const padding = Math.max(20, Math.round((right - left) * .06));
  const sx = Math.max(0, left - padding), sy = Math.max(0, top - padding);
  const sw = Math.min(image.width - sx, right - left + padding * 2);
  const sh = Math.min(image.height - sy, bottom - top + padding * 2);
  const scale = Math.min(width / sw, height / sh);
  ctx.drawImage(source, sx, sy, sw, sh, x + (width - sw * scale) / 2, y + (height - sh * scale) / 2, sw * scale, sh * scale);
}

function coverNote({ coverage }) {
  const parts = [];
  if (!coverage.opensComplete) parts.push(`opens since ${coverage.opensFromYear}`);
  if (!coverage.clicksComplete) parts.push(`clicks since ${coverage.clicksFromYear}`);
  return parts.length ? `Partial recorded history: ${parts.join('  ·  ')}` : '';
}

function drawText(ctx, text, maxWidth, fontSize, y) {
  while (fontSize > 28) {
    ctx.font = `${fontSize}px ShareBowlby, sans-serif`;
    if (ctx.measureText(text).width <= maxWidth) break;
    fontSize -= 2;
  }
  ctx.fillText(text, 94, y, maxWidth);
}

/** Renders the selected transparent forest view with only the fixed, verified public summary. */
export async function renderShareCard(data) {
  check(data);
  const [forest, logo] = await Promise.all([
    loadImage(data.forestImage),
    loadImage(new URL('./assets/10almonds-logo.png', import.meta.url).href),
    loadFonts(),
  ]);
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Image export is unavailable in this browser');

  ctx.fillStyle = paper;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.strokeStyle = navy;
  ctx.lineWidth = 3;
  ctx.strokeRect(34, 34, WIDTH - 68, HEIGHT - 68);
  ctx.fillStyle = orange;
  ctx.fillRect(34, 34, WIDTH - 68, 15);

  fit(ctx, logo, 86, 84, 245, 133);
  ctx.textAlign = 'right';
  ctx.fillStyle = navy;
  ctx.font = '23px ShareRubik, sans-serif';
  ctx.fillText('SUBSCRIBER SINCE', 1105, 135);
  ctx.font = '55px ShareBowlby, sans-serif';
  ctx.fillText(String(data.subscriberSinceYear), 1105, 200);
  ctx.textAlign = 'left';

  ctx.fillStyle = navy;
  drawText(ctx, 'MY ALMOND FOREST', 1030, 78, 316);
  ctx.fillStyle = orange;
  ctx.fillRect(92, 347, 105, 10);

  ctx.fillStyle = '#fce8bf';
  ctx.beginPath();
  ctx.arc(880, 615, 219, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#e7eadb';
  ctx.beginPath();
  ctx.ellipse(600, 797, 465, 75, 0, 0, Math.PI * 2);
  ctx.fill();
  fitVisibleForest(ctx, forest, 53, 375, 1094, 505);

  ctx.strokeStyle = navy;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(94, 932);
  ctx.lineTo(1106, 932);
  ctx.stroke();
  const stats = [
    ['EMAILS OPENED', data.opens],
    ['NEWSLETTER CLICKS', data.clicks],
    ['TREES GROWN', data.trees],
  ];
  stats.forEach(([label, value], index) => {
    const x = 94 + index * 344;
    ctx.fillStyle = navy;
    ctx.font = '20px ShareRubik, sans-serif';
    ctx.fillText(label, x, 995);
    ctx.font = '82px ShareBowlby, sans-serif';
    ctx.fillText(Number(value).toLocaleString('en'), x, 1103, 295);
    if (index < 2) {
      ctx.strokeStyle = '#d5d3c9';
      ctx.beginPath(); ctx.moveTo(x + 315, 960); ctx.lineTo(x + 315, 1138); ctx.stroke();
    }
  });

  ctx.fillStyle = navy;
  ctx.fillRect(34, 1190, WIDTH - 68, 210);
  ctx.fillStyle = orange;
  ctx.font = '23px ShareRubik, sans-serif';
  ctx.fillText('LATEST MILESTONE', 94, 1254);
  ctx.fillStyle = '#fffdf6';
  drawText(ctx, data.latestMilestone.trim().toUpperCase(), 994, 52, 1344);

  const coverage = coverNote(data);
  if (coverage) {
    ctx.fillStyle = '#4a5568';
    ctx.font = '22px ShareRubik, sans-serif';
    ctx.fillText(coverage, 94, 1450);
  }
  if (data.mode === 'sample') {
    ctx.fillStyle = orange;
    ctx.fillRect(867, 1409, 238, 45);
    ctx.fillStyle = navy;
    ctx.font = '22px ShareRubik, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('EXAMPLE ONLY', 986, 1440);
  }

  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Image export failed')), 'image/png');
    } catch (error) { reject(error); }
  });
}

/** Shows the finished image with user-click save and native share actions. */
export async function shareOrDownloadCard(blob) {
  if (!(blob instanceof Blob) || blob.type !== 'image/png') throw new Error('A PNG share card is required');
  const url = URL.createObjectURL(blob);
  const dialog = document.createElement('dialog');
  dialog.setAttribute('aria-label', 'Share your almond forest');
  dialog.style.cssText = 'border:3px solid #262a45;border-radius:4px;background:#faf7f1;color:#262a45;padding:20px;max-width:min(92vw,580px);max-height:90vh;box-shadow:0 16px 50px #262a4540';
  const heading = document.createElement('h2');
  heading.textContent = 'Your forest image';
  heading.style.cssText = 'font:700 26px Arial,sans-serif;margin:0 0 12px';
  const image = document.createElement('img');
  image.src = url;
  image.alt = 'Preview of your forest share card';
  image.style.cssText = 'display:block;width:100%;max-height:60vh;object-fit:contain';
  const actions = document.createElement('div');
  actions.style.cssText = 'display:flex;flex-wrap:wrap;gap:12px;margin-top:16px;align-items:center';
  const save = document.createElement('a');
  save.href = url;
  save.download = 'my-almond-forest.png';
  save.textContent = 'Save image';
  save.style.cssText = 'display:inline-block;background:#ffa01e;color:#262a45;padding:12px 18px;text-decoration:none;font:700 18px Arial,sans-serif';
  actions.append(save);
  const file = typeof File === 'function' ? new File([blob], save.download, { type: 'image/png' }) : null;
  if (file && navigator.canShare?.({ files: [file] }) && navigator.share) {
    const share = document.createElement('button');
    share.type = 'button';
    share.textContent = 'Share image';
    share.style.cssText = 'border:2px solid #262a45;background:transparent;color:#262a45;padding:10px 16px;font:700 18px Arial,sans-serif;cursor:pointer';
    share.addEventListener('click', async () => {
      try { await navigator.share({ files: [file], title: 'My Almond Forest' }); }
      catch (error) { if (error.name !== 'AbortError') share.textContent = 'Use Save image instead'; }
    });
    actions.append(share);
  }
  const close = document.createElement('button');
  close.type = 'button';
  close.textContent = 'Close';
  close.style.cssText = 'border:0;background:transparent;color:#262a45;padding:10px;font:18px Arial,sans-serif;cursor:pointer';
  close.addEventListener('click', () => dialog.close());
  actions.append(close);
  dialog.append(heading, image, actions);
  dialog.addEventListener('close', () => { URL.revokeObjectURL(url); dialog.remove(); }, { once: true });
  document.body.append(dialog);
  dialog.showModal();
  return 'ready';
}
