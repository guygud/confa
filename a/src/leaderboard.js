// ============================================================================
// РЕЙТИНГ
// ----------------------------------------------------------------------------
// После проигрыша: записать лучший счёт, показать топ-10.
// Имя живёт в sessionStorage (см. names.js).
//
// Демо-сборка не ходит в сеть: таблица лежит в localStorage браузера. Так две
// версии не мешают друг другу и не пишут в чужой рейтинг.
// ============================================================================

import { ui } from "./dom.js";
import { ensurePlayer } from "./names.js";

let ratingToken = 0;

const TOP_N = 10;
const STORE_KEY = "confa.scores.a";

function loadRows() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    const rows = raw ? JSON.parse(raw) : [];
    return Array.isArray(rows) ? rows : [];
  } catch (err) {
    return [];
  }
}

function saveRows(rows) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(rows));
  } catch (err) {
    // Приватный режим или переполненное хранилище — рейтинг просто не переживёт вкладку.
  }
}

/** Пишем только рекорд игрока, список держим отсортированным по убыванию. */
function submitAndFetch(player, score) {
  const value = Math.max(0, Math.floor(score));
  const rows = loadRows();
  const own = rows.find((row) => row.player_id === player.id);
  if (own) {
    own.name = player.name;
    own.score = Math.max(own.score, value);
  } else {
    rows.push({ player_id: player.id, name: player.name, score: value });
  }
  rows.sort((l, r) => r.score - l.score);
  saveRows(rows);

  const best = rows.find((row) => row.player_id === player.id).score;
  const rank = rows.findIndex((row) => row.player_id === player.id) + 1;
  return { ok: true, top: rows.slice(0, TOP_N), rank, best };
}

function fillYou(player, score) {
  if (ui.ratingName) ui.ratingName.textContent = player.name;
  if (ui.ratingScore) ui.ratingScore.textContent = `очков ${score}`;
}

function fillList(top, playerId) {
  const list = ui.ratingList;
  if (!list) return;
  list.replaceChildren();
  top.forEach((row, i) => {
    const li = document.createElement("li");
    if (row.player_id === playerId) li.classList.add("is-you");
    const rank = document.createElement("span");
    rank.className = "rating-rank";
    rank.textContent = String(i + 1);
    const name = document.createElement("span");
    name.className = "rating-nick";
    name.textContent = row.name;
    const score = document.createElement("span");
    score.className = "rating-score";
    score.textContent = String(row.score);
    li.append(rank, name, score);
    list.append(li);
  });
}

function fillMeta(result, playerId) {
  const inTop = result.top.some((row) => row.player_id === playerId);
  if (ui.ratingPlace) {
    if (result.ok && !inTop && result.rank != null) {
      ui.ratingPlace.hidden = false;
      ui.ratingPlace.textContent = `Ваше место: ${result.rank}`;
    } else {
      ui.ratingPlace.hidden = true;
      ui.ratingPlace.textContent = "";
    }
  }
  if (ui.ratingError) {
    ui.ratingError.hidden = result.ok;
  }
}

export function hideRating() {
  ratingToken += 1;
  if (ui.ratingOverlay) ui.ratingOverlay.hidden = true;
  document.body.classList.remove("rating-open");
}

export function showRating(score) {
  const player = ensurePlayer();
  fillYou(player, score);
  if (ui.ratingPlace) {
    ui.ratingPlace.hidden = true;
    ui.ratingPlace.textContent = "";
  }
  if (ui.ratingError) ui.ratingError.hidden = true;
  if (ui.ratingOverlay) ui.ratingOverlay.hidden = false;
  document.body.classList.add("rating-open");

  ui.status.hidden = true;
  ui.status.className = "";
  ui.restartBtn.hidden = true;
  ui.reportAltBtn.hidden = true;

  ratingToken += 1;
  const result = submitAndFetch(player, score);
  fillList(result.top, player.id);
  fillMeta(result, player.id);
}
