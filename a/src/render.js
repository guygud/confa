// ============================================================================
// РЕНДЕР
// ----------------------------------------------------------------------------
// Единственный модуль, который рисует. Состояние он только читает — ничего в
// S не пишет, поэтому порядок отрисовки можно менять свободно.
//
// Порядок кадра: арена → пол → декор → арка и страж → ядро → фигуры (дальние
// первыми) → частицы и штрихи → капот → виньетка и вспышки → подсказки.
//
// Растровых ассетов в мире нет: всё собирается примитивами из ../../skin.js.
// ============================================================================

import {
  ARENA,
  BEAT,
  CAM,
  CINEMA,
  CONES,
  CORRIDOR,
  FLASHES,
  GOAL,
  GOALIE,
  goalieBodyWorld,
  HEAT,
  ICE_SCUFF,
  LENS,
  PLAYER,
  PYLON,
  SKATERS,
  HOOK,
  SPEED_LINES,
} from "./tuning.js";
import { JUMP, PUCK, TRACK } from "./balance.js";
import {
  PAL,
  arch,
  bar,
  core,
  floorStreak,
  glowPool,
  prism,
  pylon,
  ring,
  spark,
  wallColumns,
} from "../../skin.js";
import { canvas, ctx, blurCtx } from "./dom.js";
import {
  arenaCover,
  framePath,
  hoodMetrics,
  hoodTop,
  project,
  projectHeight,
  pushMix,
  rig,
  syncCamera,
} from "./camera.js";
import { S, theme } from "./state.js";
import { hoodJitter, worldJitter } from "./fx.js";
import { clamp01, hash01, hexToRgbStr } from "./util.js";
import { W, H, isTouchUi } from "./viewport.js";

// Буферы сортировки живут между кадрами: рендер не должен мусорить массивами.
const drawQueue = [];
const skaterQueue = [];

// ---------------------------------------------------------------------------
// Арена и пол
// ---------------------------------------------------------------------------

function drawArenaStrip() {
  const horizon = H * CAM.horizonFrac;
  const pal = theme();
  const g = ctx.createLinearGradient(0, 0, 0, horizon);
  g.addColorStop(0, pal.strip[0]);
  g.addColorStop(0.55, pal.strip[1]);
  g.addColorStop(1, pal.strip[2]);
  ctx.fillStyle = g;
  const cover = arenaCover();
  ctx.fillRect(cover.x, 0, cover.w, horizon + 2);

  // Стена за коридором — световые колонны. Дают глубину и параллакс, но не
  // складываются ни во что предметное.
  wallColumns(ctx, cover.x, cover.w, horizon, 26, (i) => hash01(i * 7 + 3), {
    rgb: pal.lines,
    alpha: 0.85 + 0.15 * pushMix(),
  });
}

/** Редкие всполохи на стене: живой фон без единого спрайта. */
function drawCrowdFlashes() {
  const horizon = H * CAM.horizonFrac;
  const size = Math.max(14, horizon * FLASHES.sizeFrac);
  const t = performance.now() / 1000;
  const shift = arenaCover().shift;

  for (let i = 0; i < FLASHES.count; i++) {
    const on = FLASHES.on[0] + hash01(i * 5 + 2) * (FLASHES.on[1] - FLASHES.on[0]);
    const gap = FLASHES.gap[0] + hash01(i * 7 + 4) * (FLASHES.gap[1] - FLASHES.gap[0]);
    const period = on + gap;
    const phase = (t + hash01(i * 11 + 8) * 20) % period;
    if (phase > on) continue;
    const a = Math.sin((phase / on) * Math.PI);
    if (a < 0.04) continue;
    // По ширине кадра, не по оверскану: cover уезжает далеко влево, и вспышки пропадали.
    const x = shift + ((i + 0.5) / FLASHES.count) * W + (hash01(i * 13 + 1) - 0.5) * (W / FLASHES.count);
    const y = horizon * (FLASHES.yMin + hash01(i * 17 + 3) * (FLASHES.yMax - FLASHES.yMin));
    spark(ctx, x, y, size * (0.65 + hash01(i * 23 + 9) * 0.7), 0.35 + 0.5 * a, PAL.edge);
  }
}

/** Кромка коридора на горизонте: светящийся рельс вместо борта. */
function drawBoards() {
  const horizon = H * CAM.horizonFrac;
  const cover = arenaCover();
  const a = 0.85 + 0.15 * pushMix();

  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  const g = ctx.createLinearGradient(0, horizon - ARENA.boardDrop - 10, 0, horizon + 4);
  g.addColorStop(0, `rgba(${PAL.edge},0)`);
  g.addColorStop(1, `rgba(${PAL.edge},${0.3 * a})`);
  ctx.fillStyle = g;
  ctx.fillRect(cover.x, horizon - ARENA.boardDrop - 10, cover.w, ARENA.boardDrop + 14);

  ctx.strokeStyle = `rgba(${PAL.goal},${0.55 * a})`;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(cover.x, horizon - 2);
  ctx.lineTo(cover.x + cover.w, horizon - 2);
  ctx.stroke();
  ctx.restore();
}

