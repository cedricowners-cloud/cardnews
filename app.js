const W = 1080, H = 1350;
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const $ = s => document.querySelector(s);

let nextId = 1;
const state = {
  slides: [],
  currentIdx: 0,
  brand: {
    type: 'text',
    text: '브랜드명 입력',
    textSize: 24,
    image: null,
    imageSrc: null,
    imageSize: 15,
    coverPosition: 'middle-left',
    coverAboveHeading: true,
    bodyPosition: 'top-right',
  },
  highlightColor: '#1E4FFF',
  fontScale: 1.0,
  exportScale: 2,
  background: {
    type: 'solid',
    color: '#ffffff',
    color2: '#f0f0f0',
    gradientDirection: 'top-bottom',
  },
  activeFileSlideId: null,
};

function uid() { return 's' + (nextId++); }
function makeSlide(p = {}) {
  return { id: uid(), type: 'body', heading: '', hashtag: '', body: '', image: null, imageSrc: null, ...p };
}

const SAMPLE_SLIDES = [
  { type: 'cover', heading: '돈 버는 사업가가 <span class="hl-mark">시장을 꿰뚫는</span> 방법', hashtag: '#사업가 인사이트', body: '' },
  { type: 'body', body: '많은 사람들은<br>"이거 유행인가?"<br>"요즘 이거 잘나가잖아?"<br>의 기준으로 시장을 바라본다.<br><br>하지만 돈 버는 사업가는<br>완전히 다른 시각을 가지고 있다.' },
  { type: 'section', heading: '기준1. 유행이 아니라 반복을 본다', body: '유행은 빠르게 뜨고 빠르게<br>사라진다는 것을 인지해야한다.<br><br>하지만 사업가는 계속<br><b>반복되는 문제를 놓치지 않는다.</b><br><br>돈은 항상 반복에서 나온다.' },
  { type: 'section', heading: '기준2. 말이 아니라 행동을 본다', body: '사람들은 <b>말과 행동은 전혀 다르다.</b><br><br>그래서 사업가들은 사람들이<br>내뱉는 말을 믿지 않고,<br><br>사람들이 <b>실제로 돈을 쓰는 행동만<br>보고 판단한다.</b>' },
];

/* ---------- HTML ⇄ runs ---------- */

function htmlToRuns(html) {
  if (!html) return [];
  const container = document.createElement('div');
  container.innerHTML = html;
  const runs = [];
  function walk(node, style) {
    for (const child of node.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) {
        if (child.textContent) runs.push({ text: child.textContent, bold: style.bold, hl: style.hl });
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        const tag = child.tagName;
        if (tag === 'BR') {
          runs.push({ text: '\n', bold: false, hl: false });
          continue;
        }
        const isBlock = tag === 'DIV' || tag === 'P';
        if (isBlock && runs.length && runs[runs.length - 1].text !== '\n') {
          runs.push({ text: '\n', bold: false, hl: false });
        }
        const newStyle = { ...style };
        if (tag === 'B' || tag === 'STRONG') newStyle.bold = true;
        if (child.classList && child.classList.contains('hl-mark')) newStyle.hl = true;
        const fw = child.style && child.style.fontWeight;
        if (fw && (fw === 'bold' || parseInt(fw, 10) >= 600)) newStyle.bold = true;
        walk(child, newStyle);
      }
    }
  }
  walk(container, { bold: false, hl: false });
  while (runs.length && runs[runs.length - 1].text === '\n') runs.pop();
  return runs;
}

function stripHtml(html) {
  const d = document.createElement('div');
  d.innerHTML = html || '';
  return (d.textContent || '').replace(/\n+/g, ' ').trim();
}

/* ---------- Canvas rendering ---------- */

function font(size, weight) {
  return `${weight} ${size}px "Pretendard Variable", Pretendard, sans-serif`;
}

function measureRuns(c, runs, size, baseWeight) {
  return runs.map(r => {
    c.font = font(size, r.bold ? 900 : baseWeight);
    return c.measureText(r.text).width;
  });
}

function drawRunsLine(c, runs, x, y, size, opts) {
  const { baseWeight = 400, textColor = '#000', hlColor = '#1E4FFF', hlTextColor = '#fff', padX = 6, padY = 8 } = opts;
  const widths = measureRuns(c, runs, size, baseWeight);
  let cx = x;
  for (let i = 0; i < runs.length; i++) {
    if (runs[i].hl && runs[i].text.trim()) {
      c.fillStyle = hlColor;
      c.fillRect(cx - padX / 2, y - padY / 2, widths[i] + padX, size + padY);
    }
    cx += widths[i];
  }
  cx = x;
  c.textBaseline = 'top';
  for (let i = 0; i < runs.length; i++) {
    c.font = font(size, runs[i].bold ? 900 : baseWeight);
    c.fillStyle = runs[i].hl ? hlTextColor : textColor;
    c.fillText(runs[i].text, cx, y);
    cx += widths[i];
  }
}

function wrapRuns(c, runs, maxWidth, size, baseWeight) {
  const lines = [];
  let current = []; let curW = 0;
  for (const run of runs) {
    c.font = font(size, run.bold ? 900 : baseWeight);
    const chars = Array.from(run.text);
    let buf = '';
    for (const ch of chars) {
      const testW = c.measureText(buf + ch).width;
      if (curW + testW > maxWidth && buf) {
        current.push({ text: buf, bold: run.bold, hl: run.hl });
        lines.push(current);
        current = []; curW = 0; buf = ch;
      } else {
        buf += ch;
      }
    }
    if (buf) {
      current.push({ text: buf, bold: run.bold, hl: run.hl });
      curW += c.measureText(buf).width;
    }
  }
  if (current.length) lines.push(current);
  return lines;
}

function renderRunsBlock(c, runs, x, y, maxWidth, size, lineHeight, opts) {
  const lines = [];
  let cur = [];
  for (const run of runs) {
    const parts = run.text.split('\n');
    for (let i = 0; i < parts.length; i++) {
      if (i > 0) { lines.push(cur); cur = []; }
      if (parts[i]) cur.push({ text: parts[i], bold: run.bold, hl: run.hl });
    }
  }
  lines.push(cur);
  let cy = y;
  for (const lineRuns of lines) {
    if (!lineRuns.length) { cy += size * lineHeight * 0.5; continue; }
    const totalW = measureRuns(c, lineRuns, size, opts.baseWeight || 400).reduce((a, b) => a + b, 0);
    if (totalW <= maxWidth) {
      drawRunsLine(c, lineRuns, x, cy, size, opts);
      cy += size * lineHeight;
    } else {
      const wrapped = wrapRuns(c, lineRuns, maxWidth, size, opts.baseWeight || 400);
      for (const wr of wrapped) {
        drawRunsLine(c, wr, x, cy, size, opts);
        cy += size * lineHeight;
      }
    }
  }
  return cy;
}

function drawImageCover(c, img, w, h) {
  const ir = img.width / img.height;
  const cr = w / h;
  let sw, sh, sx, sy;
  if (ir > cr) { sh = img.height; sw = sh * cr; sx = (img.width - sw) / 2; sy = 0; }
  else { sw = img.width; sh = sw / cr; sx = 0; sy = (img.height - sh) / 2; }
  c.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
}

