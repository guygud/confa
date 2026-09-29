// ============================================================================
// СКИН
// ----------------------------------------------------------------------------
// Общий визуальный язык обоих режимов: палитра, темы заездов и процедурные
// рисовалки. Растровых ассетов в мире нет — всё, что видно в кадре, собирается
// из примитивов канвы.
//
// Модуль ничего не знает о камере и состоянии. Он принимает уже спроецированные
// экранные точки вида { sx, sy, k } и рисует. Поэтому один файл честно
// переиспользуется двумя режимами без ветвлений.
// ============================================================================

/** Смысловые цвета в формате «r,g,b» — удобно подставлять в rgba(). */
export const PAL = {
  foe: "255,64,112",
  ally: "90,225,255",
  edge: "150,110,255",
  goal: "255,150,255",
  spark: "235,245,255",
  marker: "255,185,90",
};

const rgba = (rgb, a) => `rgba(${rgb},${a})`;

// ---------------------------------------------------------------------------
// Темы заездов
// ---------------------------------------------------------------------------

const HOOD = ["#3a1c66", "#150826"];

/**
 * Один набор тем на оба режима. Ключи объединены: hood нужен режиму A,
 * tint — режиму B. Лишний ключ никому не мешает, а расхождение палитр
 * сломало бы главное — ощущение, что это одна и та же игра.
 */
export const THEME_NEUTRAL = {
  shell: "#14081f",
  strip: ["#12081f", "#2a1050", "#6b3aa8"],
  floor: ["#3d1866", "#2a1048", "#140824"],
  lane: ["rgba(255,210,255,0.07)", "rgba(255,220,120,0.55)"],
  lines: "235,215,255",
  tint: [0.42, 0.35],
  hood: HOOD,
};

export const THEMES = {
  night: {
    shell: "#0a1020",
    strip: ["#080c18", "#122040", "#1a3a6a"],
    floor: ["#1a2a50", "#122040", "#080e1c"],
    lane: ["rgba(140,190,255,0.07)", "rgba(160,210,255,0.5)"],
    lines: "180,210,255",
    tint: [0.5, 0.22],
    hood: ["#1a2a50", "#070c18"],
  },
  blitz: {
    shell: "#061818",
    strip: ["#041414", "#0a3030", "#147070"],
    floor: ["#0e3a3a", "#0a2828", "#041414"],
    lane: ["rgba(80,255,230,0.08)", "rgba(90,255,220,0.55)"],
    lines: "140,255,240",
    tint: [0.38, 0.4],
    hood: ["#0e3a3a", "#041212"],
  },
  forge: {
    shell: "#1a0808",
    strip: ["#180606", "#4a1810", "#8a3020"],
    floor: ["#5a2018", "#3a1210", "#180606"],
    lane: ["rgba(255,180,120,0.08)", "rgba(255,160,80,0.55)"],
    lines: "255,200,150",
    tint: [0.36, 0.42],
    hood: ["#5a2018", "#1a0606"],
  },
  long: {
    shell: "#0c0818",
    strip: ["#0a0616", "#1a1040", "#3a2080"],
    floor: ["#241850", "#181036", "#0a0618"],
    lane: ["rgba(180,160,255,0.07)", "rgba(200,180,255,0.5)"],
    lines: "200,190,255",
    tint: [0.46, 0.28],
    hood: ["#241850", "#0a0618"],
  },
};

/** Нейтральные метки на полу вместо эмодзи-инвентаря прежней темы. */
export const MARKS = ["◆", "▲", "◇", "✦"];

export const MARKS_BY_ROUND = {
  night: ["◇", "✦", "◆"],
  blitz: ["▲", "◆", "△"],
  forge: ["◆", "✦", "▼"],
  long: ["◇", "✦", "◆", "△"],
};

// ---------------------------------------------------------------------------
// Примитивы
// ---------------------------------------------------------------------------

/**
 * Световое пятно на полу. Объект без тени висит в воздухе, поэтому пятно
 * рисуется под каждой стоящей фигурой.
 */
