// Имя на сессию вкладки: случайная пара из нейтральных списков.

const FIRST = [
  "Пилон",
  "Импульс",
  "Рикошет",
  "Контур",
  "Разгон",
  "Вектор",
  "Спектр",
  "Каскад",
  "Призма",
  "Кварц",
  "Вираж",
  "Плазма",
  "Фотон",
  "Резонанс",
  "Градиент",
  "Тоннель",
  "Апекс",
  "Пульсар",
];

const LAST = [
  "Пилонов",
  "Импульсов",
  "Рикошетов",
  "Контуров",
  "Разгонов",
  "Векторов",
  "Спектров",
  "Каскадов",
  "Призмин",
  "Кварцев",
  "Виражов",
  "Плазмин",
  "Фотонов",
  "Резонансов",
  "Градиентов",
  "Тоннелев",
  "Апексов",
  "Пульсаров",
];

const STORE_KEY = "confa-player";


const pick = (list) => list[Math.floor(Math.random() * list.length)];

function randomName() {
  return `${pick(FIRST)} ${pick(LAST)}`;
}

function makePlayer() {
  const id = crypto.randomUUID ? crypto.randomUUID() : `p-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return { id, name: randomName() };
}

function readStored() {
  try {
    const raw = sessionStorage.getItem(STORE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.id === "string" && typeof parsed.name === "string") return parsed;
  } catch (err) {
    /* private mode / blocked storage */
  }
  return null;
}

function writeStored(player) {
  try {
    sessionStorage.setItem(STORE_KEY, JSON.stringify(player));
  } catch (err) {
    /* ignore */
  }
}

let memoryPlayer = null;

/** Один и тот же игрок до закрытия вкладки. */
export function ensurePlayer() {
  if (memoryPlayer) return memoryPlayer;
  const stored = readStored();
  if (stored) {
    memoryPlayer = stored;
    return stored;
  }
  memoryPlayer = makePlayer();
  writeStored(memoryPlayer);
  return memoryPlayer;
}
