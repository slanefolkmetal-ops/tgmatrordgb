export const LEVELS = ["Лайт", "Средний", "Смелый", "Жёсткий", "Экстрим"] as const;
export type Level = (typeof LEVELS)[number];

export const GAME_MODES = ["offline", "online"] as const;
export type GameMode = (typeof GAME_MODES)[number];