function drawDefaultBackground(c, W, H) {
  const bg = state.background;
  if (bg.type === 'gradient') {
    const coords = gradientCoords(bg.gradientDirection, W, H);
    const grad = c.createLinearGradient(coords.x0, coords.y0, coords.x1, coords.y1);
    grad.addColorStop(0, bg.color);
    grad.addColorStop(1, bg.color2);
    c.fillStyle = grad;
  } else {
    c.fillStyle = bg.color;
  }
  c.fillRect(0, 0, W, H);

  if (bg.type === 'dots') drawDotsPattern(c, W, H);
  else if (bg.type === 'paper') drawPaperPattern(c, W, H);
}

function gradientCoords(dir, W, H) {
  switch (dir) {
    case 'bottom-top': return { x0: 0, y0: H, x1: 0, y1: 0 };
    case 'left-right': return { x0: 0, y0: 0, x1: W, y1: 0 };
    case 'right-left': return { x0: W, y0: 0, x1: 0, y1: 0 };
    case 'diagonal':   return { x0: 0, y0: 0, x1: W, y1: H };
    case 'top-bottom':
    default:           return { x0: 0, y0: 0, x1: 0, y1: H };
  }
}

function drawDotsPattern(c, W, H) {
  c.fillStyle = 'rgba(0,0,0,0.08)';
  const spacing = 30;
  for (let y = spacing / 2; y < H; y += spacing) {
    for (let x = spacing / 2; x < W; x += spacing) {
      c.beginPath();
      c.arc(x, y, 1.5, 0, Math.PI * 2);
      c.fill();
    }
  }
}

// Deterministic noise so the output is stable across renders.
function drawPaperPattern(c, W, H) {
  c.fillStyle = 'rgba(0,0,0,0.04)';
  let seed = 12345;
  const rand = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
  const count = Math.floor(W * H * 0.008);
  for (let i = 0; i < count; i++) {
    c.fillRect(Math.floor(rand() * W), Math.floor(rand() * H), 1, 1);
  }
}

function isLightColor(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return true;
  const v = parseInt(m[1], 16);
  const r = (v >> 16) & 0xff, g = (v >> 8) & 0xff, b = v & 0xff;
  return (0.299 * r + 0.587 * g + 0.114 * b) > 160;
}

const BRAND_MARGIN_X = 72;
const BRAND_MARGIN_Y = 64;

// Kept in sync with the cover heading renderer: heading baseline starts at
// H * 0.46, so "above heading" places the brand with its bottom slightly above.
const COVER_HEADING_TOP_RATIO = 0.46;
const COVER_ABOVE_HEADING_GAP = 40;

function drawBrand(c, slide, hasBg, canvasW, canvasH) {
  const isImage = state.brand.type === 'image' && state.brand.image;
  const hasText = state.brand.text && state.brand.text.trim();
  if (!isImage && !hasText) return;

  const isCover = slide.type === 'cover';
  const position = isCover ? state.brand.coverPosition : state.brand.bodyPosition;
  const color = hasBg ? 'rgba(255,255,255,0.92)' : '#333333';
  const [vPos, hPos] = position.split('-');
  const aboveHeading = isCover && state.brand.coverAboveHeading && slide.heading;

  // Measure brand block height for vertical positioning.
  let blockH;
  if (isImage) {
    const imgW = canvasW * state.brand.imageSize / 100;
    blockH = imgW * (state.brand.image.height / state.brand.image.width);
  } else {
    const lineHeight = state.brand.textSize * 1.35;
    const lines = state.brand.text.split('\n');
    blockH = (lines.length - 1) * lineHeight + state.brand.textSize;
  }

  // Resolve vertical position (y).
  let y;
  if (aboveHeading) {
    y = canvasH * COVER_HEADING_TOP_RATIO - COVER_ABOVE_HEADING_GAP - blockH;
  } else if (vPos === 'top') {
    y = BRAND_MARGIN_Y;
  } else if (vPos === 'bottom') {
    y = canvasH - BRAND_MARGIN_Y - blockH;
  } else {
    y = (canvasH - blockH) / 2;
  }

  if (isImage) {
    const imgW = canvasW * state.brand.imageSize / 100;
    const imgH = blockH;
    let x;
    if (hPos === 'right') x = canvasW - BRAND_MARGIN_X - imgW;
    else if (hPos === 'center') x = (canvasW - imgW) / 2;
    else x = BRAND_MARGIN_X;
    c.drawImage(state.brand.image, x, y, imgW, imgH);
    return;
  }

  const fontSize = state.brand.textSize;
  const lineHeight = fontSize * 1.35;
  const lines = state.brand.text.split('\n');
  c.font = font(fontSize, 500);
  c.fillStyle = color;
  c.textBaseline = 'top';
  lines.forEach((line, i) => {
    const lineWidth = c.measureText(line).width;
    let lineX;
    if (hPos === 'right') lineX = canvasW - BRAND_MARGIN_X - lineWidth;
    else if (hPos === 'center') lineX = (canvasW - lineWidth) / 2;
    else lineX = BRAND_MARGIN_X;
    c.fillText(line, lineX, y + i * lineHeight);
  });
}

function renderSlide(slide, target, scale = 1) {
  target.width = W * scale;
  target.height = H * scale;
  const c = target.getContext('2d');
  if (scale !== 1) c.scale(scale, scale);
  c.imageSmoothingEnabled = true;
  c.imageSmoothingQuality = 'high';
  const hasImage = !!slide.image;
  const hl = state.highlightColor;

  if (hasImage) {
    drawImageCover(c, slide.image, W, H);
    c.fillStyle = 'rgba(0,0,0,0.55)';
    c.fillRect(0, 0, W, H);
  } else {
    drawDefaultBackground(c, W, H);
  }

  const darkBg = hasImage || !isLightColor(state.background.color);
  const textColor = darkBg ? '#ffffff' : '#111111';
  const sectionHeadingTextColor = darkBg ? '#111111' : '#111111';
  const marginX = 72;
  const maxWidth = W - marginX * 2;
  const fs = state.fontScale || 1;

  drawBrand(c, slide, darkBg, W, H);

  if (slide.type === 'cover') {
    if (slide.heading) {
      const headingRuns = htmlToRuns(slide.heading);
      renderRunsBlock(c, headingRuns, marginX, H * 0.46, maxWidth, 86 * fs, 1.28, {
        baseWeight: 900, textColor, hlColor: hl, hlTextColor: '#fff', padX: 10, padY: 14,
      });
    }
    if (slide.hashtag) {
      const tagSize = 26 * fs;
      c.font = font(tagSize, 500);
      c.fillStyle = textColor;
      c.textBaseline = 'top';
      const tx = marginX, ty = H - 180;
      c.fillText(slide.hashtag, tx, ty);
      const tw = c.measureText(slide.hashtag).width;
      c.strokeStyle = textColor;
      c.lineWidth = 1.5;
      c.beginPath();
      c.moveTo(tx, ty + tagSize + 4);
      c.lineTo(tx + tw, ty + tagSize + 4);
      c.stroke();
    }
    if (slide.body) {
      const bodyRuns = htmlToRuns(slide.body);
      renderRunsBlock(c, bodyRuns, marginX, H * 0.72, maxWidth, 30 * fs, 1.6, {
        baseWeight: 400, textColor, hlColor: hl, hlTextColor: '#fff',
      });
    }
    return;
  }

  let y = H * 0.22;
  if (slide.type === 'section' && slide.heading) {
    const plain = stripHtml(slide.heading);
    const runs = [{ text: plain, bold: true, hl: true }];
    y = renderRunsBlock(c, runs, marginX, y, maxWidth, 54 * fs, 1.35, {
      baseWeight: 900, textColor: sectionHeadingTextColor, hlColor: hl, hlTextColor: '#fff', padX: 12, padY: 12,
    });
    y += 30;
  }
  if (slide.body) {
    const bodyRuns = htmlToRuns(slide.body);
    renderRunsBlock(c, bodyRuns, marginX, y, maxWidth, 40 * fs, 1.65, {
      baseWeight: 400, textColor, hlColor: hl, hlTextColor: '#fff',
    });
  }
}

