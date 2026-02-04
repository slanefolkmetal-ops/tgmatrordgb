import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
import axios from "axios";
import { Telegraf, Markup } from "telegraf";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: resolve(__dirname, "../.env") });

const BOT_TOKEN = process.env.BOT_TOKEN;
const API_BASE = process.env.API_BASE ?? "http://localhost:4000";
const MINI_APP_URL = process.env.MINI_APP_URL ?? "https://example.com";

function isValidUrlForTelegram(url: string) {
  return url.startsWith("https://") && !url.includes("localhost") && !url.includes("127.0.0.1");
}

if (!BOT_TOKEN) {
  throw new Error("BOT_TOKEN is required");
}

const bot = new Telegraf(BOT_TOKEN);

const proofRegex = /(proof[_-]?id[:\s]*|#proof\s*)(?:<)?([A-Za-z0-9_-]{6,})(?:>)?/i;

async function fetchRoom(roomId: string) {
  const { data } = await axios.get(`${API_BASE}/rooms/${roomId}`);
  return data as { id: string; createdBy: string; groupId?: string };
}

async function fetchProof(proofId: string) {
  const { data } = await axios.get(`${API_BASE}/proofs/${proofId}`);
  return data as {
    id: string;
    roomId: string;
    createdBy: string;
    status: "pending" | "approved" | "rejected";
  };
}

async function bindGroup(roomId: string, groupId: string) {
  await axios.post(`${API_BASE}/rooms/${roomId}/group`, { groupId });
}

async function completeProof(roomId: string, proofId: string, chatId: string, messageId: string) {
  await axios.post(`${API_BASE}/rooms/${roomId}/proofs/${proofId}/complete`, {
    telegramChatId: chatId,
    telegramMessageId: messageId
  });
}

async function vote(roomId: string, proofId: string, voterId: string, value: "yes" | "no") {
  const room = await fetchRoom(roomId);
  const tieBreaker = room.createdBy === voterId;
  const { data } = await axios.post(`${API_BASE}/rooms/${roomId}/proofs/${proofId}/vote`, {
    voterId,
    vote: value,
    tieBreaker
  });
  return data as { status: string; yes: number; no: number };
}

bot.start(async (ctx) => {
  const payload = ctx.payload?.trim();
  if (ctx.chat?.type === "group" || ctx.chat?.type === "supergroup") {
    if (payload) {
      await bindGroup(payload, String(ctx.chat.id));
      await ctx.reply(
        `Группа привязана к комнате ${payload}. Теперь сюда будут приходить подтверждения.`
      );
      return;
    }
  }

  await ctx.reply(
    "Привет! Я бот подтверждений. Отправьте мне фото/видео с кодом proof_id в тексте."
  );
});

bot.on(["photo", "video"], async (ctx) => {
  try {
    const caption = "caption" in ctx.message ? ctx.message.caption ?? "" : "";
    const text = "text" in ctx.message ? ctx.message.text ?? "" : "";
    const content = `${caption} ${text}`.trim();
    const match = content.match(proofRegex);

    if (!match) {
      await ctx.reply("Не вижу proof_id. Добавьте в текст: #proof <ID>.");
      return;
    }

    const proofId = match[2];
    const proof = await fetchProof(proofId);
    const room = await fetchRoom(proof.roomId);

    if (!room.groupId) {
      await ctx.reply("Комната пока не привязана к группе. Попросите создателя комнаты сделать это.");
      return;
    }

    const forwarded = await ctx.telegram.copyMessage(
      room.groupId,
      ctx.chat.id,
      ctx.message.message_id
    );

    const chatId = String(room.groupId);
    const messageId = String(forwarded.message_id);
    await completeProof(room.id, proofId, chatId, messageId);

    const rows = [
      [
        Markup.button.callback("Засчитать", `vote:${proofId}:yes`),
        Markup.button.callback("Не засчитать", `vote:${proofId}:no`)
      ]
    ];

    if (isValidUrlForTelegram(MINI_APP_URL)) {
      rows.push([Markup.button.url("Открыть mini-app", MINI_APP_URL)]);
    }

    const keyboard = Markup.inlineKeyboard(rows);

    await ctx.telegram.sendMessage(
      room.groupId,
      `Подтверждение от игрока ${proof.createdBy}. Голосуйте:`,
      keyboard
    );

    await ctx.reply("Готово! Подтверждение отправлено в группу комнаты.");
  } catch (err) {
    console.error("Failed to process proof", err);
    await ctx.reply("Не удалось отправить кнопки голосования. Проверьте права бота в группе.");
  }
});

bot.on("text", async (ctx) => {
  const content = ctx.message.text ?? "";
  const match = content.match(proofRegex);
  if (!match) return;
  await ctx.reply(
    `Код ${match[2]} принят. Теперь отправьте фото/видео с этим кодом в подписи: #proof <ID>.`
  );
});

bot.on("callback_query", async (ctx) => {
  const data = "data" in ctx.callbackQuery ? ctx.callbackQuery.data : undefined;
  if (!data || !data.startsWith("vote:")) {
    return;
  }

  const [, proofId, value] = data.split(":");
  const proof = await fetchProof(proofId);
  const result = await vote(proof.roomId, proofId, String(ctx.from.id), value === "yes" ? "yes" : "no");

  await ctx.answerCbQuery(`Голос принят. Сейчас ${result.yes}:${result.no}`);
});

bot.launch();
console.log("Bot started");
