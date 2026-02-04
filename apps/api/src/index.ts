import express from "express";
import cors from "cors";
import { nanoid } from "nanoid";
import { z } from "zod";
import { getDb } from "./db";
import { mkdir, readFile, readdir, unlink, writeFile } from "fs/promises";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const app = express();
app.use(cors());
app.use(express.json());

const PORT = Number(process.env.PORT ?? 4000);
const __dirname = dirname(fileURLToPath(import.meta.url));
const PACKS_DIR = resolve(__dirname, "..", "data", "packs");
const ONLINE_SUFFIX = "_online";

const packFileSchema = z.object({
  pack: z.object({
    id: z.string().min(1),
    title: z.string().min(1),
    paid: z.boolean().optional().default(false),
    price: z.string().optional().default("Бесплатно"),
    levels: z.array(z.string()).default([])
  }).passthrough(),
  cards: z.array(
    z.object({
      id: z.string().optional(),
      type: z.enum(["truth", "dare"]),
      text: z.string().min(1),
      level: z.string().min(1),
      requiresTarget: z.boolean().optional().default(false),
      targetGender: z.enum(["m", "f", "any"]).optional().nullable(),
      proof: z.string().optional()
    }).passthrough()
  )
});

const dbPromise = getDb();

const modeFromFilename = (filename: string) =>
  filename.replace(/\.json$/, "").endsWith(ONLINE_SUFFIX) ? "online" : "offline";

const idFromFilename = (filename: string) => filename.replace(/\.json$/, "");

const stripJsonComments = (input: string) =>
  input
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

async function syncPacksFromFiles(db: Awaited<ReturnType<typeof getDb>>) {
  await mkdir(PACKS_DIR, { recursive: true });
  const files = await readdir(PACKS_DIR);
  const filePackIds: string[] = [];
  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    const filePath = resolve(PACKS_DIR, file);
    const raw = await readFile(filePath, "utf-8");
    const cleaned = stripJsonComments(raw);
    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(cleaned);
    } catch (err) {
      console.warn(`[packs] invalid json: ${file}`, err);
      continue;
    }
    const parsed = packFileSchema.safeParse(parsedJson);
    if (!parsed.success) {
      console.warn(`[packs] schema error: ${file}`, parsed.error);
      continue;
    }
    const data = parsed.data;
    const packId = idFromFilename(file);
    const mode = modeFromFilename(file);
    filePackIds.push(packId);

    await db.run(
      "INSERT OR REPLACE INTO packs (id, title, paid, price, levels, mode) VALUES (?, ?, ?, ?, ?, ?)",
      packId,
      data.pack.title,
      data.pack.paid ? 1 : 0,
      data.pack.price ?? "Бесплатно",
      JSON.stringify(data.pack.levels ?? []),
      mode
    );

    await db.run("DELETE FROM cards WHERE pack_id = ?", packId);
    for (const card of data.cards) {
      await db.run(
        "INSERT INTO cards (id, type, text, level, pack_id, requires_target, target_gender) VALUES (?, ?, ?, ?, ?, ?, ?)",
        card.id ?? nanoid(10),
        card.type,
        card.text,
        card.level,
        packId,
        card.requiresTarget ? 1 : 0,
        card.targetGender ?? null
      );
    }
  }

  if (filePackIds.length === 0) {
    await db.run("DELETE FROM cards");
    await db.run("DELETE FROM packs");
    return;
  }

  const placeholders = filePackIds.map(() => "?").join(", ");
  await db.run(`DELETE FROM cards WHERE pack_id NOT IN (${placeholders})`, filePackIds);
  await db.run(`DELETE FROM packs WHERE id NOT IN (${placeholders})`, filePackIds);
}