function renderCurrent() {
  if (!state.slides.length) {
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#999'; ctx.font = font(32, 500);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('슬라이드를 추가하면 미리보기가 나타납니다', W / 2, H / 2);
    ctx.textAlign = 'left';
    $('#indicator').textContent = '0 / 0';
    return;
  }
  state.currentIdx = Math.max(0, Math.min(state.currentIdx, state.slides.length - 1));
  renderSlide(state.slides[state.currentIdx], canvas);
  $('#indicator').textContent = `${state.currentIdx + 1} / ${state.slides.length}`;
}

/* ---------- Editor UI ---------- */

function renderEditor() {
  const editor = $('#slide-editor');
  editor.innerHTML = '';
  state.slides.forEach((slide, i) => editor.appendChild(createSlideCard(slide, i)));
}

function createSlideCard(slide, index) {
  const card = document.createElement('div');
  card.className = 'slide-card' + (index === state.currentIdx ? ' active' : '');
  card.dataset.id = slide.id;

  const header = document.createElement('div');
  header.className = 'card-header';
  header.innerHTML = `
    <div class="card-num">${index + 1}</div>
    <select class="card-type-select">
      <option value="cover" ${slide.type === 'cover' ? 'selected' : ''}>커버</option>
      <option value="section" ${slide.type === 'section' ? 'selected' : ''}>섹션</option>
      <option value="body" ${slide.type === 'body' ? 'selected' : ''}>본문</option>
    </select>
    <div class="card-spacer"></div>
    <button class="icon-btn" data-action="up" title="위로">▲</button>
    <button class="icon-btn" data-action="down" title="아래">▼</button>
    <button class="icon-btn" data-action="delete" title="삭제">✕</button>
  `;
  card.appendChild(header);

  if (slide.type === 'cover' || slide.type === 'section') {
    card.appendChild(mkLabel('제목'));
    card.appendChild(mkToolbar());
    const h = document.createElement('div');
    h.className = 'editable';
    h.contentEditable = 'true';
    h.dataset.field = 'heading';
    h.dataset.placeholder = slide.type === 'cover' ? '커버 제목을 입력하세요' : '섹션 제목을 입력하세요';
    h.innerHTML = slide.heading || '';
    card.appendChild(h);
  }

  if (slide.type === 'cover') {
    card.appendChild(mkLabel('해시태그 (선택)'));
    const tag = document.createElement('input');
    tag.type = 'text';
    tag.className = 'editable';
    tag.placeholder = '#사업가 인사이트';
    tag.value = slide.hashtag || '';
    tag.dataset.field = 'hashtag';
    card.appendChild(tag);
  }

  card.appendChild(mkLabel('본문'));
  card.appendChild(mkToolbar());
  const body = document.createElement('div');
  body.className = 'editable body-editable';
  body.contentEditable = 'true';
  body.dataset.field = 'body';
  body.dataset.placeholder = '본문을 입력하세요 (엔터로 줄바꿈)';
  body.innerHTML = slide.body || '';
  card.appendChild(body);

  const imgRow = document.createElement('div');
  imgRow.className = 'image-row';
  imgRow.innerHTML = `
    ${slide.imageSrc ? `<img class="image-thumb-sm" src="${slide.imageSrc}">` : ''}
    <span>${slide.imageSrc ? '배경 이미지 설정됨 (다크 오버레이 자동 적용)' : '배경 이미지 없음 (흰 배경)'}</span>
    <div style="flex:1"></div>
    <button class="small-btn" data-action="upload">${slide.image ? '교체' : '이미지 추가'}</button>
    ${slide.image ? `<button class="small-btn" data-action="remove-image">제거</button>` : ''}
  `;
  card.appendChild(imgRow);

  attachCardHandlers(card, slide);
  return card;
}

function mkLabel(text) {
  const el = document.createElement('div');
  el.className = 'field-label';
  el.textContent = text;
  return el;
}

function mkToolbar() {
  const tb = document.createElement('div');
  tb.className = 'format-toolbar';
  tb.innerHTML = `
    <button data-fmt="hl" class="hl">하이라이트</button>
    <button data-fmt="bold"><b>B</b> 볼드</button>
  `;
  return tb;
}

function attachCardHandlers(card, slide) {
  card.querySelector('.card-type-select').addEventListener('change', e => {
    slide.type = e.target.value;
    renderEditor();
    renderCurrent();
  });

  card.querySelectorAll('button[data-action]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const action = btn.dataset.action;
      const idx = state.slides.indexOf(slide);
      if (action === 'up' && idx > 0) {
        [state.slides[idx - 1], state.slides[idx]] = [state.slides[idx], state.slides[idx - 1]];
        state.currentIdx = idx - 1;
      } else if (action === 'down' && idx < state.slides.length - 1) {
        [state.slides[idx + 1], state.slides[idx]] = [state.slides[idx], state.slides[idx + 1]];
        state.currentIdx = idx + 1;
      } else if (action === 'delete') {
        if (state.slides.length <= 1) { alert('최소 한 장은 있어야 합니다.'); return; }
        state.slides.splice(idx, 1);
        if (state.currentIdx >= state.slides.length) state.currentIdx = state.slides.length - 1;
      } else if (action === 'upload') {
        state.activeFileSlideId = slide.id;
        $('#file-input').click();
        return;
      } else if (action === 'remove-image') {
        slide.image = null;
        slide.imageSrc = null;
      }
      renderEditor();
      renderCurrent();
    });
  });

  card.querySelectorAll('.editable[contenteditable]').forEach(el => {
    const field = el.dataset.field;
    el.addEventListener('input', () => {
      slide[field] = el.innerHTML;
      if (state.slides.indexOf(slide) === state.currentIdx) renderCurrent();
    });
    el.addEventListener('focus', () => {
      const idx = state.slides.indexOf(slide);
      if (idx !== state.currentIdx) {
        state.currentIdx = idx;
        updateActiveCard();
        renderCurrent();
      }
    });
    el.addEventListener('paste', e => {
      e.preventDefault();
      const text = (e.clipboardData || window.clipboardData).getData('text');
      document.execCommand('insertText', false, text);
    });
  });

  const hashtagInput = card.querySelector('input[data-field="hashtag"]');
  if (hashtagInput) {
    hashtagInput.addEventListener('input', () => {
      slide.hashtag = hashtagInput.value;
      if (state.slides.indexOf(slide) === state.currentIdx) renderCurrent();
    });
    hashtagInput.addEventListener('focus', () => {
      const idx = state.slides.indexOf(slide);
      if (idx !== state.currentIdx) { state.currentIdx = idx; updateActiveCard(); renderCurrent(); }
    });
  }

  card.querySelectorAll('.format-toolbar button[data-fmt]').forEach(btn => {
    btn.addEventListener('mousedown', e => {
      e.preventDefault();
      const fmt = btn.dataset.fmt;
      if (fmt === 'bold') document.execCommand('bold');
      else if (fmt === 'hl') applyHighlight();
      const activeEl = document.activeElement;
      if (activeEl && activeEl.classList.contains('editable') && activeEl.isContentEditable) {
        slide[activeEl.dataset.field] = activeEl.innerHTML;
        if (state.slides.indexOf(slide) === state.currentIdx) renderCurrent();
      }
    });
  });
}

