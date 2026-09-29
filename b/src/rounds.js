// ============================================================================
// ЗАЕЗДЫ
// ----------------------------------------------------------------------------
// Заезд — это тема кадра плюс набор модификаторов баланса. Он меняет ощущение
// попытки, но не переписывает правила: каждый mod это множитель к числу из
// balance.js.
//
//   gapMul   — зазор между пилонами (умеет только поджимать, см. gapFor)
//   winMul   — ширина окна ответа
//   foeMul   — доля угроз
//   crossMul — доля лобовых пар
//   drainMul — расход инерции
//
// Темы лежат в общем скине: два режима обязаны выглядеть одинаково.
// ============================================================================

import { MARKS, MARKS_BY_ROUND, THEMES, THEME_NEUTRAL } from "../../skin.js";

/** Нейтральный заезд: обучение и разминка, никаких модификаторов. */
export const ROUND_NEUTRAL = {
  id: "clean",
  name: "РАЗМИНКА",
  bpm: 0,
  emojis: MARKS,
  theme: THEME_NEUTRAL,
  mods: {},
};

export const ROUNDS = [
  {
    id: "night",
    name: "НОЧНАЯ СМЕНА",
    bpm: 118,
    emojis: MARKS_BY_ROUND.night,
    theme: THEMES.night,
    // Просторнее и мягче: дышащий заезд между двумя злыми.
    mods: { gapMul: 1.1, winMul: 1.1, foeMul: 0.9 },
  },
  {
    id: "blitz",
    name: "БЛИЦ",
    bpm: 140,
    emojis: MARKS_BY_ROUND.blitz,
    theme: THEMES.blitz,
    // Плотно, но окно шире — темп, а не точность.
    mods: { gapMul: 0.82, winMul: 1.15 },
  },
  {
    id: "forge",
    name: "ПЛАВКА",
    bpm: 128,
    emojis: MARKS_BY_ROUND.forge,
    theme: THEMES.forge,
    // Самый злой: больше угроз, больше прыжков, инерция тает быстрее.
    mods: { foeMul: 1.25, drainMul: 1.1, crossMul: 1.3 },
  },
  {
    id: "long",
    name: "ДОЛГИЙ ПУТЬ",
    bpm: 112,
    emojis: MARKS_BY_ROUND.long,
    theme: THEMES.long,
    mods: { drainMul: 0.9 },
  },
];
