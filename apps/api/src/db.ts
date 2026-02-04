import sqlite3 from "sqlite3";
import { open } from "sqlite";
import { mkdir } from "fs/promises";
import { dirname, resolve } from "path";

const DEFAULT_DB_PATH = resolve(process.cwd(), "apps/api/data/data.db");
const DB_PATH = process.env.DB_PATH ? resolve(process.env.DB_PATH) : DEFAULT_DB_PATH;

export async function getDb() {
  await mkdir(dirname(DB_PATH), { recursive: true });
  const db = await open({
    filename: DB_PATH,
    driver: sqlite3.Database
  });

  await db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS rooms (
      id TEXT PRIMARY KEY,
      created_by TEXT NOT NULL,
      group_id TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS proofs (
      id TEXT PRIMARY KEY,
      room_id TEXT NOT NULL,
      created_by TEXT NOT NULL,
      round_id TEXT,
      created_at TEXT NOT NULL,
      telegram_chat_id TEXT,
      telegram_message_id TEXT,
      status TEXT NOT NULL,
      FOREIGN KEY(room_id) REFERENCES rooms(id)
    );
    CREATE TABLE IF NOT EXISTS room_players (
      id TEXT PRIMARY KEY,
      room_id TEXT NOT NULL,
      name TEXT NOT NULL,
      gender TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(room_id) REFERENCES rooms(id)
    );
    CREATE TABLE IF NOT EXISTS rounds (
      id TEXT PRIMARY KEY,
      room_id TEXT NOT NULL,
      player_id TEXT NOT NULL,
      card_id TEXT,
      card_text TEXT NOT NULL,
      card_type TEXT NOT NULL,
      level TEXT NOT NULL,
      pack_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      status TEXT NOT NULL,
      FOREIGN KEY(room_id) REFERENCES rooms(id),
      FOREIGN KEY(player_id) REFERENCES room_players(id)
    );
    CREATE TABLE IF NOT EXISTS votes (
      proof_id TEXT NOT NULL,
      voter_id TEXT NOT NULL,
      vote TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (proof_id, voter_id),
      FOREIGN KEY(proof_id) REFERENCES proofs(id)
    );
    CREATE TABLE IF NOT EXISTS packs (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      paid INTEGER NOT NULL,
      price TEXT NOT NULL,
      levels TEXT,
      mode TEXT
    );
    CREATE TABLE IF NOT EXISTS cards (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      text TEXT NOT NULL,
      level TEXT NOT NULL,
      pack_id TEXT NOT NULL,
      requires_target INTEGER NOT NULL,
      target_gender TEXT,
      FOREIGN KEY(pack_id) REFERENCES packs(id)
    );
  `);

  const proofCols = await db.all<{ name: string }>("PRAGMA table_info(proofs)");
  const hasRoundId = proofCols.some((col) => col.name === "round_id");
  if (!hasRoundId) {
    await db.exec("ALTER TABLE proofs ADD COLUMN round_id TEXT");
  }

  const packCols = await db.all<{ name: string }>("PRAGMA table_info(packs)");
  const hasLevels = packCols.some((col) => col.name === "levels");
  if (!hasLevels) {
    await db.exec("ALTER TABLE packs ADD COLUMN levels TEXT");
  }
  const hasMode = packCols.some((col) => col.name === "mode");
  if (!hasMode) {
    await db.exec("ALTER TABLE packs ADD COLUMN mode TEXT");
  }

  const cards = [
    // base
    { id: "b_t1", type: "truth", text: "Какой поступок тебе было стыдно вспоминать?", level: "Лайт", pack: "base", requiresTarget: 0, targetGender: null },
    { id: "b_t2", type: "truth", text: "Что ты бы хотел изменить в себе?", level: "Средний", pack: "base", requiresTarget: 0, targetGender: null },
    { id: "b_t3", type: "truth", text: "Когда ты в последний раз искренне гордился собой?", level: "Лайт", pack: "base", requiresTarget: 0, targetGender: null },
    { id: "b_t4", type: "truth", text: "Чего ты боишься больше всего?", level: "Средний", pack: "base", requiresTarget: 0, targetGender: null },
    { id: "b_t5", type: "truth", text: "За что ты особенно ценишь игроков в этой комнате?", level: "Лайт", pack: "base", requiresTarget: 0, targetGender: null },
    { id: "b_d1", type: "dare", text: "Сделай комплимент игроку слева {left}.", level: "Лайт", pack: "base", requiresTarget: 1, targetGender: "any" },
    { id: "b_d2", type: "dare", text: "Скажи вслух 3 факта о себе, которые никто не знает.", level: "Средний", pack: "base", requiresTarget: 0, targetGender: null },
    { id: "b_d3", type: "dare", text: "Скажи доброе пожелание игроку справа {right}.", level: "Лайт", pack: "base", requiresTarget: 1, targetGender: "any" },
    { id: "b_d4", type: "dare", text: "Пожми руку игроку напротив {opposite} и скажи ему спасибо.", level: "Лайт", pack: "base", requiresTarget: 1, targetGender: "any" },
    { id: "b_d5", type: "dare", text: "Обними игрока по имени {player}, если это комфортно.", level: "Средний", pack: "base", requiresTarget: 1, targetGender: "any" },
    // dating
    { id: "dt_t1", type: "truth", text: "Каким было твоё самое странное свидание?", level: "Средний", pack: "dating", requiresTarget: 0, targetGender: null },
    { id: "dt_t2", type: "truth", text: "Что для тебя 100% ред‑флаг на первом свидании?", level: "Смелый", pack: "dating", requiresTarget: 0, targetGender: null },
    { id: "dt_t3", type: "truth", text: "Опиши свой идеальный флирт в двух фразах.", level: "Лайт", pack: "dating", requiresTarget: 0, targetGender: null },
    { id: "dt_t4", type: "truth", text: "Что тебя реально цепляет в человеке в первые 5 минут?", level: "Средний", pack: "dating", requiresTarget: 0, targetGender: null },
    { id: "dt_t5", type: "truth", text: "Кого из присутствующих ты бы позвал(а) на свидание и почему?", level: "Смелый", pack: "dating", requiresTarget: 0, targetGender: null },
    { id: "dt_d1", type: "dare", text: "Скажи игроку справа {right} лучшую фразу для знакомства.", level: "Лайт", pack: "dating", requiresTarget: 1, targetGender: "any" },
    { id: "dt_d2", type: "dare", text: "Сделай лёгкий комплимент внешности игроку слева {left}.", level: "Средний", pack: "dating", requiresTarget: 1, targetGender: "any" },
    { id: "dt_d3", type: "dare", text: "Скажи фразу для знакомства игроку напротив {opposite}.", level: "Лайт", pack: "dating", requiresTarget: 1, targetGender: "any" },
    { id: "dt_d4", type: "dare", text: "Скажи игроку по имени {player}, что в нём тебя притягивает.", level: "Смелый", pack: "dating", requiresTarget: 1, targetGender: "any" },
    { id: "dt_d5", type: "dare", text: "Сделай короткий «питч свидания» игроку напротив {opposite}.", level: "Смелый", pack: "dating", requiresTarget: 1, targetGender: "any" },
    // 18+
    { id: "p18_t1", type: "truth", text: "Какая фантазия у тебя возникает чаще всего?", level: "Смелый", pack: "plus18", requiresTarget: 0, targetGender: null },
    { id: "p18_t2", type: "truth", text: "Что сильнее всего заводит тебя в флирте?", level: "Жёсткий", pack: "plus18", requiresTarget: 0, targetGender: null },
    { id: "p18_t3", type: "truth", text: "Что в прикосновениях для тебя самое возбуждающее?", level: "Жёсткий", pack: "plus18", requiresTarget: 0, targetGender: null },
    { id: "p18_t4", type: "truth", text: "С кем из присутствующих у тебя самый сильный флирт‑вайб?", level: "Смелый", pack: "plus18", requiresTarget: 0, targetGender: null },
    { id: "p18_d1", type: "dare", text: "Шёпотом скажи игроку справа {right}, что тебя в нём заводит.", level: "Жёсткий", pack: "plus18", requiresTarget: 1, targetGender: "any" },
    { id: "p18_d2", type: "dare", text: "Сделай откровенный комплимент игроку слева {left}.", level: "Смелый", pack: "plus18", requiresTarget: 1, targetGender: "any" },
    { id: "p18_d3", type: "dare", text: "Подойди ближе к игроку напротив {opposite} и скажи одну дерзкую фразу.", level: "Жёсткий", pack: "plus18", requiresTarget: 1, targetGender: "any" },
    { id: "p18_d4", type: "dare", text: "Скажи игроку по имени {player}, какая часть его образа тебя заводит.", level: "Жёсткий", pack: "plus18", requiresTarget: 1, targetGender: "any" },
    // 18+ hard
    { id: "p18h_t1", type: "truth", text: "О какой тайной фантазии тебе сложнее всего говорить вслух?", level: "Экстрим", pack: "plus18hard", requiresTarget: 0, targetGender: null },
    { id: "p18h_t2", type: "truth", text: "Что в сексе для тебя самое запретно‑желанное?", level: "Экстрим", pack: "plus18hard", requiresTarget: 0, targetGender: null },
    { id: "p18h_t3", type: "truth", text: "С кем из присутствующих ты бы пошёл(ла) дальше всего и почему?", level: "Жёсткий", pack: "plus18hard", requiresTarget: 0, targetGender: null },
    { id: "p18h_t4", type: "truth", text: "Скажи игроку по имени {player}, что бы ты хотел(а) попробовать вместе.", level: "Экстрим", pack: "plus18hard", requiresTarget: 1, targetGender: "any" },
    { id: "p18h_d1", type: "dare", text: "Поменяйся местами с игроком напротив {opposite} и удерживайте зрительный контакт 15 секунд.", level: "Экстрим", pack: "plus18hard", requiresTarget: 1, targetGender: "any" },
    { id: "p18h_d2", type: "dare", text: "Скажи игроку слева {left} самую неприличную мысль, которая приходит в голову прямо сейчас.", level: "Экстрим", pack: "plus18hard", requiresTarget: 1, targetGender: "any" },
    { id: "p18h_d3", type: "dare", text: "Скажи игроку справа {right}, какой конкретный сценарий тебе хочется попробовать.", level: "Экстрим", pack: "plus18hard", requiresTarget: 1, targetGender: "any" },
    { id: "p18h_d4", type: "dare", text: "Выбери игрока по имени {player} и опиши, как бы выглядел ваш идеальный откровенный вечер.", level: "Жёсткий", pack: "plus18hard", requiresTarget: 1, targetGender: "any" },
    // 18+ ultra
    { id: "p18u_t1", type: "truth", text: "Что ты хотел(а) бы услышать от партнёра в самый откровенный момент?", level: "Экстрим", pack: "plus18ultra", requiresTarget: 0, targetGender: null },
    { id: "p18u_t2", type: "truth", text: "Какая твоя самая смелая сексуальная фантазия прямо сейчас?", level: "Экстрим", pack: "plus18ultra", requiresTarget: 0, targetGender: null },
    { id: "p18u_t3", type: "truth", text: "С кем из присутствующих у тебя самая горячая химия?", level: "Экстрим", pack: "plus18ultra", requiresTarget: 0, targetGender: null },
    { id: "p18u_t4", type: "truth", text: "Скажи игроку по имени {player}, что в нём тебя заводит больше всего.", level: "Экстрим", pack: "plus18ultra", requiresTarget: 1, targetGender: "any" },
    { id: "p18u_d1", type: "dare", text: "Скажи игроку справа {right} одну фразу, которая точно его(её) заведёт.", level: "Экстрим", pack: "plus18ultra", requiresTarget: 1, targetGender: "any" },
    { id: "p18u_d2", type: "dare", text: "Шёпотом опиши игроку слева {left} один откровенный сценарий.", level: "Экстрим", pack: "plus18ultra", requiresTarget: 1, targetGender: "any" },
    { id: "p18u_d3", type: "dare", text: "Скажи игроку напротив {opposite} самую дерзкую фразу, которую можешь придумать.", level: "Экстрим", pack: "plus18ultra", requiresTarget: 1, targetGender: "any" },
    { id: "p18u_d4", type: "dare", text: "Выбери игрока по имени {player} и скажи, что именно ты бы сделал(а) с ним(ней) (без деталей).", level: "Экстрим", pack: "plus18ultra", requiresTarget: 1, targetGender: "any" }
  ];

  const packCount = await db.get<{ count: number }>("SELECT COUNT(*) as count FROM packs");
  if (!packCount || packCount.count === 0) {
    await db.run(
      "INSERT INTO packs (id, title, paid, price, levels) VALUES (?, ?, ?, ?, ?)",
      "base",
      "Базовый набор",
      0,
      "Бесплатно",
      JSON.stringify(["Лайт", "Средний"])
    );
    await db.run(
      "INSERT INTO packs (id, title, paid, price, levels) VALUES (?, ?, ?, ?, ?)",
      "dating",
      "Знакомство",
      1,
      "50 ⭐",
      JSON.stringify(["Лайт", "Средний", "Смелый"])
    );
    await db.run(
      "INSERT INTO packs (id, title, paid, price, levels) VALUES (?, ?, ?, ?, ?)",
      "plus18",
      "18+",
      1,
      "80 ⭐",
      JSON.stringify(["Смелый", "Жёсткий"])
    );
    await db.run(
      "INSERT INTO packs (id, title, paid, price, levels) VALUES (?, ?, ?, ?, ?)",
      "plus18hard",
      "18+ Hard",
      1,
      "120 ⭐",
      JSON.stringify(["Жёсткий", "Экстрим"])
    );
    await db.run(
      "INSERT INTO packs (id, title, paid, price, levels) VALUES (?, ?, ?, ?, ?)",
      "plus18ultra",
      "18+ Ultra",
      1,
      "200 ⭐",
      JSON.stringify(["Экстрим"])
    );

    for (const card of cards) {
      await db.run(
        "INSERT OR REPLACE INTO cards (id, type, text, level, pack_id, requires_target, target_gender) VALUES (?, ?, ?, ?, ?, ?, ?)",
        card.id,
        card.type,
        card.text,
        card.level,
        card.pack,
        card.requiresTarget,
        card.targetGender
      );
    }
  } else {
    const rows = await db.all<{ id: string; levels: string | null }>("SELECT id, levels FROM packs");
    for (const row of rows) {
      if (!row.levels) {
        let levels = ["Лайт", "Средний"];
        if (row.id === "dating") levels = ["Лайт", "Средний", "Смелый"];
        if (row.id === "plus18") levels = ["Смелый", "Жёсткий"];
        if (row.id === "plus18hard") levels = ["Жёсткий", "Экстрим"];
        if (row.id === "plus18ultra") levels = ["Экстрим"];
        await db.run("UPDATE packs SET levels = ? WHERE id = ?", JSON.stringify(levels), row.id);
      }
    }
  }

  for (const card of cards) {
    await db.run(
      "INSERT OR REPLACE INTO cards (id, type, text, level, pack_id, requires_target, target_gender) VALUES (?, ?, ?, ?, ?, ?, ?)",
      card.id,
      card.type,
      card.text,
      card.level,
      card.pack,
      card.requiresTarget,
      card.targetGender
    );
  }

  return db;
}