/**
 * Toggle highlight on the current selection.
 *
 * Decision rule (important — this is what makes repeated clicks work):
 *   - Trim whitespace at selection boundaries. This way if the user drags a
 *     little past the actual word, the surrounding spaces don't widen the
 *     highlight each click.
 *   - If ANY char in the trimmed range is already highlighted → REMOVE highlight
 *     from the whole trimmed range. If NO char is highlighted → ADD.
 *     (Using ALL-highlighted as the remove condition was buggy: one stray
 *     non-highlighted char near the boundary flipped the decision to ADD,
 *     which expanded the highlight instead of removing it.)
 */
function applyHighlight() {
  const sel = window.getSelection();
  if (!sel.rangeCount) return;
  const range = sel.getRangeAt(0);
  if (range.collapsed) return;

  const editable = findEditableAncestor(range.commonAncestorContainer);
  if (!editable) return;

  const { tokens, startIdx, endIdx } = flattenEditableWithRange(editable, range);
  if (startIdx < 0 || endIdx < 0 || endIdx <= startIdx) return;

  let s = startIdx, e = endIdx;
  while (s < e && tokens[s].type === 'char' && /\s/.test(tokens[s].ch)) s++;
  while (e > s && tokens[e - 1].type === 'char' && /\s/.test(tokens[e - 1].ch)) e--;
  if (e <= s) return;

  let anyChar = false;
  let anyHighlighted = false;
  for (let i = s; i < e; i++) {
    if (tokens[i].type !== 'char') continue;
    anyChar = true;
    if (tokens[i].hl) { anyHighlighted = true; break; }
  }
  if (!anyChar) return;

  const nextHl = !anyHighlighted;
  for (let i = s; i < e; i++) {
    if (tokens[i].type === 'char') tokens[i].hl = nextHl;
  }

  editable.innerHTML = tokensToHtml(tokens);
  window.getSelection().removeAllRanges();
  editable.focus();
}

function findEditableAncestor(node) {
  while (node && node !== document.body) {
    if (node.nodeType === Node.ELEMENT_NODE && node.isContentEditable) return node;
    node = node.parentNode;
  }
  return null;
}

/**
 * Walk `editable` and produce a flat token list:
 *   { type: 'char', ch, hl, bold, sourceNode, sourceOffset } for each character
 *   { type: 'br' } for each <br> / implicit block boundary
 * If `range` is passed, also returns startIdx/endIdx mapping the range boundaries into token positions.
 */
function flattenEditableWithRange(editable, range) {
  const tokens = [];
  let startIdx = -1, endIdx = -1;

  const markBoundary = (container, offset) => {
    if (!range) return;
    if (startIdx === -1 && range.startContainer === container && range.startOffset === offset) {
      startIdx = tokens.length;
    }
    if (endIdx === -1 && range.endContainer === container && range.endOffset === offset) {
      endIdx = tokens.length;
    }
  };

  function walk(node, style) {
    markBoundary(node, 0);
    const children = node.childNodes;
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      if (child.nodeType === Node.TEXT_NODE) {
        const text = child.textContent;
        for (let off = 0; off < text.length; off++) {
          markBoundary(child, off);
          tokens.push({ type: 'char', ch: text[off], hl: style.hl, bold: style.bold, sourceNode: child, sourceOffset: off });
        }
        markBoundary(child, text.length);
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        const tag = child.tagName;
        if (tag === 'BR') {
          tokens.push({ type: 'br' });
        } else {
          if ((tag === 'DIV' || tag === 'P') && tokens.length && tokens[tokens.length - 1].type !== 'br') {
            tokens.push({ type: 'br' });
          }
          const nextStyle = { ...style };
          if (child.classList && child.classList.contains('hl-mark')) nextStyle.hl = true;
          if (tag === 'B' || tag === 'STRONG') nextStyle.bold = true;
          const fw = child.style && child.style.fontWeight;
          if (fw && (fw === 'bold' || parseInt(fw, 10) >= 600)) nextStyle.bold = true;
          walk(child, nextStyle);
        }
      }
      markBoundary(node, i + 1);
    }
  }
  walk(editable, { hl: false, bold: false });
  return { tokens, startIdx, endIdx };
}

function tokensToHtml(tokens) {
  let html = '';
  const state = { hl: false, bold: false };
  const transition = (nextHl, nextBold) => {
    // When hl toggles, close bold first (so <b> stays nested inside <span class="hl-mark">)
    if (nextHl !== state.hl && state.bold) { html += '</b>'; state.bold = false; }
    if (!nextHl && state.hl) { html += '</span>'; state.hl = false; }
    if (nextHl && !state.hl) { html += '<span class="hl-mark">'; state.hl = true; }
    if (!nextBold && state.bold) { html += '</b>'; state.bold = false; }
    if (nextBold && !state.bold) { html += '<b>'; state.bold = true; }
  };
  for (const t of tokens) {
    if (t.type === 'br') {
      transition(false, false);
      html += '<br>';
      continue;
    }
    transition(t.hl, t.bold);
    html += escapeChar(t.ch);
  }
  transition(false, false);
  return html;
}

function escapeChar(ch) {
  if (ch === '<') return '&lt;';
  if (ch === '>') return '&gt;';
  if (ch === '&') return '&amp;';
  return ch;
}

function placeSelectionAtTokenRange(tokens, startIdx, endIdx) {
  const startPos = domPosBeforeToken(tokens, startIdx);
  const endPos = domPosAfterToken(tokens, endIdx);
  if (!startPos || !endPos) return;
  const editable = findEditableAncestor(startPos.node);
  if (editable) editable.focus();
  const r = document.createRange();
  try {
    r.setStart(startPos.node, startPos.offset);
    r.setEnd(endPos.node, endPos.offset);
  } catch (e) { return; }
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(r);
}

// Position in the DOM immediately BEFORE the token at idx.
function domPosBeforeToken(tokens, idx) {
  if (idx < tokens.length && tokens[idx].type === 'char') {
    return { node: tokens[idx].sourceNode, offset: tokens[idx].sourceOffset };
  }
  for (let i = Math.min(idx, tokens.length) - 1; i >= 0; i--) {
    if (tokens[i].type === 'char') {
      return { node: tokens[i].sourceNode, offset: tokens[i].sourceOffset + 1 };
    }
  }
  return null;
}