function drawFloor() {
  const horizon = H * CAM.horizonFrac;
  const iceH = H - horizon + 24;
  const pal = theme();

  const g = ctx.createLinearGradient(0, horizon, 0, H);
  g.addColorStop(0, pal.floor[0]);
  g.addColorStop(0.35, pal.floor[1]);
  g.addColorStop(1, pal.floor[2]);
  ctx.fillStyle = g;
  ctx.fillRect(0, horizon, W, iceH);

  // Поперечные полосы — главный индикатор скорости на пустом полу.
  const speedBoost = 0.8 + 0.5 * clamp01(S.mom);
  const start = Math.floor((S.puck.z - rig().back) / CORRIDOR.ribStep) * CORRIDOR.ribStep;
  for (let i = 0; i < 70; i++) {
    const p = project(0, start + i * CORRIDOR.ribStep, true);
    if (!p) continue;
    ctx.strokeStyle = `rgba(${pal.lines},${Math.max(0.03, 0.22 - i * 0.004) * speedBoost})`;
    ctx.lineWidth = Math.max(1, p.k * 1.2);
    ctx.beginPath();
    ctx.moveTo(0, p.sy);
    ctx.lineTo(W, p.sy);
    ctx.stroke();
  }
}

/** Полотно коридора: заливка и две боковые линии, уходящие в точку схода. */
function drawLane() {
  const nearZ = S.puck.z - rig().back + CAM.near + 2;
  const farZ = S.puck.z + rig().far * 0.9;
  const farL = project(-CORRIDOR.halfW, farZ, true);
  const farR = project(CORRIDOR.halfW, farZ, true);
  const nearL = project(-CORRIDOR.halfW, nearZ, true);
  const nearR = project(CORRIDOR.halfW, nearZ, true);
  if (!farL || !farR || !nearL || !nearR) return;

  const pal = theme();
  ctx.fillStyle = pal.lane[0];
  ctx.beginPath();
  ctx.moveTo(farL.sx, farL.sy);
  ctx.lineTo(farR.sx, farR.sy);
  ctx.lineTo(nearR.sx, nearR.sy);
  ctx.lineTo(nearL.sx, nearL.sy);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = pal.lane[1];
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(farL.sx, farL.sy);
  ctx.lineTo(nearL.sx, nearL.sy);
  ctx.moveTo(farR.sx, farR.sy);
  ctx.lineTo(nearR.sx, nearR.sy);
  ctx.stroke();
}

/**
 * Световой мазок на полу — один параллелограмм на плоскости. Три точки дают
 * базис «вправо» и «вглубь»; без нарезки по полосам нет швов-гармошки.
 */
function drawScuff(sc) {
  const depth = sc.w * 0.45 * sc.stretch;
  const halfW = sc.w * 0.5;
  const halfD = depth * 0.5;
  const cang = Math.cos(sc.rot);
  const sang = Math.sin(sc.rot);

  const c = project(sc.x, sc.z, true);
  const r = project(sc.x + cang * halfW * sc.mir, sc.z + sang * halfW * sc.mir, true);
  const f = project(sc.x - sang * halfD, sc.z + cang * halfD, true);
  if (!c || !r || !f) return;
  if (c.d < ICE_SCUFF.nearFade) return;
  if (sc.z - S.puck.z > ICE_SCUFF.farFade) return;

  floorStreak(ctx, c, r, f, { rgb: theme().lines, alpha: 0.12 });
}

/** Световые мазки лежат на плоскости и едут вместе с ареной. */
function drawIceScuffs() {
  if (S.scuffs.length === 0) return;
  const cutoff = S.puck.z - 400;
  const horizon = S.puck.z + ICE_SCUFF.farFade;
  // Пятна засеяны по возрастанию z, поэтому с конца: дальние ложатся первыми.
  for (let i = S.scuffs.length - 1; i >= 0; i--) {
    const sc = S.scuffs[i];
    if (sc.z > horizon) continue;
    if (sc.z < cutoff) break;
    drawScuff(sc);
  }
}

const byZOffDesc = (a, b) => b.z - a.z;

/** Попутчики за кромкой коридора: те же колонны, только тоньше и тусклее. */
function drawSkaters() {
  if (S.skaters.length === 0) return;
  skaterQueue.length = 0;
  for (const s of S.skaters) skaterQueue.push(s);
  skaterQueue.sort(byZOffDesc);

  for (const s of skaterQueue) {
    drawColumn(s.x, s.z, 0.6, s.face ?? 0, {
      rgb: PAL.edge,
      worldH: SKATERS.worldW * 0.6,
      worldW: PYLON.allyW,
    });
  }
}