app.get("/health", (_req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

app.get("/admin/packs", (_req, res) => {
  dbPromise
    .then(async () => {
      await mkdir(PACKS_DIR, { recursive: true });
      const files = await readdir(PACKS_DIR);
      const items = [];
      for (const file of files) {
        if (!file.endsWith(".json")) continue;
      const raw = await readFile(resolve(PACKS_DIR, file), "utf-8");
      const cleaned = stripJsonComments(raw);
      let data: any = null;
      try {
        data = JSON.parse(cleaned);
      } catch (err) {
        console.warn(`[packs] invalid json: ${file}`, err);
      }
      items.push({
        id: idFromFilename(file),
        baseId: data?.pack?.id ?? idFromFilename(file),
        title: data?.pack?.title ?? "Без названия",
        filename: file,
        mode: modeFromFilename(file)
      });
      }
      res.json(items);
    })
    .catch((err) => res.status(500).json({ error: "admin_error", details: String(err) }));
});

app.get("/admin/packs/:packId", (req, res) => {
  dbPromise
    .then(async () => {
      const filePath = resolve(PACKS_DIR, `${req.params.packId}.json`);
      const raw = await readFile(filePath, "utf-8");
      res.type("application/json").send(raw);
    })
    .catch((err) => res.status(404).json({ error: "pack_file_not_found", details: String(err) }));
});

app.post("/admin/packs", (req, res) => {
  dbPromise
    .then(async (db) => {
      const body = packFileSchema.parse(req.body);
      await mkdir(PACKS_DIR, { recursive: true });
      const filePath = resolve(PACKS_DIR, `${body.pack.id}.json`);
      await writeFile(filePath, JSON.stringify(body, null, 2), "utf-8");

      const mode = body.pack.id.endsWith(ONLINE_SUFFIX) ? "online" : "offline";
      await db.run(
        "INSERT OR REPLACE INTO packs (id, title, paid, price, levels, mode) VALUES (?, ?, ?, ?, ?, ?)",
        body.pack.id,
        body.pack.title,
        body.pack.paid ? 1 : 0,
        body.pack.price,
        JSON.stringify(body.pack.levels),
        mode
      );

      await db.run("DELETE FROM cards WHERE pack_id = ?", body.pack.id);
      for (const card of body.cards) {
        await db.run(
          "INSERT INTO cards (id, type, text, level, pack_id, requires_target, target_gender) VALUES (?, ?, ?, ?, ?, ?, ?)",
          card.id ?? nanoid(10),
          card.type,
          card.text,
          card.level,
          body.pack.id,
          card.requiresTarget ? 1 : 0,
          card.targetGender ?? null
        );
      }

      res.json({ ok: true });
    })
    .catch((err) => res.status(400).json({ error: "admin_error", details: String(err) }));
});

app.put("/admin/packs/:packId", (req, res) => {
  dbPromise
    .then(async (db) => {
      const body = packFileSchema.parse(req.body);
      if (body.pack.id !== req.params.packId) {
        res.status(400).json({ error: "pack_id_mismatch" });
        return;
      }
      await mkdir(PACKS_DIR, { recursive: true });
      const filePath = resolve(PACKS_DIR, `${req.params.packId}.json`);
      await writeFile(filePath, JSON.stringify(body, null, 2), "utf-8");

      const mode = body.pack.id.endsWith(ONLINE_SUFFIX) ? "online" : "offline";
      await db.run(
        "INSERT OR REPLACE INTO packs (id, title, paid, price, levels, mode) VALUES (?, ?, ?, ?, ?, ?)",
        body.pack.id,
        body.pack.title,
        body.pack.paid ? 1 : 0,
        body.pack.price,
        JSON.stringify(body.pack.levels),
        mode
      );

      await db.run("DELETE FROM cards WHERE pack_id = ?", body.pack.id);
      for (const card of body.cards) {
        await db.run(
          "INSERT INTO cards (id, type, text, level, pack_id, requires_target, target_gender) VALUES (?, ?, ?, ?, ?, ?, ?)",
          card.id ?? nanoid(10),
          card.type,
          card.text,
          card.level,
          body.pack.id,
          card.requiresTarget ? 1 : 0,
          card.targetGender ?? null
        );
      }

      res.json({ ok: true });
    })
    .catch((err) => res.status(400).json({ error: "admin_error", details: String(err) }));
});

app.delete("/admin/packs/:packId", (req, res) => {
  dbPromise
    .then(async (db) => {
      const filePath = resolve(PACKS_DIR, `${req.params.packId}.json`);
      await unlink(filePath);
      await db.run("DELETE FROM cards WHERE pack_id = ?", req.params.packId);
      await db.run("DELETE FROM packs WHERE id = ?", req.params.packId);
      res.json({ ok: true });
    })
    .catch((err) => res.status(404).json({ error: "pack_delete_failed", details: String(err) }));
});

app.get("/packs", (_req, res) => {
  dbPromise
    .then(async (db) => {
      await syncPacksFromFiles(db);
      const packs = await db.all(
        "SELECT id, title, paid, price, levels, mode FROM packs ORDER BY paid ASC, title ASC"
      );
      const normalized = packs.map((pack) => ({
        ...pack,
        levels: pack.levels ? JSON.parse(pack.levels) : [],
        mode: pack.mode ?? "offline"
      }));
      res.json(normalized);
    })
    .catch((err) => res.status(500).json({ error: "db_error", details: String(err) }));
});

app.post("/packs", (req, res) => {
  dbPromise
    .then(async (db) => {
      const body = z
        .object({
          title: z.string().min(1),
          paid: z.boolean().optional().default(false),
          price: z.string().optional().default("Бесплатно"),
          levels: z.array(z.string()).optional().default([])
        })
        .parse(req.body);

      const id = nanoid(8);
      await db.run(
        "INSERT INTO packs (id, title, paid, price, levels, mode) VALUES (?, ?, ?, ?, ?, ?)",
        id,
        body.title,
        body.paid ? 1 : 0,
        body.price,
        JSON.stringify(body.levels),
        "offline"
      );

      res.json({ id });
    })
    .catch((err) => res.status(500).json({ error: "db_error", details: String(err) }));
});

app.post("/packs/:packId/cards", (req, res) => {
  dbPromise
    .then(async (db) => {
      const pack = await db.get("SELECT id FROM packs WHERE id = ?", req.params.packId);
      if (!pack) {
        res.status(404).json({ error: "pack_not_found" });
        return;
      }

      const body = z
        .object({
          type: z.enum(["truth", "dare"]),
          text: z.string().min(1),
          level: z.string().min(1),
          requiresTarget: z.boolean().optional().default(false),
          targetGender: z.enum(["m", "f", "any"]).optional().nullable()
        })
        .parse(req.body);

      const id = nanoid(10);
      await db.run(
        "INSERT INTO cards (id, type, text, level, pack_id, requires_target, target_gender) VALUES (?, ?, ?, ?, ?, ?, ?)",
        id,
        body.type,
        body.text,
        body.level,
        req.params.packId,
        body.requiresTarget ? 1 : 0,
        body.targetGender ?? null
      );

      res.json({ id });
    })
    .catch((err) => res.status(500).json({ error: "db_error", details: String(err) }));
});

app.get("/packs/:packId/cards", (req, res) => {
  dbPromise
    .then(async (db) => {
      const rows = await db.all(
        "SELECT id, type, text, level, pack_id as packId, requires_target as requiresTarget, target_gender as targetGender FROM cards WHERE pack_id = ? ORDER BY level ASC",
        req.params.packId
      );
      res.json(rows);
    })
    .catch((err) => res.status(500).json({ error: "db_error", details: String(err) }));
});

app.delete("/packs/:packId/cards/:cardId", (req, res) => {
  dbPromise
    .then(async (db) => {
      await db.run("DELETE FROM cards WHERE id = ? AND pack_id = ?", req.params.cardId, req.params.packId);
      res.json({ ok: true });
    })
    .catch((err) => res.status(500).json({ error: "db_error", details: String(err) }));
});

app.get("/cards/next", (req, res) => {
  const raw = req.query as Record<string, string | undefined>;
  const query = z
    .object({
      type: z.enum(["truth", "dare"]),
      level: z.string().optional(),
      packId: z.string().optional()
    })
    .parse({
      type: raw.type,
      level: raw.level,
      packId: raw.packId ?? raw.pack_id
    });

  dbPromise
    .then(async (db) => {
      if (!query.packId) {
        res.status(400).json({ error: "pack_required" });
        return;
      }
      const pack = await db.get("SELECT id FROM packs WHERE id = ?", query.packId);
      if (!pack) {
        res.status(404).json({ error: "pack_not_found" });
        return;
      }
      const params: string[] = [];
      let where = "WHERE type = ?";
      params.push(query.type);

      where += " AND pack_id = ?";
      params.push(query.packId);

      if (query.level) {
        where += " AND level = ?";
        params.push(query.level);
      }

      const strict = await db.all(`SELECT * FROM cards ${where}`, params);
      if (strict.length > 0) {
        const card = strict[Math.floor(Math.random() * strict.length)];
        res.json(card);
        return;
      }

      const relaxed = await db.all(`SELECT * FROM cards WHERE type = ? AND pack_id = ?`, [
        query.type,
        query.packId
      ]);
      if (relaxed.length > 0) {
        const card = relaxed[Math.floor(Math.random() * relaxed.length)];
        res.json(card);
        return;
      }

      res.status(404).json({ error: "no_cards_in_pack" });
    })
    .catch((err) => res.status(500).json({ error: "db_error", details: String(err) }));
});

app.get("/rooms/:roomId", (req, res) => {
  dbPromise
    .then(async (db) => {
      const room = await db.get(
        "SELECT id, created_by as createdBy, group_id as groupId, created_at as createdAt FROM rooms WHERE id = ?",
        req.params.roomId
      );
      if (!room) {
        res.status(404).json({ error: "room_not_found" });
        return;
      }
      res.json(room);
    })
    .catch((err) => {
      res.status(500).json({ error: "db_error", details: String(err) });
    });
});

app.post("/rooms", (req, res) => {
  dbPromise
    .then(async (db) => {
      const body = z
        .object({
          createdBy: z.string().min(1)
        })
        .parse(req.body);

      const room = {
        id: nanoid(8),
        createdBy: body.createdBy,
        createdAt: new Date().toISOString()
      };

      await db.run(
        "INSERT INTO rooms (id, created_by, created_at) VALUES (?, ?, ?)",
        room.id,
        room.createdBy,
        room.createdAt
      );

      res.json(room);
    })
    .catch((err) => {
      res.status(500).json({ error: "db_error", details: String(err) });
    });
});

app.post("/rooms/:roomId/group", (req, res) => {
  dbPromise
    .then(async (db) => {
      const room = await db.get("SELECT id FROM rooms WHERE id = ?", req.params.roomId);
      if (!room) {
        res.status(404).json({ error: "room_not_found" });
        return;
      }

      const body = z
        .object({
          groupId: z.string().min(1)
        })
        .parse(req.body);

      await db.run("UPDATE rooms SET group_id = ? WHERE id = ?", body.groupId, req.params.roomId);

      const updated = await db.get(
        "SELECT id, created_by as createdBy, group_id as groupId, created_at as createdAt FROM rooms WHERE id = ?",
        req.params.roomId
      );
      res.json(updated);
    })
    .catch((err) => {
      res.status(500).json({ error: "db_error", details: String(err) });
    });
});

app.post("/rooms/:roomId/players", (req, res) => {
  dbPromise
    .then(async (db) => {
      const room = await db.get("SELECT id FROM rooms WHERE id = ?", req.params.roomId);
      if (!room) {
        res.status(404).json({ error: "room_not_found" });
        return;
      }

      const body = z
        .object({
          name: z.string().min(1),
          gender: z.enum(["m", "f"])
        })
        .parse(req.body);

      const id = nanoid(8);
      await db.run(
        "INSERT INTO room_players (id, room_id, name, gender, created_at) VALUES (?, ?, ?, ?, ?)",
        id,
        req.params.roomId,
        body.name,
        body.gender,
        new Date().toISOString()
      );

      res.json({ id });
    })
    .catch((err) => res.status(500).json({ error: "db_error", details: String(err) }));
});

app.get("/rooms/:roomId/players", (req, res) => {
  dbPromise
    .then(async (db) => {
      const rows = await db.all(
        "SELECT id, name, gender FROM room_players WHERE room_id = ? ORDER BY created_at ASC",
        req.params.roomId
      );
      res.json(rows);
    })
    .catch((err) => res.status(500).json({ error: "db_error", details: String(err) }));
});

app.delete("/rooms/:roomId/players/:playerId", (req, res) => {
  dbPromise
    .then(async (db) => {
      await db.run(
        "DELETE FROM room_players WHERE id = ? AND room_id = ?",
        req.params.playerId,
        req.params.roomId
      );
      res.json({ ok: true });
    })
    .catch((err) => res.status(500).json({ error: "db_error", details: String(err) }));
});

app.post("/rooms/:roomId/rounds", (req, res) => {
  dbPromise
    .then(async (db) => {
      const room = await db.get("SELECT id FROM rooms WHERE id = ?", req.params.roomId);
      if (!room) {
        res.status(404).json({ error: "room_not_found" });
        return;
      }

      const body = z
        .object({
          playerId: z.string().min(1),
          cardId: z.string().optional(),
          cardText: z.string().min(1),
          cardType: z.enum(["truth", "dare"]),
          level: z.string().min(1),
          packId: z.string().min(1)
        })
        .parse(req.body);

      const id = nanoid(10);
      await db.run(
        "INSERT INTO rounds (id, room_id, player_id, card_id, card_text, card_type, level, pack_id, created_at, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        id,
        req.params.roomId,
        body.playerId,
        body.cardId ?? null,
        body.cardText,
        body.cardType,
        body.level,
        body.packId,
        new Date().toISOString(),
        "assigned"
      );

      res.json({ id });
    })
    .catch((err) => res.status(500).json({ error: "db_error", details: String(err) }));
});

app.get("/rooms/:roomId/rounds", (req, res) => {
  dbPromise
    .then(async (db) => {
      const rows = await db.all(
        "SELECT r.id, r.player_id as playerId, p.name as playerName, r.card_text as cardText, r.card_type as cardType, r.level, r.pack_id as packId, r.status, r.created_at as createdAt FROM rounds r JOIN room_players p ON p.id = r.player_id WHERE r.room_id = ? ORDER BY r.created_at DESC",
        req.params.roomId
      );
      res.json(rows);
    })
    .catch((err) => res.status(500).json({ error: "db_error", details: String(err) }));
});

app.post("/rooms/:roomId/rounds/:roundId/status", (req, res) => {
  dbPromise
    .then(async (db) => {
      const body = z
        .object({
          status: z.enum(["assigned", "completed", "skipped"])
        })
        .parse(req.body);

      await db.run(
        "UPDATE rounds SET status = ? WHERE id = ? AND room_id = ?",
        body.status,
        req.params.roundId,
        req.params.roomId
      );
      res.json({ ok: true });
    })
    .catch((err) => res.status(500).json({ error: "db_error", details: String(err) }));
});
app.post("/rooms/:roomId/proofs", (req, res) => {
  dbPromise
    .then(async (db) => {
      const room = await db.get("SELECT id FROM rooms WHERE id = ?", req.params.roomId);
      if (!room) {
        res.status(404).json({ error: "room_not_found" });
        return;
      }

      const body = z
        .object({
          createdBy: z.string().min(1),
          roundId: z.string().optional()
        })
        .parse(req.body);

      const proof = {
        id: nanoid(10),
        roomId: req.params.roomId,
        createdBy: body.createdBy,
        roundId: body.roundId ?? null,
        createdAt: new Date().toISOString(),
        status: "pending" as const
      };

      await db.run(
        "INSERT INTO proofs (id, room_id, created_by, round_id, created_at, status) VALUES (?, ?, ?, ?, ?, ?)",
        proof.id,
        proof.roomId,
        proof.createdBy,
        proof.roundId,
        proof.createdAt,
        proof.status
      );

      res.json({ proofId: proof.id });
    })
    .catch((err) => {
      res.status(500).json({ error: "db_error", details: String(err) });
    });
});

app.post("/rooms/:roomId/proofs/:proofId/complete", (req, res) => {
  dbPromise
    .then(async (db) => {
      const proof = await db.get("SELECT id, room_id as roomId FROM proofs WHERE id = ?", req.params.proofId);
      if (!proof || proof.roomId !== req.params.roomId) {
        res.status(404).json({ error: "proof_not_found" });
        return;
      }

      const body = z
        .object({
          telegramChatId: z.string().min(1),
          telegramMessageId: z.string().min(1)
        })
        .parse(req.body);

      await db.run(
        "UPDATE proofs SET telegram_chat_id = ?, telegram_message_id = ? WHERE id = ?",
        body.telegramChatId,
        body.telegramMessageId,
        req.params.proofId
      );

      const updated = await db.get(
        "SELECT id, room_id as roomId, created_by as createdBy, round_id as roundId, created_at as createdAt, telegram_chat_id as telegramChatId, telegram_message_id as telegramMessageId, status FROM proofs WHERE id = ?",
        req.params.proofId
      );

      res.json({ ok: true, proof: updated });
    })
    .catch((err) => {
      res.status(500).json({ error: "db_error", details: String(err) });
    });
});

app.post("/rooms/:roomId/proofs/:proofId/vote", (req, res) => {
  dbPromise
    .then(async (db) => {
      const proof = await db.get(
        "SELECT id, room_id as roomId, round_id as roundId, status FROM proofs WHERE id = ?",
        req.params.proofId
      );
      if (!proof || proof.roomId !== req.params.roomId) {
        res.status(404).json({ error: "proof_not_found" });
        return;
      }

      const body = z
        .object({
          voterId: z.string().min(1),
          vote: z.enum(["yes", "no"]),
          tieBreaker: z.boolean().optional()
        })
        .parse(req.body);

      await db.run(
        "INSERT INTO votes (proof_id, voter_id, vote, created_at) VALUES (?, ?, ?, ?) ON CONFLICT(proof_id, voter_id) DO UPDATE SET vote = excluded.vote",
        req.params.proofId,
        body.voterId,
        body.vote,
        new Date().toISOString()
      );

      const rows = await db.all("SELECT vote FROM votes WHERE proof_id = ?", req.params.proofId);
      const yes = rows.filter((v) => v.vote === "yes").length;
      const no = rows.filter((v) => v.vote === "no").length;
      let status = proof.status as "pending" | "approved" | "rejected";

      if (yes !== no) {
        status = yes > no ? "approved" : "rejected";
      } else if (body.tieBreaker) {
        status = body.vote === "yes" ? "approved" : "rejected";
      }

      if (status !== proof.status) {
        await db.run("UPDATE proofs SET status = ? WHERE id = ?", status, req.params.proofId);
        if (proof.roundId) {
          const roundStatus = status === "approved" ? "completed" : "skipped";
          await db.run(
            "UPDATE rounds SET status = ? WHERE id = ? AND room_id = ?",
            roundStatus,
            proof.roundId,
            req.params.roomId
          );
        }
      }

      res.json({ status, yes, no });
    })
    .catch((err) => {
      res.status(500).json({ error: "db_error", details: String(err) });
    });
});

app.get("/rooms/:roomId/proofs/:proofId", (req, res) => {
  dbPromise
    .then(async (db) => {
      const proof = await db.get(
        "SELECT id, room_id as roomId, created_by as createdBy, round_id as roundId, created_at as createdAt, telegram_chat_id as telegramChatId, telegram_message_id as telegramMessageId, status FROM proofs WHERE id = ?",
        req.params.proofId
      );
      if (!proof || proof.roomId !== req.params.roomId) {
        res.status(404).json({ error: "proof_not_found" });
        return;
      }

      const votesRows = await db.all("SELECT voter_id as voterId, vote FROM votes WHERE proof_id = ?", req.params.proofId);
      const votes: Record<string, "yes" | "no"> = {};
      for (const row of votesRows) {
        votes[row.voterId] = row.vote;
      }

      res.json({ ...proof, votes });
    })
    .catch((err) => {
      res.status(500).json({ error: "db_error", details: String(err) });
    });
});

app.get("/proofs/:proofId", (req, res) => {
  dbPromise
    .then(async (db) => {
      const proof = await db.get(
        "SELECT id, room_id as roomId, created_by as createdBy, round_id as roundId, created_at as createdAt, telegram_chat_id as telegramChatId, telegram_message_id as telegramMessageId, status FROM proofs WHERE id = ?",
        req.params.proofId
      );
      if (!proof) {
        res.status(404).json({ error: "proof_not_found" });
        return;
      }
      res.json(proof);
    })
    .catch((err) => {
      res.status(500).json({ error: "db_error", details: String(err) });
    });
});

app.listen(PORT, () => {
  console.log(`API listening on :${PORT}`);
});