// Position in the DOM immediately AFTER the token at idx-1.
// Prefers the previous char's node + offset+1 so both range endpoints live in the
// same text node when possible — avoids browser-specific range normalization quirks
// that can shrink the selection on subsequent clicks.
function domPosAfterToken(tokens, idx) {
  if (idx > 0 && idx <= tokens.length && tokens[idx - 1].type === 'char') {
    const t = tokens[idx - 1];
    return { node: t.sourceNode, offset: t.sourceOffset + 1 };
  }
  return domPosBeforeToken(tokens, idx);
}

function updateActiveCard() {
  document.querySelectorAll('.slide-card').forEach((c, i) => {
    c.classList.toggle('active', i === state.currentIdx);
  });
}

/* ---------- Actions ---------- */

function addSlide() {
  state.slides.push(makeSlide({ type: 'body' }));
  state.currentIdx = state.slides.length - 1;
  renderEditor();
  renderCurrent();
  const editor = $('#slide-editor');
  editor.scrollTop = editor.scrollHeight;
}

function loadSample() {
  state.slides = SAMPLE_SLIDES.map(s => makeSlide(s));
  state.currentIdx = 0;
  renderEditor();
  renderCurrent();
}

function importBulk(text) {
  if (!text.trim()) return;
  const chunks = text.split(/\n\s*\n/).map(c => c.trim()).filter(Boolean);
  const slides = chunks.map(chunk => {
    const body = escapeHtml(chunk).replace(/\n/g, '<br>');
    return makeSlide({ type: 'body', body });
  });
  if (slides.length === 0) return;
  state.slides = slides;
  state.currentIdx = 0;
  renderEditor();
  renderCurrent();
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Render directly at the chosen output size (no supersample-then-downscale).
// Native rendering at higher resolution gives crisper text than downsampling
// from a big canvas, because Chrome's drawImage softens edges during scale.
function downloadCurrent() {
  if (!state.slides.length) return;
  const scale = Math.max(1, state.exportScale || 1);
  const off = document.createElement('canvas');
  renderSlide(state.slides[state.currentIdx], off, scale);
  off.toBlob(blob => {
    triggerDownload(blob, `slide-${String(state.currentIdx + 1).padStart(2, '0')}.png`);
  }, 'image/png');
}

async function downloadAll() {
  if (!state.slides.length) return;
  const zip = new JSZip();
  const scale = Math.max(1, state.exportScale || 1);
  for (let i = 0; i < state.slides.length; i++) {
    const off = document.createElement('canvas');
    renderSlide(state.slides[i], off, scale);
    const blob = await new Promise(r => off.toBlob(r, 'image/png'));
    zip.file(`slide-${String(i + 1).padStart(2, '0')}.png`, blob);
  }
  const zipBlob = await zip.generateAsync({ type: 'blob' });
  triggerDownload(zipBlob, 'cardnews.zip');
}

/* ---------- Event bindings ---------- */

$('#add-slide').addEventListener('click', addSlide);
$('#load-sample').addEventListener('click', loadSample);
$('#bulk-import').addEventListener('click', () => {
  $('#import-text').value = '';
  $('#import-modal').classList.add('show');
});
$('#import-cancel').addEventListener('click', () => $('#import-modal').classList.remove('show'));
$('#import-confirm').addEventListener('click', () => {
  importBulk($('#import-text').value);
  $('#import-modal').classList.remove('show');
});
$('#highlight-color').addEventListener('input', e => {
  state.highlightColor = e.target.value;
  document.documentElement.style.setProperty('--highlight-color', e.target.value);
  renderCurrent();
});
$('#prev').addEventListener('click', () => {
  if (state.currentIdx > 0) { state.currentIdx--; updateActiveCard(); renderCurrent(); }
});
$('#next').addEventListener('click', () => {
  if (state.currentIdx < state.slides.length - 1) { state.currentIdx++; updateActiveCard(); renderCurrent(); }
});
$('#download-current').addEventListener('click', downloadCurrent);
$('#download-all').addEventListener('click', downloadAll);

$('#file-input').addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file || !state.activeFileSlideId) return;
  const slide = state.slides.find(s => s.id === state.activeFileSlideId);
  if (!slide) return;
  const reader = new FileReader();
  reader.onload = ev => {
    const img = new Image();
    img.onload = () => {
      slide.image = img;
      slide.imageSrc = ev.target.result;
      renderEditor();
      renderCurrent();
    };
    img.src = ev.target.result;
  };
  reader.readAsDataURL(file);
  e.target.value = '';
  state.activeFileSlideId = null;
});

document.addEventListener('keydown', e => {
  const tag = document.activeElement.tagName;
  const editable = document.activeElement.isContentEditable;
  if (tag === 'TEXTAREA' || tag === 'INPUT' || editable) return;
  if (e.key === 'ArrowLeft') $('#prev').click();
  if (e.key === 'ArrowRight') $('#next').click();
});

/* ---------- Profile image modal ---------- */

const profileState = {
  bgColor: '#03C75A',
  text: '프로필',
  textColor: '#ffffff',
  fontSize: 50, // percentage of image size
  bold: true,
  size: 1000,
};

function renderProfileTo(canvas, targetSize) {
  canvas.width = targetSize;
  canvas.height = targetSize;
  const c = canvas.getContext('2d');
  c.imageSmoothingEnabled = true;
  c.imageSmoothingQuality = 'high';

  c.fillStyle = profileState.bgColor;
  c.fillRect(0, 0, targetSize, targetSize);

  const text = profileState.text;
  if (!text || !text.trim()) return;

  const fontPx = (profileState.fontSize / 100) * targetSize;
  const weight = profileState.bold ? 900 : 500;
  c.font = `${weight} ${fontPx}px "Pretendard Variable", Pretendard, sans-serif`;
  c.fillStyle = profileState.textColor;
  c.textAlign = 'center';
  c.textBaseline = 'middle';

  const lines = text.split('\n');
  const lineHeight = fontPx * 1.15;
  const totalHeight = (lines.length - 1) * lineHeight;
  const startY = targetSize / 2 - totalHeight / 2;

  lines.forEach((line, i) => {
    c.fillText(line, targetSize / 2, startY + i * lineHeight);
  });
}

function renderProfilePreview() {
  renderProfileTo($('#profile-preview'), 500);
}

function downloadProfile() {
  const canvas = document.createElement('canvas');
  renderProfileTo(canvas, profileState.size);
  canvas.toBlob(blob => {
    triggerDownload(blob, `profile-${Date.now()}.png`);
  }, 'image/png');
}

function saveProfileSettings() {
  try { localStorage.setItem('cardnews_profile', JSON.stringify(profileState)); } catch {}
}

function loadProfileSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem('cardnews_profile') || '{}');
    Object.assign(profileState, saved);
  } catch {}
}

function openProfileModal() {
  $('#profile-bg-color').value = profileState.bgColor;
  $('#profile-text').value = profileState.text;
  $('#profile-text-color').value = profileState.textColor;
  $('#profile-font-size').value = profileState.fontSize;
  $('#profile-font-size-display').textContent = profileState.fontSize + '%';
  $('#profile-bold').checked = profileState.bold;
  $('#profile-size').value = String(profileState.size);
  renderProfilePreview();
  $('#profile-modal').classList.add('show');
}

$('#profile-modal-btn').addEventListener('click', openProfileModal);
$('#profile-close-btn').addEventListener('click', () => $('#profile-modal').classList.remove('show'));
$('#profile-download-btn').addEventListener('click', downloadProfile);