function drawGoal() {
  const z = S.runDist;
  const half = GOAL.halfW;
  const postL = projectHeight(-half, z, GOAL.postHeight, true);
  const postR = projectHeight(half, z, GOAL.postHeight, true);
  const baseL = project(-half, z, true);
  const baseR = project(half, z, true);
  if (!postL || !postR || !baseL || !baseR) return;

  const gap = S.puck ? z - S.puck.z : 0;
  const near = gap <= 0 ? 1 : Math.pow(clamp01(1 - gap / GOAL.nearZ), GOAL.nearPow);
  if (near < 0.02) return;

  const cx = (baseL.sx + baseR.sx) / 2;
  const glowR = Math.max(30, Math.abs(baseR.sx - baseL.sx) * 0.7);
  const goalH = Math.max(24, Math.abs(baseL.sy - postL.sy) * 1.25);
  const glowY = (postL.sy + baseL.sy) / 2 + goalH * GOAL.yDownFrac * 0.5;

  arch(ctx, baseL, baseR, postL, postR, { rgb: PAL.goal, alpha: near });

  if (S.netFlash > 0) {
    const r = glowR * 1.35;
    const flash = ctx.createRadialGradient(cx, glowY, 2, cx, glowY, r);
    flash.addColorStop(0, `rgba(255,255,255,${0.7 * S.netFlash})`);
    flash.addColorStop(0.35, `rgba(${PAL.goal},${0.4 * S.netFlash})`);
    flash.addColorStop(1, `rgba(${PAL.goal},0)`);
    ctx.fillStyle = flash;
    ctx.beginPath();
    ctx.arc(cx, glowY, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Разгонный импульс на старте: луч подходит к ядру и толкает его в коридор. */
function drawStriker() {
  const cin = S.cinema;
  if (!cin || cin.mode !== "intro" || S.outside <= 0.02) return;
  if (!S.puck) return;
  const strike = cin.strike ?? 0;
  const wobble = cin.wobble ?? 0;
  const ang =
    CINEMA.introSwing0 +
    strike * (CINEMA.introSwing1 - CINEMA.introSwing0) +
    wobble * ((CINEMA.introWobbleDeg * Math.PI) / 180);
  const px = cin.plantX ?? S.puck.x ?? 0;
  const pz = cin.plantZ ?? S.puck.z;
  const z = pz - (1 - strike) * CINEMA.introReach;
  const head = project(px, z, true);
  if (!head) return;

  const len = Math.max(80, Math.min(W * HOOK.maxScreenFrac, HOOK.worldW * head.k));
  const thick = Math.max(3, len * 0.045);
  glowPool(ctx, head.sx, head.sy, len * 0.28, PAL.ally, 0.3 * S.outside);

  ctx.save();
  ctx.globalAlpha = S.outside;
  ctx.globalCompositeOperation = "lighter";
  ctx.translate(head.sx, head.sy);
  ctx.rotate(ang);
  const g = ctx.createLinearGradient(0, 0, len, 0);
  g.addColorStop(0, `rgba(${PAL.spark},0.95)`);
  g.addColorStop(0.3, `rgba(${PAL.ally},0.7)`);
  g.addColorStop(1, `rgba(${PAL.ally},0)`);
  ctx.fillStyle = g;
  ctx.fillRect(0, -thick / 2, len, thick);
  ctx.restore();

  spark(ctx, head.sx, head.sy, thick * 3, 0.5 + 0.5 * strike, PAL.ally);
}

/** Ядро как объект мира — только когда глаз снаружи него. */
function drawPuckBody() {
  if (S.outside <= 0.01) return;
  const px = S.puck.x || 0;
  const py = S.puck.y || 0;
  const base = project(px, S.puck.z);
  if (!base) return;
  const top = projectHeight(px, S.puck.z, 13 + py);
  if (!top) return;

  core(ctx, base, top, Math.max(8, 20 * base.k), {
    rgb: PAL.edge,
    alpha: Math.min(1, S.outside),
  });
}

// ---------------------------------------------------------------------------
// Пилоны — стоят на полу, якорь там же, где раньше был крюк фигуры
// ---------------------------------------------------------------------------

function slipProgress(obs) {
  if (!obs.resolved) return 0;
  const from = obs.slipZ != null ? obs.slipZ : obs.z;
  return clamp01((S.puck.z - from) / PLAYER.slipSpan);
}

function passAlpha(slip, d) {
  if (S.poseMode) return 1;
  return Math.pow(Math.max(0, 1 - slip), 0.9) * clamp01((d - CAM.near) / 70);
}

function nearFade(obs) {
  if (S.poseMode) return 1;
  const d = obs.z - S.puck.z;
  if (d >= PLAYER.nearFade) return 1;
  return 0.15 + 0.85 * clamp01(d / PLAYER.nearFade);
}

function nearFactor(obs) {
  const d = obs.z - S.puck.z;
  return clamp01(1 - (d - 80) / 520);
}

function iceRgb(kind) {
  return kind === "boost" ? PAL.ally : PAL.foe;
}

/** Занятая полоса на полу: зона объезда / створ прыжка. */
function drawIceBand(obs, rgb, alpha) {
  if (obs.resolved && obs.ok) return;
  const x0 = obs.x - obs.w / 2;
  const x1 = obs.x + obs.w / 2;
  const z = obs.z;
  const depth = obs.kind === "low" ? 22 : 14;
  const fl = project(x0, z - depth, true);
  const fr = project(x1, z - depth, true);
  const bl = project(x0, z + depth, true);
  const br = project(x1, z + depth, true);
  if (!fl || !fr || !bl || !br) return;
  const fade = passAlpha(slipProgress(obs), fl.d);
  const near = 0.4 + 0.6 * nearFactor(obs);
  ctx.save();
  ctx.globalAlpha = Math.min(1, alpha * fade * near);
  ctx.beginPath();
  ctx.moveTo(fl.sx, fl.sy);
  ctx.lineTo(fr.sx, fr.sy);
  ctx.lineTo(br.sx, br.sy);
  ctx.lineTo(bl.sx, bl.sy);
  ctx.closePath();
  ctx.fillStyle = `rgba(${rgb},${S.poseMode ? 0.55 : 0.72})`;
  ctx.fill();
  ctx.restore();
}

function drawVertArrow(x, z, worldH, worldW, alpha) {
  const base = project(x, z, true);
  const top = projectHeight(x, z, worldH, true);
  if (!base || !top) return;
  const sx = base.sx;
  const by = base.sy;
  const ty = top.sy;
  const hw = worldW * 0.5 * base.k;
  const headY = ty + (by - ty) * 0.55;
  const stem = hw * 0.34;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  ctx.moveTo(sx, ty);
  ctx.lineTo(sx + hw, headY);
  ctx.lineTo(sx + stem, headY);
  ctx.lineTo(sx + stem, by);
  ctx.lineTo(sx - stem, by);
  ctx.lineTo(sx - stem, headY);
  ctx.lineTo(sx - hw, headY);
  ctx.closePath();
  ctx.fillStyle = `rgba(${PAL.ally},0.78)`;
  ctx.fill();
  ctx.strokeStyle = `rgba(${PAL.spark},0.9)`;
  ctx.lineWidth = Math.max(2, 2.6 * base.k);
  ctx.stroke();
  ctx.restore();
}

function drawBoostArrows(obs) {
  if (obs.resolved && obs.ok) return;
  const sample = project(obs.x, obs.z, true);
  if (!sample) return;
  const fade = passAlpha(slipProgress(obs), sample.d);
  const near = 0.45 + 0.55 * nearFactor(obs);
  const a = 0.82 * fade * near;
  if (a < 0.04) return;
  const span = obs.w * 0.36;
  const xs = obs.w < 70 ? [obs.x] : [obs.x - span, obs.x, obs.x + span];
  for (const x of xs) {
    drawVertArrow(x, obs.z, 86, 28, a);
  }
}

function innerEdge(obs) {
  return obs.x + (obs.x < 0 ? obs.w / 2 : -obs.w / 2);
}

/**
 * Колонна на полу. Якорь — та же точка, куда раньше вставал крюк фигуры,
 * поэтому геометрия попаданий не поехала: изменилось только то, что на ней стоит.
 */
function drawColumn(tipX, tipZ, alpha, face = 1, opts = {}) {
  const fade = S.poseMode ? 1 : clamp01(face);
  if (fade < 0.02) return null;
  const worldH = opts.worldH || PYLON.worldH;
  const worldW = opts.worldW || PYLON.worldW;
  const base = project(tipX, tipZ, true);
  const top = projectHeight(tipX, tipZ, worldH, true);
  if (!base || !top) return null;
  const halfW = Math.max(2, Math.min(W * PYLON.maxScreenFrac, worldW * base.k) * 0.5);
  pylon(ctx, base, top, halfW, { rgb: opts.rgb || PAL.foe, alpha: alpha * fade });
  return base;
}

/**
 * Центр колонны отступает от кромки ровно на её полуширину, поэтому внутренняя
 * грань пилона встаёт на ту же координату, которую сверяет overlapsX.
 */
function blockTipX(obs) {
  const side = obs.x < 0 ? -1 : 1;
  const whip = obs.ok ? (2 - slipProgress(obs)) * slipProgress(obs) * PLAYER.dodgeWhip * CORRIDOR.halfW * 0.45 : 0;
  return innerEdge(obs) + side * (whip + PYLON.worldW / 2);
}

function drawShoulderMate(obs, tipZ, alpha, face) {
  const side = obs.x < 0 ? -1 : 1;
  const mx = side * (CORRIDOR.halfW + PLAYER.mateOut);
  const mz = tipZ + PLAYER.mateAhead;
  drawColumn(mx, mz, alpha * 0.7, face, {
    rgb: PAL.edge,
    worldH: PYLON.allyH,
    worldW: PYLON.allyW,
  });
}

function drawBlock(obs) {
  const slip = slipProgress(obs);
  const tipX = blockTipX(obs);
  const tipZ = obs.z + PLAYER.tipZOffset;
  const tip = project(tipX, tipZ, true);
  if (!tip) return;
  const alpha = passAlpha(slip, tip.d) * nearFade(obs);
  const face = obs.face ?? 0;
  drawIceBand(obs, iceRgb("block"), S.poseMode ? 0.7 : 0.28);
  drawColumn(tipX, tipZ, alpha, face);
  if (obs.mate) drawShoulderMate(obs, tipZ, alpha, face);
}

function drawLowBands(obs) {
  const halfLane = CORRIDOR.halfW * JUMP.laneFrac;
  const left = { ...obs, x: (-CORRIDOR.halfW - halfLane) / 2, w: CORRIDOR.halfW - halfLane };
  const right = { ...obs, x: (CORRIDOR.halfW + halfLane) / 2, w: CORRIDOR.halfW - halfLane };
  const mid = { ...obs, x: 0, w: halfLane * 2 };
  drawIceBand(left, iceRgb("low"), S.poseMode ? 0.55 : 0.32);
  drawIceBand(right, iceRgb("low"), S.poseMode ? 0.55 : 0.32);
  drawIceBand(mid, PAL.ally, S.poseMode ? 0.35 : 0.16);
}

/**
 * Низкая планка во всю ширину препятствия и две колонны по краям створа:
 * объехать нечего, прыгать можно только по центру. Планка идёт по obs.w, а
 * колонны — по jumpLaneHalf, то есть ровно по границам, которые сверяет
 * contactOf в drive.js.
 */
function drawLow(obs) {
  const slip = slipProgress(obs);
  const tipZ = obs.z + PLAYER.tipZOffset;
  const sample = project(obs.x, tipZ, true);
  if (!sample) return;
  const alpha = passAlpha(slip, sample.d) * nearFade(obs);
  const face = obs.face ?? 0;
  drawLowBands(obs);

  const barL = obs.x - obs.w / 2;
  const barR = obs.x + obs.w / 2;
  const lBase = project(barL, tipZ, true);
  const rBase = project(barR, tipZ, true);
  const lTop = projectHeight(barL, tipZ, JUMP.clear, true);
  const rTop = projectHeight(barR, tipZ, JUMP.clear, true);
  if (lBase && rBase && lTop && rTop) {
    bar(ctx, lBase, rBase, lTop, rTop, { rgb: PAL.foe, alpha: alpha * clamp01(face) });
  }

  const push = obs.ok ? slip * 1.55 : slip * 0.12;
  const gate = CORRIDOR.halfW * JUMP.laneFrac * (1 + push * 0.35);
  for (const side of [-1, 1]) {
    drawColumn(obs.x + side * gate, tipZ, alpha, face);
  }
}

function drawBoost(obs) {
  const slip = slipProgress(obs);
  const tipZ = obs.z + PLAYER.tipZOffset;
  const sample = project(obs.x, tipZ, true);
  if (!sample) return;
  const alpha = passAlpha(slip, sample.d) * nearFade(obs);
  const face = obs.face ?? 0;
  drawBoostArrows(obs);

  // Створ ускорителя: кольцо ровно по ширине зачётной зоны.
  const top = projectHeight(obs.x, tipZ, PYLON.allyH, true);
  if (top) {
    const rx = Math.max(6, (obs.w / 2) * sample.k);
    ring(ctx, sample.sx, (sample.sy + top.sy) / 2, rx, Math.abs(sample.sy - top.sy) * 0.5, {
      rgb: PAL.ally,
      alpha: alpha * clamp01(face),
    });
  }

  const push = obs.ok ? slip * 36 : 0;
  for (const side of [-1, 1]) {
    const tipX = obs.x + side * CORRIDOR.halfW * PLAYER.allyEdge + side * push;
    drawColumn(tipX, tipZ, alpha, face, {
      rgb: PAL.ally,
      worldH: PYLON.allyH,
      worldW: PYLON.allyW,
    });
  }
}

/** Путевой маркер вдоль коридора: вместо конуса — светящаяся призма. */
function drawCone(cone) {
  const p = project(cone.x, cone.z, true);
  const top = projectHeight(cone.x, cone.z, CONES.worldW * (CONES.heightScale || 1), true);
  if (!p || !top) return;
  const halfW = Math.max(2, Math.min(W * CONES.maxScreenFrac, CONES.worldW * p.k) * 0.5);
  const fade = p.d >= CONES.nearFade ? 1 : 0.12 + 0.88 * clamp01(p.d / CONES.nearFade);
  prism(ctx, p, top, halfW, { rgb: PAL.marker, alpha: fade });
}

function drawObstacle(obs) {
  if (obs.kind === "low") drawLow(obs);
  else if (obs.kind === "boost") drawBoost(obs);
  else drawBlock(obs);
}

function drawPoseCaption() {
  if (!S.poseMode) return;
  ctx.save();
  ctx.font = '600 13px "Segoe UI", system-ui, sans-serif';
  const text = "POSE  ·  хитбоксы";
  const tw = ctx.measureText(text).width;
  ctx.fillStyle = "rgba(20, 30, 50, 0.72)";
  ctx.fillRect(12, H - 48, tw + 24, 32);
  ctx.fillStyle = "#fff8e0";
  ctx.fillText(text, 24, H - 27);
  ctx.restore();
}

function hbPt(x, z, y) {
  return y > 0.15 ? projectHeight(x, z, y, true) : project(x, z, true);
}

function hbQuad(x0, z0, x1, z1, y, fill, stroke) {
  const a = hbPt(x0, z0, y);
  const b = hbPt(x1, z0, y);
  const c = hbPt(x1, z1, y);
  const d = hbPt(x0, z1, y);
  if (!a || !b || !c || !d) return;
  ctx.beginPath();
  ctx.moveTo(a.sx, a.sy);
  ctx.lineTo(b.sx, b.sy);
  ctx.lineTo(c.sx, c.sy);
  ctx.lineTo(d.sx, d.sy);
  ctx.closePath();
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
}

function hbCircle(x, z, r, y, stroke, fill) {
  ctx.beginPath();
  let started = false;
  for (let i = 0; i <= 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    const p = hbPt(x + Math.cos(a) * r, z + Math.sin(a) * r * 0.35, y);
    if (!p) continue;
    if (!started) {
      ctx.moveTo(p.sx, p.sy);
      started = true;
    } else ctx.lineTo(p.sx, p.sy);
  }
  if (!started) return;
  ctx.closePath();
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 2;
  ctx.stroke();
}

function hbBox(x0, x1, z, y0, y1, stroke) {
  const z0 = z - 8;
  const z1 = z + 8;
  hbQuad(x0, z0, x1, z1, y0, null, stroke);
  if (y1 > y0 + 0.5) {
    hbQuad(x0, z0, x1, z1, y1, null, stroke);
    const corners = [
      [x0, z0],
      [x1, z0],
      [x1, z1],
      [x0, z1],
    ];
    ctx.beginPath();
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1.25;
    for (const [x, zz] of corners) {
      const lo = hbPt(x, zz, y0);
      const hi = hbPt(x, zz, y1);
      if (!lo || !hi) continue;
      ctx.moveTo(lo.sx, lo.sy);
      ctx.lineTo(hi.sx, hi.sy);
    }
    ctx.stroke();
  }
}

/** Объёмы столкновений. Только ?pose=1: иначе закрывают игру. */
function drawHitboxes() {
  if (!S.poseMode || !S.puck) return;
  const r = PUCK.radius;
  const px = S.puck.x || 0;
  const pz = S.puck.z;
  const py = S.puck.y || 0;
  const noseZ = pz + TRACK.hitLine;
  const lane = CORRIDOR.halfW * JUMP.laneFrac;

  ctx.save();
  ctx.setLineDash([]);

  hbQuad(-lane, pz - 40, lane, S.runDist + 40, 0, "rgba(80,255,120,0.08)", "rgba(80,255,120,0.55)");

  for (const obs of S.obstacles) {
    const x0 = obs.x - obs.w / 2;
    const x1 = obs.x + obs.w / 2;
    if (obs.kind === "boost") {
      hbBox(x0, x1, obs.z, 0, 0, "rgba(80,200,255,0.95)");
      hbQuad(x0, obs.z - 10, x1, obs.z + 10, 0, "rgba(80,200,255,0.18)", null);
    } else if (obs.kind === "low") {
      hbBox(x0, x1, obs.z, 0, JUMP.clear, "rgba(255,170,40,0.95)");
      hbQuad(x0 - r, obs.z - 10, x1 + r, obs.z + 10, 0, "rgba(255,140,0,0.12)", "rgba(255,200,80,0.7)");
    } else {
      hbBox(x0, x1, obs.z, 0, 36, "rgba(255,70,90,0.95)");
      hbQuad(x0 - r, obs.z - 10, x1 + r, obs.z + 10, 0, "rgba(255,40,70,0.14)", "rgba(255,120,140,0.85)");
    }
  }

  const gZ = S.runDist - GOALIE.zBack;
  const body = goalieBodyWorld(S.goalieX || 0, S.goalieDir);
  hbBox(body.left, body.right, gZ, 0, 40, "rgba(255,80,255,0.95)");
  hbQuad(-GOAL.halfW, S.runDist - 6, GOAL.halfW, S.runDist + 6, 0, "rgba(255,230,80,0.12)", "rgba(255,230,80,0.9)");

  hbCircle(px, pz, r, 0, "rgba(40,255,90,0.95)", "rgba(40,255,90,0.2)");
  if (py > 0.2) hbCircle(px, pz, r, py, "rgba(40,255,90,0.95)", "rgba(40,255,90,0.12)");
  hbCircle(px, noseZ, r, py, "rgba(80,255,255,0.95)", "rgba(80,255,255,0.22)");

  const n0 = project(px, pz, true);
  const n1 = project(px, noseZ, true);
  if (n0 && n1) {
    ctx.strokeStyle = "rgba(80,255,255,0.7)";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(n0.sx, n0.sy);
    ctx.lineTo(n1.sx, n1.sy);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  ctx.restore();
}

/** Страж в створе: блок, который ходит поперёк арки. */
function drawGoalie() {
  const face = S.poseMode ? 1 : S.goalieFace || 0;
  if (face < 0.03) return;
  const netZ = S.runDist;
  const z = netZ - GOALIE.zBack;
  const x = S.goalieX || 0;
  const body = goalieBodyWorld(x, S.goalieDir < 0 ? -1 : 1);

  const lBase = project(body.left, z, true);
  const rBase = project(body.right, z, true);
  const lTop = projectHeight(body.left, z, GOAL.postHeight * GOALIE.size * 0.6, true);
  const rTop = projectHeight(body.right, z, GOAL.postHeight * GOALIE.size * 0.6, true);
  if (!lBase || !rBase || !lTop || !rTop) return;

  bar(ctx, lBase, rBase, lTop, rTop, { rgb: PAL.foe, alpha: face });
}

// ---------------------------------------------------------------------------
// Частицы и штрихи скорости
// ---------------------------------------------------------------------------

function drawParticles() {
  for (const p of S.particles) {
    const pr = project(p.x, p.z);
    if (!pr) continue;
    const a = p.life / p.max;
    spark(ctx, pr.sx, pr.sy, Math.max(3, 14 * pr.k * (0.45 + a)), 0.7 * a, PAL.spark);
  }
}

/** Аниме-штрихи: летят из точки схода к краям, густеют вместе со скоростью. */
function drawSpeedLines() {
  if (S.outside > 0.5) return;
  const drive = clamp01((S.mom - SPEED_LINES.minMom) / (1 - SPEED_LINES.minMom));
  const load = Math.min(
    1,
    drive + S.boostFx * 0.8 + S.heat * HEAT.lines + S.beatPulse * BEAT.pulse * 0.15 + pushMix() * 0.2
  );
  if (load <= 0.02) return;

  const cx = W / 2;
  const cy = H * CAM.horizonFrac;
  const t = performance.now() / 1000;
  const gap = W * SPEED_LINES.centerGapFrac;
  const reach = Math.hypot(W, H) * 0.75;
  const lineRgb = theme().lines;

  ctx.save();
  ctx.lineCap = "round";
  for (let i = 0; i < SPEED_LINES.count; i++) {
    const seed = hash01(i);
    const ang = (i % 2 === 0 ? Math.PI : 0) + (hash01(i + 91) - 0.5) * 0.9;
    const phase = (t * SPEED_LINES.rate * (0.7 + seed * 0.8) * (0.5 + load) + seed) % 1;
    const a = SPEED_LINES.alpha * load * Math.sin(Math.PI * Math.min(1, phase / 0.9));
    if (a <= 0.01) continue;
    const r0 = gap + phase * reach;
    const len = reach * SPEED_LINES.lenFrac * (0.45 + seed * 0.9) * (0.5 + load * 0.7);
    const dx = Math.cos(ang);
    const dy = Math.sin(ang) * 0.45;
    ctx.strokeStyle = `rgba(${lineRgb},${a})`;
    ctx.lineWidth = 1 + 2.2 * load * seed;
    ctx.beginPath();
    ctx.moveTo(cx + dx * r0, cy + dy * r0);
    ctx.lineTo(cx + dx * (r0 + len), cy + dy * (r0 + len));
    ctx.stroke();
  }
  ctx.restore();
}

/** Радиальные полосы от точки схода — и на ходу, и толчком после чистого приёма. */
function drawSpeedStreaks() {
  if (S.outside > 0.5) return;
  const drive = clamp01((S.mom - SPEED_LINES.minMom) / (1 - SPEED_LINES.minMom));
  const t = performance.now() / 1000;
  const pulse = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(t * SPEED_LINES.imgPulse * Math.PI * 2));
  const a = Math.min(1, drive * pulse + S.boostFx);
  if (a <= 0.02) return;
  const cx = W / 2;
  const cy = H * CAM.horizonFrac;
  ctx.strokeStyle = `rgba(${theme().lines},${0.4 * a})`;
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i < 20; i++) {
    const ang = (i / 20) * Math.PI * 2 + (i % 3) * 0.35;
    const r0 = 70 + (1 - a) * 220;
    const r1 = r0 + 60 + 120 * a;
    ctx.moveTo(cx + Math.cos(ang) * r0, cy + Math.sin(ang) * r0 * 0.55);
    ctx.lineTo(cx + Math.cos(ang) * r1, cy + Math.sin(ang) * r1 * 0.55);
  }
  ctx.stroke();
}

// ---------------------------------------------------------------------------
// Капот и вспышки поверх кадра
// ---------------------------------------------------------------------------

function hoodPath(metrics) {
  const { top, bulge } = metrics;
  // Запас за краем экрана: при крене до 15° углы диска не обрезаются.
  const pad = Math.max(W, H) * 0.45;
  ctx.beginPath();
  ctx.moveTo(-pad, top + bulge);
  ctx.quadraticCurveTo(W / 2, top - bulge, W + pad, top + bulge);
  ctx.lineTo(W + pad, H + pad);
  ctx.lineTo(-pad, H + pad);
  ctx.closePath();
}

/** Видимая четверть корпуса у нижней кромки — как капот машины. */
function drawHood() {
  const metrics = hoodMetrics();
  if (metrics.vis <= 0.01) return;
  const { h, top, bulge } = metrics;
  const pal = theme();

  ctx.save();
  hoodPath(metrics);
  const hood = pal.hood || [pal.shell, pal.floor[1]];
  const body = ctx.createLinearGradient(0, top - bulge, 0, H);
  body.addColorStop(0, `rgba(${hexToRgbStr(hood[0])},0.92)`);
  body.addColorStop(0.45, `rgba(${hexToRgbStr(hood[1])},0.95)`);
  body.addColorStop(1, `rgba(${hexToRgbStr(hood[1])},1)`);
  ctx.fillStyle = body;
  ctx.fill();
  ctx.clip();

  const cx = W / 2;
  const cy = top + h * 0.28;
  const shine = ctx.createRadialGradient(cx, cy, 10, cx, cy, Math.max(W, h) * 0.42);
  shine.addColorStop(0, `rgba(${PAL.spark},0.28)`);
  shine.addColorStop(0.45, `rgba(${PAL.edge},0.1)`);
  shine.addColorStop(1, `rgba(${PAL.edge},0)`);
  ctx.fillStyle = shine;
  ctx.fillRect(-W, top - bulge - h, W * 3, h * 2 + bulge + H);

  if (S.mom < 0.2) {
    const a = 0.1 + (1 - S.mom / 0.2) * 0.28;
    const warnH = Math.min(110, h * 0.55);
    const warnG = ctx.createLinearGradient(0, top, 0, top + warnH);
    warnG.addColorStop(0, `rgba(255,70,50,${a})`);
    warnG.addColorStop(1, "rgba(255,70,50,0)");
    ctx.fillStyle = warnG;
    ctx.fillRect(-W, top - bulge, W * 3, warnH + bulge);
  }
  ctx.restore();

  ctx.save();
  const pad = Math.max(W, H) * 0.45;
  ctx.beginPath();
  ctx.moveTo(-pad, top + bulge);
  ctx.quadraticCurveTo(W / 2, top - bulge, W + pad, top + bulge);
  ctx.strokeStyle = pal.lane[1];
  ctx.lineWidth = 2.5;
  ctx.lineCap = "round";
  ctx.stroke();
  ctx.restore();
}

function drawHitFlash() {
  if (S.hitFlash <= 0.01) return;
  const a = S.hitFlash * S.hitFlash;
  const bottom = hoodTop();
  const tint = (alpha) =>
    S.hitFlashPerfect ? `rgba(140,255,200,${alpha})` : `rgba(140,210,255,${alpha})`;

  ctx.save();
  const band = Math.min(120, H * 0.18);
  const topG = ctx.createLinearGradient(0, 0, 0, band);
  topG.addColorStop(0, tint(0.5 * a));
  topG.addColorStop(1, tint(0));
  ctx.fillStyle = topG;
  ctx.fillRect(0, 0, W, band);

  const botG = ctx.createLinearGradient(0, bottom - band, 0, bottom);
  botG.addColorStop(0, tint(0));
  botG.addColorStop(1, tint(0.5 * a));
  ctx.fillStyle = botG;
  ctx.fillRect(0, bottom - band, W, band);
  ctx.restore();
}

function drawFrameTint() {
  const cx = W / 2;
  const cy = H / 2;
  const vr = Math.max(W, H) * 0.62;
  const vignette = LENS.vignette + S.heat * HEAT.vignette + pushMix() * 0.1 + S.beatPulse * 0.04;
  const vig = ctx.createRadialGradient(cx, cy, vr * 0.35, cx, cy, vr);
  vig.addColorStop(0, "rgba(10,4,18,0)");
  vig.addColorStop(1, `rgba(10,4,18,${vignette})`);
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, W, H);
}

function drawDamageFlash() {
  if (S.damageFlash <= 0) return;
  const a = S.damageFlash * 0.45;
  const cx = W / 2;
  const cy = H / 2;
  const g = ctx.createRadialGradient(cx, cy, H * 0.1, cx, cy, W * 0.55);
  g.addColorStop(0, `rgba(255,40,30,${a * 0.15})`);
  g.addColorStop(0.55, `rgba(180,20,20,${a * 0.35})`);
  g.addColorStop(1, `rgba(80,0,0,${a})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // Кольцо разлома по краю кадра — заменяет спрайт удара.
  const r = Math.min(W, H) * (0.3 + 0.2 * S.damageFlash);
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.globalAlpha = Math.min(1, S.damageFlash * 0.7);
  ctx.strokeStyle = `rgba(${PAL.foe},0.8)`;
  ctx.lineWidth = Math.max(2, 14 * S.damageFlash);
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Подсказки
// ---------------------------------------------------------------------------

function drawTapZones() {
  if (!isTouchUi() || S.phase !== "play") return;
  const third = W / 3;
  const workTop = H * 0.1;
  const bottom = hoodTop();
  const top = workTop + (bottom - workTop) * 0.55;
  ctx.save();
  ctx.strokeStyle = "rgba(232,244,255,0.07)";
  ctx.lineWidth = 1.5;
  ctx.setLineDash([5, 10]);
  ctx.beginPath();
  ctx.moveTo(third, top);
  ctx.lineTo(third, bottom);
  ctx.moveTo(third * 2, top);
  ctx.lineTo(third * 2, bottom);
  ctx.stroke();
  ctx.restore();
}

/** Краевой блюр: копия кадра на #game-blur, сам гаусс делает CSS filter. */
function drawLensBlur() {
  if (!LENS.blur || !blurCtx) return;
  blurCtx.drawImage(canvas, 0, 0);
}

// ---------------------------------------------------------------------------
// Кадр
// ---------------------------------------------------------------------------

const byZDesc = (a, b) => b.z - a.z;

export function render() {
  syncCamera();

  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = theme().shell;
  ctx.fillRect(0, 0, W, H);

  const { jx, jy, roll } = worldJitter();

  ctx.save();
  framePath();
  ctx.clip();

  ctx.save();
  ctx.translate(W / 2 + jx, H / 2 + jy);
  ctx.rotate(roll);
  ctx.translate(-W / 2, -H / 2);

  drawArenaStrip();
  drawFloor();
  drawIceScuffs();
  drawLane();
  drawBoards();
  drawCrowdFlashes();
  drawSkaters();
  drawGoal();
  drawGoalie();
  drawStriker();
  drawPuckBody();

  const backLimit = S.puck.z - rig().back - 30;
  drawQueue.length = 0;
  for (const o of S.obstacles) {
    if (o.z > backLimit && slipProgress(o) < 1) drawQueue.push(o);
  }
  for (const c of S.cones || []) {
    if (c.z > backLimit) drawQueue.push(c);
  }
  drawQueue.sort(byZDesc);
  for (const item of drawQueue) {
    if (item.kind === "cone") drawCone(item);
    else drawObstacle(item);
  }

  drawHitboxes();
  drawParticles();
  drawSpeedLines();
  drawSpeedStreaks();
  ctx.restore();
  ctx.restore();

  const hj = hoodJitter();
  ctx.save();
  ctx.translate(W / 2 + hj.jx, H + hj.jy);
  ctx.rotate(hj.roll);
  ctx.translate(-W / 2, -H);
  drawHood();
  ctx.restore();

  drawFrameTint();
  drawLensBlur();
  drawHitFlash();
  drawDamageFlash();
  drawPoseCaption();

  if (!S.cinema) drawTapZones();
}