export function glowPool(ctx, sx, sy, rx, rgb, alpha) {
  const ry = Math.max(2, rx * 0.32);
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.translate(sx, sy);
  ctx.scale(1, ry / rx);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
  g.addColorStop(0, rgba(rgb, alpha));
  g.addColorStop(0.45, rgba(rgb, alpha * 0.35));
  g.addColorStop(1, rgba(rgb, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, rx, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/**
 * Пилон — вертикальная светящаяся капсула от пола вверх. Базовая фигура обоих
 * режимов: всё, во что нельзя въезжать, выглядит именно так.
 *
 * base и top — экранные точки низа и верха, halfW — половина ширины в пикселях.
 */
export function pylon(ctx, base, top, halfW, opts = {}) {
  const rgb = opts.rgb || PAL.foe;
  const alpha = opts.alpha == null ? 1 : opts.alpha;
  if (alpha <= 0.01) return;

  const w = Math.max(2, halfW);
  const x = base.sx;
  const yBase = base.sy;
  const yTop = Math.min(top.sy, yBase - 4);
  const h = yBase - yTop;
  const capR = Math.min(w, h * 0.3);

  glowPool(ctx, x, yBase, w * 3.2, rgb, 0.3 * alpha);

  ctx.save();
  ctx.globalAlpha = alpha;

  // Ореол вокруг колонны — он и делает фигуру читаемой на дальнем конце.
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  const halo = ctx.createLinearGradient(x - w * 3, 0, x + w * 3, 0);
  halo.addColorStop(0, rgba(rgb, 0));
  halo.addColorStop(0.5, rgba(rgb, 0.3));
  halo.addColorStop(1, rgba(rgb, 0));
  ctx.fillStyle = halo;
  ctx.fillRect(x - w * 3, yTop - capR, w * 6, h + capR * 2);
  ctx.restore();

  // Тело: снизу глухое, кверху разгорается.
  const body = ctx.createLinearGradient(0, yBase, 0, yTop);
  body.addColorStop(0, rgba(rgb, 0.45));
  body.addColorStop(0.5, rgba(rgb, 0.82));
  body.addColorStop(1, rgba(rgb, 0.95));
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.moveTo(x - w, yBase);
  ctx.lineTo(x - w, yTop + capR);
  ctx.quadraticCurveTo(x - w, yTop, x, yTop);
  ctx.quadraticCurveTo(x + w, yTop, x + w, yTop + capR);
  ctx.lineTo(x + w, yBase);
  ctx.closePath();
  ctx.fill();

  // Белое ядро по оси: держит силуэт, когда пилон далеко и узкий.
  ctx.globalCompositeOperation = "lighter";
  const coreW = Math.max(1, w * 0.3);
  const coreG = ctx.createLinearGradient(0, yBase, 0, yTop);
  coreG.addColorStop(0, "rgba(255,255,255,0)");
  coreG.addColorStop(0.6, "rgba(255,255,255,0.55)");
  coreG.addColorStop(1, "rgba(255,255,255,0.85)");
  ctx.fillStyle = coreG;
  ctx.fillRect(x - coreW, yTop + capR * 0.4, coreW * 2, h - capR * 0.4);

  // Шапка: самая яркая точка, по ней глаз ловит высоту.
  ctx.fillStyle = rgba(PAL.spark, 0.8);
  ctx.beginPath();
  ctx.ellipse(x, yTop + capR * 0.45, w * 0.7, capR * 0.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/**
 * Планка — горизонтальный брус между двумя точками. Перспективу считает
 * вызывающий: сюда приходят готовые низ и верх обоих концов.
 */
export function bar(ctx, aBase, bBase, aTop, bTop, opts = {}) {
  const rgb = opts.rgb || PAL.foe;
  const alpha = opts.alpha == null ? 1 : opts.alpha;
  if (alpha <= 0.01) return;

  ctx.save();
  ctx.globalAlpha = alpha;

  const g = ctx.createLinearGradient(0, aTop.sy, 0, aBase.sy);
  g.addColorStop(0, rgba(rgb, 0.95));
  g.addColorStop(1, rgba(rgb, 0.5));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(aTop.sx, aTop.sy);
  ctx.lineTo(bTop.sx, bTop.sy);
  ctx.lineTo(bBase.sx, bBase.sy);
  ctx.lineTo(aBase.sx, aBase.sy);
  ctx.closePath();
  ctx.fill();

  ctx.globalCompositeOperation = "lighter";
  ctx.strokeStyle = rgba(PAL.spark, 0.7);
  ctx.lineWidth = Math.max(1.5, Math.abs(aBase.sy - aTop.sy) * 0.16);
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(aTop.sx, aTop.sy);
  ctx.lineTo(bTop.sx, bTop.sy);
  ctx.stroke();
  ctx.restore();

  const mid = (aBase.sx + bBase.sx) / 2;
  const span = Math.abs(bBase.sx - aBase.sx);
  glowPool(ctx, mid, (aBase.sy + bBase.sy) / 2, Math.max(8, span * 0.6), rgb, 0.22 * alpha);
}

/** Кольцо-ускоритель: створ, сквозь который надо пройти. */
export function ring(ctx, cx, cy, rx, ry, opts = {}) {
  const rgb = opts.rgb || PAL.ally;
  const alpha = opts.alpha == null ? 1 : opts.alpha;
  if (alpha <= 0.01 || rx < 2) return;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.globalCompositeOperation = "lighter";

  const glow = ctx.createRadialGradient(cx, cy, rx * 0.55, cx, cy, rx * 1.25);
  glow.addColorStop(0, rgba(rgb, 0));
  glow.addColorStop(0.55, rgba(rgb, 0.3));
  glow.addColorStop(1, rgba(rgb, 0));
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx * 1.25, ry * 1.25, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = rgba(rgb, 0.9);
  ctx.lineWidth = Math.max(2, rx * 0.11);
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = rgba(PAL.spark, 0.55);
  ctx.lineWidth = Math.max(1, rx * 0.04);
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx * 0.93, ry * 0.93, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

/** Финишная арка: две стойки и перемычка. Заменяет ворота на горизонте. */
export function arch(ctx, baseL, baseR, topL, topR, opts = {}) {
  const rgb = opts.rgb || PAL.goal;
  const alpha = opts.alpha == null ? 1 : opts.alpha;
  if (alpha <= 0.01) return;

  const w = Math.max(2, Math.abs(baseR.sx - baseL.sx) * 0.055);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.globalCompositeOperation = "lighter";
  ctx.strokeStyle = rgba(rgb, 0.85);
  ctx.lineWidth = w;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(baseL.sx, baseL.sy);
  ctx.lineTo(topL.sx, topL.sy);
  ctx.quadraticCurveTo((topL.sx + topR.sx) / 2, topL.sy - w * 2.2, topR.sx, topR.sy);
  ctx.lineTo(baseR.sx, baseR.sy);
  ctx.stroke();

  ctx.strokeStyle = rgba(PAL.spark, 0.5);
  ctx.lineWidth = Math.max(1, w * 0.35);
  ctx.stroke();

  // Створ между стойками светится — цель видна задолго до подъезда.
  const midX = (baseL.sx + baseR.sx) / 2;
  const midY = (baseL.sy + topL.sy) / 2;
  const span = Math.abs(baseR.sx - baseL.sx) * 0.5;
  const veil = ctx.createLinearGradient(0, topL.sy, 0, baseL.sy);
  veil.addColorStop(0, rgba(rgb, 0.22));
  veil.addColorStop(1, rgba(rgb, 0.04));
  ctx.fillStyle = veil;
  ctx.fillRect(midX - span, topL.sy, span * 2, baseL.sy - topL.sy);
  ctx.restore();

  glowPool(ctx, midX, midY, span * 1.1, rgb, 0.2 * alpha);
}

/** Призма — мелкий путевой маркер вдоль коридора. */
export function prism(ctx, base, top, halfW, opts = {}) {
  const rgb = opts.rgb || PAL.marker;
  const alpha = opts.alpha == null ? 1 : opts.alpha;
  if (alpha <= 0.01) return;

  const w = Math.max(1.5, halfW);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = rgba(rgb, 0.7);
  ctx.beginPath();
  ctx.moveTo(base.sx, top.sy);
  ctx.lineTo(base.sx + w, base.sy);
  ctx.lineTo(base.sx - w, base.sy);
  ctx.closePath();
  ctx.fill();
  ctx.globalCompositeOperation = "lighter";
  ctx.strokeStyle = rgba(PAL.spark, 0.45);
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();

  glowPool(ctx, base.sx, base.sy, w * 2.4, rgb, 0.22 * alpha);
}

/** Искра: короткий радиальный всплеск. Заменяет спрайтовые вспышки. */
export function spark(ctx, sx, sy, size, alpha, rgb = PAL.spark) {
  if (alpha <= 0.02 || size < 1) return;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.globalAlpha = alpha;
  const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, size);
  g.addColorStop(0, rgba(PAL.spark, 0.9));
  g.addColorStop(0.35, rgba(rgb, 0.45));
  g.addColorStop(1, rgba(rgb, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(sx, sy, size, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/**
 * Полоса на полу. Три точки задают базис плоскости: центр, точка «вправо» и
 * точка «вглубь». Без нарезки на сегменты нет швов на перспективе.
 */
export function floorStreak(ctx, c, r, f, opts = {}) {
  const rgb = opts.rgb || PAL.edge;
  const alpha = opts.alpha == null ? 0.16 : opts.alpha;
  if (alpha <= 0.01) return;

  const rx = r.sx - c.sx;
  const ry = r.sy - c.sy;
  const fx = f.sx - c.sx;
  const fy = f.sy - c.sy;
  if (Math.hypot(rx, ry) < 1.5 && Math.hypot(fx, fy) < 1.5) return;

  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.globalAlpha = alpha;
  ctx.translate(c.sx, c.sy);
  ctx.transform(rx, ry, fx, fy, 0, 0);
  const g = ctx.createLinearGradient(-1, 0, 1, 0);
  g.addColorStop(0, rgba(rgb, 0));
  g.addColorStop(0.5, rgba(rgb, 0.6));
  g.addColorStop(1, rgba(rgb, 0));
  ctx.fillStyle = g;
  ctx.fillRect(-1, -1, 2, 2);
  ctx.restore();
}

/** Ядро — сам игрок, когда камера вынесена наружу. */
export function core(ctx, base, top, rx, opts = {}) {
  const rgb = opts.rgb || PAL.edge;
  const alpha = opts.alpha == null ? 1 : opts.alpha;
  if (alpha <= 0.01) return;

  const r = Math.max(4, rx);
  const ry = Math.max(2, r * 0.38);
  glowPool(ctx, base.sx, base.sy, r * 2.4, rgb, 0.35 * alpha);

  ctx.save();
  ctx.globalAlpha = alpha;
  const body = ctx.createRadialGradient(top.sx, top.sy - ry * 0.4, r * 0.1, top.sx, top.sy, r);
  body.addColorStop(0, rgba(PAL.spark, 0.95));
  body.addColorStop(0.45, rgba(rgb, 0.85));
  body.addColorStop(1, rgba(rgb, 0.35));
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.ellipse(top.sx, top.sy, r, ry * 1.6, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.globalCompositeOperation = "lighter";
  ctx.strokeStyle = rgba(PAL.spark, 0.6);
  ctx.lineWidth = Math.max(1, r * 0.08);
  ctx.beginPath();
  ctx.ellipse(top.sx, top.sy, r, ry * 1.6, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

/** Световая колонна на стене за коридором. Заменяет трибуны и панели. */
export function wallColumns(ctx, x0, width, horizon, count, seedAt, opts = {}) {
  const rgb = opts.rgb || PAL.edge;
  const alpha = opts.alpha == null ? 1 : opts.alpha;
  if (alpha <= 0.01) return;

  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  const step = width / count;
  for (let i = 0; i < count; i++) {
    const s = seedAt(i);
    const x = x0 + (i + 0.5) * step;
    const w = step * (0.1 + s * 0.16);
    const h = horizon * (0.3 + s * 0.55);
    const g = ctx.createLinearGradient(0, horizon - h, 0, horizon);
    g.addColorStop(0, rgba(rgb, 0));
    g.addColorStop(1, rgba(rgb, (0.14 + s * 0.2) * alpha));
    ctx.fillStyle = g;
    ctx.fillRect(x - w / 2, horizon - h, w, h);
  }
  ctx.restore();
}