$('#profile-bg-color').addEventListener('input', e => {
  profileState.bgColor = e.target.value;
  saveProfileSettings(); renderProfilePreview();
});
$('#profile-text').addEventListener('input', e => {
  profileState.text = e.target.value;
  saveProfileSettings(); renderProfilePreview();
});
$('#profile-text-color').addEventListener('input', e => {
  profileState.textColor = e.target.value;
  saveProfileSettings(); renderProfilePreview();
});
$('#profile-font-size').addEventListener('input', e => {
  profileState.fontSize = parseInt(e.target.value, 10) || 50;
  $('#profile-font-size-display').textContent = profileState.fontSize + '%';
  saveProfileSettings(); renderProfilePreview();
});
$('#profile-bold').addEventListener('change', e => {
  profileState.bold = e.target.checked;
  saveProfileSettings(); renderProfilePreview();
});
$('#profile-size').addEventListener('change', e => {
  profileState.size = parseInt(e.target.value, 10) || 1000;
  saveProfileSettings();
});

/* ---------- Design settings modal ---------- */

function toggleDesignBgFields() {
  const type = state.background.type;
  $('#bg-color2-section').style.display = type === 'gradient' ? '' : 'none';
  $('#bg-gradient-dir-section').style.display = type === 'gradient' ? '' : 'none';
}

function openDesignModal() {
  $('#font-scale').value = state.fontScale;
  $('#font-scale-display').textContent = Math.round(state.fontScale * 100) + '%';
  document.querySelectorAll('input[name="bg-type"]').forEach(r => {
    r.checked = r.value === state.background.type;
  });
  $('#bg-color').value = state.background.color;
  $('#bg-color2').value = state.background.color2;
  $('#bg-gradient-dir').value = state.background.gradientDirection;
  $('#export-scale').value = String(state.exportScale);
  toggleDesignBgFields();
  $('#design-modal').classList.add('show');
}

function saveDesignSettings() {
  try {
    localStorage.setItem('cardnews_design', JSON.stringify({
      fontScale: state.fontScale,
      exportScale: state.exportScale,
      background: state.background,
    }));
  } catch {}
}

function loadDesignSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem('cardnews_design') || '{}');
    if (typeof saved.fontScale === 'number') state.fontScale = saved.fontScale;
    if (typeof saved.exportScale === 'number') state.exportScale = saved.exportScale;
    if (saved.background) Object.assign(state.background, saved.background);
  } catch {}
}

$('#design-settings-btn').addEventListener('click', openDesignModal);
$('#design-close-btn').addEventListener('click', () => $('#design-modal').classList.remove('show'));

$('#font-scale').addEventListener('input', e => {
  state.fontScale = parseFloat(e.target.value) || 1;
  $('#font-scale-display').textContent = Math.round(state.fontScale * 100) + '%';
  saveDesignSettings();
  renderCurrent();
});

document.querySelectorAll('input[name="bg-type"]').forEach(r => {
  r.addEventListener('change', () => {
    state.background.type = r.value;
    toggleDesignBgFields();
    saveDesignSettings();
    renderCurrent();
  });
});

$('#bg-color').addEventListener('input', e => {
  state.background.color = e.target.value;
  saveDesignSettings();
  renderCurrent();
});
$('#bg-color2').addEventListener('input', e => {
  state.background.color2 = e.target.value;
  saveDesignSettings();
  renderCurrent();
});
$('#bg-gradient-dir').addEventListener('change', e => {
  state.background.gradientDirection = e.target.value;
  saveDesignSettings();
  renderCurrent();
});
$('#export-scale').addEventListener('change', e => {
  state.exportScale = parseInt(e.target.value, 10) || 2;
  saveDesignSettings();
});

/* ---------- Brand settings modal ---------- */

const POSITIONS = [
  'top-left', 'top-center', 'top-right',
  'middle-left', 'middle-center', 'middle-right',
  'bottom-left', 'bottom-center', 'bottom-right',
];
const POSITION_ARROWS = {
  'top-left': '↖', 'top-center': '↑', 'top-right': '↗',
  'middle-left': '←', 'middle-center': '●', 'middle-right': '→',
  'bottom-left': '↙', 'bottom-center': '↓', 'bottom-right': '↘',
};

function buildPositionGrid(gridId, stateField) {
  const grid = $('#' + gridId);
  grid.innerHTML = '';
  POSITIONS.forEach(pos => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = POSITION_ARROWS[pos];
    btn.dataset.pos = pos;
    btn.addEventListener('click', () => {
      state.brand[stateField] = pos;
      updatePositionGridSelection(gridId, pos);
      saveBrandSettings();
      renderCurrent();
    });
    grid.appendChild(btn);
  });
}

function updatePositionGridSelection(gridId, currentPos) {
  $('#' + gridId).querySelectorAll('button').forEach(b => {
    b.classList.toggle('selected', b.dataset.pos === currentPos);
  });
}

function updateBrandImagePreview() {
  const wrap = $('#brand-image-preview-wrap');
  wrap.innerHTML = '';
  if (state.brand.imageSrc) {
    wrap.classList.remove('empty');
    const img = document.createElement('img');
    img.src = state.brand.imageSrc;
    wrap.appendChild(img);
  } else {
    wrap.classList.add('empty');
    wrap.textContent = '선택된 이미지 없음';
  }
}

function toggleBrandTypeUI() {
  const type = state.brand.type;
  $('#brand-text-section').style.display = type === 'text' ? '' : 'none';
  $('#brand-image-section').style.display = type === 'image' ? '' : 'none';
}

function openBrandModal() {
  document.querySelectorAll('input[name="brand-type"]').forEach(r => {
    r.checked = r.value === state.brand.type;
  });
  toggleBrandTypeUI();
  $('#brand-text').value = state.brand.text;
  $('#brand-text-size').value = state.brand.textSize;
  updateBrandImagePreview();
  $('#brand-image-size').value = state.brand.imageSize;
  $('#brand-image-size-display').textContent = state.brand.imageSize + '%';
  updatePositionGridSelection('cover-pos-grid', state.brand.coverPosition);
  updatePositionGridSelection('body-pos-grid', state.brand.bodyPosition);
  $('#brand-cover-above-heading').checked = !!state.brand.coverAboveHeading;
  applyCoverAboveHeadingUI();
  $('#brand-modal').classList.add('show');
}

function applyCoverAboveHeadingUI() {
  // When "above heading" is on, only horizontal alignment matters; dim out
  // the vertical row labels so the user knows vertical choice is ignored.
  const on = state.brand.coverAboveHeading;
  const grid = $('#cover-pos-grid');
  grid.classList.toggle('horizontal-only', on);
}

function saveBrandSettings() {
  const { image, ...saveable } = state.brand;
  try { localStorage.setItem('cardnews_brand', JSON.stringify(saveable)); } catch {}
}

function loadBrandSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem('cardnews_brand') || '{}');
    Object.assign(state.brand, saved);
    if (saved.imageSrc) {
      const img = new Image();
      img.onload = () => { state.brand.image = img; renderCurrent(); };
      img.src = saved.imageSrc;
    }
  } catch {}
}

buildPositionGrid('cover-pos-grid', 'coverPosition');
buildPositionGrid('body-pos-grid', 'bodyPosition');

$('#brand-settings-btn').addEventListener('click', openBrandModal);
$('#brand-close-btn').addEventListener('click', () => $('#brand-modal').classList.remove('show'));
$('#brand-cover-above-heading').addEventListener('change', e => {
  state.brand.coverAboveHeading = e.target.checked;
  applyCoverAboveHeadingUI();
  saveBrandSettings();
  renderCurrent();
});

document.querySelectorAll('input[name="brand-type"]').forEach(r => {
  r.addEventListener('change', () => {
    state.brand.type = r.value;
    toggleBrandTypeUI();
    saveBrandSettings();
    renderCurrent();
  });
});

$('#brand-text').addEventListener('input', e => {
  state.brand.text = e.target.value;
  saveBrandSettings();
  renderCurrent();
});
$('#brand-text-size').addEventListener('input', e => {
  state.brand.textSize = parseInt(e.target.value, 10) || 24;
  saveBrandSettings();
  renderCurrent();
});
$('#brand-image-size').addEventListener('input', e => {
  state.brand.imageSize = parseInt(e.target.value, 10) || 15;
  $('#brand-image-size-display').textContent = state.brand.imageSize + '%';
  saveBrandSettings();
  renderCurrent();
});
$('#brand-image-upload-btn').addEventListener('click', () => $('#brand-file-input').click());
$('#brand-image-remove-btn').addEventListener('click', () => {
  state.brand.image = null;
  state.brand.imageSrc = null;
  updateBrandImagePreview();
  saveBrandSettings();
  renderCurrent();
});
$('#brand-file-input').addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    const img = new Image();
    img.onload = () => {
      state.brand.image = img;
      state.brand.imageSrc = ev.target.result;
      updateBrandImagePreview();
      saveBrandSettings();
      renderCurrent();
    };
    img.src = ev.target.result;
  };
  reader.readAsDataURL(file);
  e.target.value = '';
});

/* ---------- AI integration (Anthropic / OpenAI / Google) ---------- */

const AI_SYSTEM_PROMPT = `당신은 한국어 콘텐츠 크리에이터를 돕는 카드뉴스 디자인 전문가입니다.
사용자가 입력한 릴스/쇼츠 대본을 인스타그램 카드뉴스 슬라이드로 변환합니다.

# 슬라이드 타입
- "cover": 첫 슬라이드. 큰 제목과 선택적 해시태그. 이미지 위에 흰 텍스트가 올라간다고 가정.
- "section": 주요 포인트 단위의 섹션 제목 + 본문. heading은 전체가 자동으로 파란 하이라이트로 처리됨.
- "body": 헤드라인 없는 본문 슬라이드. 도입부, 부연 설명, 마무리에 사용.

# 슬라이드 객체 필드
- type: "cover" | "section" | "body"
- heading: 제목 (cover/section에만 사용)
- hashtag: 해시태그 (cover에만 사용, 선택)
- body: 본문 텍스트 (모든 타입에서 사용 가능, cover는 선택)

# HTML 태그 사용 규칙 (heading/body 내부)
- <b>텍스트</b>: 굵은 강조. body 안 핵심 구절에 사용.
- <span class="hl-mark">텍스트</span>: 파란 하이라이트. **오직 cover의 heading 안**에서 핵심 단어 1곳에만 사용.
- <br>: 줄바꿈. 가독성 위해 자주 사용.
- <br><br>: 문단 구분.
- 그 외 태그 금지. 따옴표는 " 그대로 사용 가능.

# 작성 규칙
1. 첫 슬라이드는 반드시 cover. 짧고 훅이 있는 제목 + 핵심 단어 1곳에 <span class="hl-mark">. 관련 해시태그도 추가.
2. 주요 포인트(일반적으로 2~4개)는 각각 section 슬라이드로. heading은 "기준1. XXX", "원칙2. XXX" 식으로 번호를 붙이면 좋음. **section heading 안에는 <span class="hl-mark">를 절대 쓰지 마세요** (전체가 자동 하이라이트됨).
3. body 슬라이드는 도입 훅, 각 section 뒤의 부연 설명, 마무리 메시지 등에 사용.
4. 본문은 <br>로 자주 줄바꿈. 한 슬라이드당 본문 6줄 이내. 긴 내용은 body 여러 장으로 쪼개기.
5. 본문 안 핵심 구절 1~3곳에 <b>로 강조. 과하게 쓰지 말 것.
6. 이상적 흐름: cover → body(훅/도입) → section+body 반복 → body(마무리 또는 CTA).
7. 입력 대본의 어조·문체·용어를 최대한 유지. 새로운 내용을 지어내지 말 것. 다만 문장을 간결하게 다듬어도 됨.
8. 전체 슬라이드 수는 대본 분량에 비례 (짧으면 5~7장, 길면 10~15장).

generate_slides 도구를 사용해 슬라이드 배열을 반환하세요.`;

const SLIDE_TOOL = {
  name: 'generate_slides',
  description: '사용자의 대본을 카드뉴스 슬라이드 배열로 변환합니다.',
  input_schema: {
    type: 'object',
    properties: {
      slides: {
        type: 'array',
        description: '카드뉴스 슬라이드 배열 (첫 슬라이드는 반드시 cover 타입)',
        items: {
          type: 'object',
          properties: {
            type: { type: 'string', enum: ['cover', 'section', 'body'] },
            heading: { type: 'string', description: 'cover/section 타입의 제목' },
            hashtag: { type: 'string', description: 'cover 타입의 해시태그 (#태그명)' },
            body: { type: 'string', description: '본문 텍스트 (HTML 허용: <b>, <span class="hl-mark">, <br>)' },
          },
          required: ['type'],
        },
        minItems: 1,
      },
    },
    required: ['slides'],
  },
};

const PROVIDERS = {
  anthropic: {
    label: 'Anthropic Claude',
    models: [
      { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6 (권장 · 균형)' },
      { id: 'claude-opus-4-7', label: 'Claude Opus 4.7 (최고 품질)' },
      { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5 (빠름 · 저렴)' },
    ],
    keyPlaceholder: 'sk-ant-api03-...',
    keyUrl: 'https://console.anthropic.com/settings/keys',
  },
  openai: {
    label: 'OpenAI GPT',
    models: [
      { id: 'gpt-4o', label: 'GPT-4o (권장 · 균형)' },
      { id: 'gpt-4o-mini', label: 'GPT-4o mini (빠름 · 저렴)' },
      { id: 'gpt-4.1', label: 'GPT-4.1 (최신)' },
    ],
    keyPlaceholder: 'sk-...',
    keyUrl: 'https://platform.openai.com/api-keys',
  },
  google: {
    label: 'Google Gemini',
    models: [
      { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash (권장 · 균형)' },
      { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro (최고 품질)' },
      { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash (빠름 · 저렴)' },
    ],
    keyPlaceholder: 'AIza...',
    keyUrl: 'https://aistudio.google.com/apikey',
  },
};

function loadAiSettings() {
  try { return JSON.parse(localStorage.getItem('cardnews_ai') || '{}'); }
  catch { return {}; }
}
function saveAiSettings(obj) {
  localStorage.setItem('cardnews_ai', JSON.stringify(obj));
}

function normalizeAiHtml(s) {
  if (!s) return '';
  return s.replace(/\r/g, '').replace(/\n/g, '<br>');
}

const USER_PROMPT = script => `다음 대본을 카드뉴스 슬라이드로 변환해주세요:\n\n${script}`;

async function callClaude(apiKey, model, script) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      system: AI_SYSTEM_PROMPT,
      tools: [SLIDE_TOOL],
      tool_choice: { type: 'tool', name: SLIDE_TOOL.name },
      messages: [{ role: 'user', content: USER_PROMPT(script) }],
    }),
  });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try { const err = await res.json(); msg = err.error?.message || JSON.stringify(err); } catch {}
    throw new Error(msg);
  }
  const data = await res.json();
  const toolUse = (data.content || []).find(c => c.type === 'tool_use');
  if (!toolUse?.input?.slides) throw new Error('AI 응답에서 슬라이드를 추출할 수 없습니다.');
  return toolUse.input.slides;
}

async function callOpenAI(apiKey, model, script) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: AI_SYSTEM_PROMPT },
        { role: 'user', content: USER_PROMPT(script) },
      ],
      tools: [{
        type: 'function',
        function: {
          name: SLIDE_TOOL.name,
          description: SLIDE_TOOL.description,
          parameters: SLIDE_TOOL.input_schema,
        },
      }],
      tool_choice: { type: 'function', function: { name: SLIDE_TOOL.name } },
    }),
  });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try { const err = await res.json(); msg = err.error?.message || JSON.stringify(err); } catch {}
    throw new Error(msg);
  }
  const data = await res.json();
  const args = data.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  if (!args) throw new Error('AI 응답에서 슬라이드를 추출할 수 없습니다.');
  const parsed = JSON.parse(args);
  if (!Array.isArray(parsed.slides)) throw new Error('slides 배열이 없습니다.');
  return parsed.slides;
}

async function callGemini(apiKey, model, script) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: AI_SYSTEM_PROMPT }] },
      contents: [{ role: 'user', parts: [{ text: USER_PROMPT(script) }] }],
      tools: [{
        functionDeclarations: [{
          name: SLIDE_TOOL.name,
          description: SLIDE_TOOL.description,
          parameters: SLIDE_TOOL.input_schema,
        }],
      }],
      toolConfig: {
        functionCallingConfig: {
          mode: 'ANY',
          allowedFunctionNames: [SLIDE_TOOL.name],
        },
      },
    }),
  });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try { const err = await res.json(); msg = err.error?.message || JSON.stringify(err); } catch {}
    throw new Error(msg);
  }
  const data = await res.json();
  const parts = data.candidates?.[0]?.content?.parts || [];
  const fc = parts.find(p => p.functionCall);
  if (!fc?.functionCall?.args?.slides) throw new Error('AI 응답에서 슬라이드를 추출할 수 없습니다.');
  return fc.functionCall.args.slides;
}

async function callAi(provider, apiKey, model, script) {
  if (provider === 'anthropic') return callClaude(apiKey, model, script);
  if (provider === 'openai') return callOpenAI(apiKey, model, script);
  if (provider === 'google') return callGemini(apiKey, model, script);
  throw new Error('지원하지 않는 제공사: ' + provider);
}

function populateModels(provider) {
  const modelSel = $('#api-model');
  modelSel.innerHTML = '';
  PROVIDERS[provider].models.forEach(m => {
    const opt = document.createElement('option');
    opt.value = m.id;
    opt.textContent = m.label;
    modelSel.appendChild(opt);
  });
}

function applyProvider(provider) {
  const p = PROVIDERS[provider];
  $('#api-key').placeholder = p.keyPlaceholder;
  $('#key-help-link').href = p.keyUrl;
  populateModels(provider);
}

function loadProviderSelections(provider) {
  const saved = loadAiSettings();
  $('#api-key').value = saved.keys?.[provider] || '';
  const savedModel = saved.models?.[provider];
  if (savedModel && PROVIDERS[provider].models.find(m => m.id === savedModel)) {
    $('#api-model').value = savedModel;
  }
}

function openAiModal() {
  const saved = loadAiSettings();
  const provider = saved.provider && PROVIDERS[saved.provider] ? saved.provider : 'anthropic';
  $('#api-provider').value = provider;
  applyProvider(provider);
  loadProviderSelections(provider);
  $('#ai-status').textContent = '';
  $('#ai-modal').classList.add('show');
}

function onProviderChange() {
  const provider = $('#api-provider').value;
  applyProvider(provider);
  loadProviderSelections(provider);
}

async function runAiConvert() {
  const provider = $('#api-provider').value;
  const apiKey = $('#api-key').value.trim();
  const model = $('#api-model').value;
  const script = $('#ai-script').value.trim();
  const statusEl = $('#ai-status');
  const runBtn = $('#ai-run');

  if (!apiKey) { statusEl.style.color = '#ff6b6b'; statusEl.textContent = 'API 키를 입력해주세요.'; return; }
  if (!script) { statusEl.style.color = '#ff6b6b'; statusEl.textContent = '대본을 입력해주세요.'; return; }
  if (state.slides.length > 0 && !confirm('기존 슬라이드가 대체됩니다. 계속하시겠습니까?')) return;

  const cur = loadAiSettings();
  cur.provider = provider;
  cur.keys = cur.keys || {};
  cur.models = cur.models || {};
  cur.keys[provider] = apiKey;
  cur.models[provider] = model;
  saveAiSettings(cur);

  runBtn.disabled = true;
  runBtn.textContent = '변환 중...';
  statusEl.style.color = 'var(--text-dim)';
  statusEl.textContent = `${PROVIDERS[provider].label}가 슬라이드를 생성하고 있습니다... (수 초 소요)`;

  try {
    const aiSlides = await callAi(provider, apiKey, model, script);
    if (!aiSlides.length) throw new Error('생성된 슬라이드가 없습니다.');
    state.slides = aiSlides.map(s => makeSlide({
      type: ['cover', 'section', 'body'].includes(s.type) ? s.type : 'body',
      heading: normalizeAiHtml(s.heading),
      hashtag: s.hashtag || '',
      body: normalizeAiHtml(s.body),
    }));
    state.currentIdx = 0;
    renderEditor();
    renderCurrent();
    $('#ai-modal').classList.remove('show');
  } catch (err) {
    statusEl.style.color = '#ff6b6b';
    statusEl.textContent = '오류: ' + err.message;
  } finally {
    runBtn.disabled = false;
    runBtn.textContent = '변환하기';
  }
}

$('#ai-convert-btn').addEventListener('click', openAiModal);
$('#ai-cancel').addEventListener('click', () => $('#ai-modal').classList.remove('show'));
$('#ai-run').addEventListener('click', runAiConvert);
$('#api-provider').addEventListener('change', onProviderChange);

/* ---------- Init ---------- */

(async () => {
  try {
    await document.fonts.load('900 86px "Pretendard Variable"');
    await document.fonts.load('400 40px "Pretendard Variable"');
    await document.fonts.load('900 54px "Pretendard Variable"');
  } catch (err) {}
  document.documentElement.style.setProperty('--highlight-color', state.highlightColor);
  loadBrandSettings();
  loadDesignSettings();
  loadProfileSettings();
  loadSample();
})();
