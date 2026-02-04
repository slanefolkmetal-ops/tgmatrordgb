import { useEffect, useMemo, useState } from "react";

type Screen = "welcome" | "lobby" | "room" | "round" | "catalog" | "my-packs" | "dev";

type GameMode = "offline" | "online";

type Level = string;

type Pack = {
  id: string;
  title: string;
  paid: boolean;
  levels: Level[];
  price: string;
  mode?: GameMode;
};

type Card = {
  id: string;
  type: "truth" | "dare";
  text: string;
  level: Level;
  packId: string;
  requiresTarget?: boolean;
  targetGender?: "m" | "f" | "any";
};

type Player = {
  id: string;
  name: string;
  gender: "m" | "f";
};

type RoundEntry = {
  id: string;
  player: string;
  cardText: string;
  cardType: "truth" | "dare";
  level: Level;
  packId: string;
  status?: "assigned" | "completed" | "skipped";
};

const MODES = [
  { id: "offline", title: "Оффлайн (1 телефон)" },
  { id: "online", title: "Онлайн (комната)" }
] as const;

const LEVELS: Level[] = ["Лайт", "Средний", "Смелый", "Жёсткий", "Экстрим"];

const PACKS: Pack[] = [
  { id: "base", title: "Базовый набор", paid: false, levels: ["Лайт", "Средний"], price: "Бесплатно", mode: "offline" }
];

const DEFAULT_PLAYERS: Player[] = [
  { id: "p1", name: "Аня", gender: "f" },
  { id: "p2", name: "Игорь", gender: "m" },
  { id: "p3", name: "Лера", gender: "f" }
];

const LOCAL_FALLBACK_CARDS: Card[] = [
  { id: "local_t1", type: "truth", text: "Назови самый яркий момент вечера.", level: "Лайт", packId: "base" },
  { id: "local_d1", type: "dare", text: "Сделай комплимент игроку справа.", level: "Лайт", packId: "base" }
];

const isAdultPackId = (id: string) => id.startsWith("plus18");

export default function App() {
  const [screen, setScreen] = useState<Screen>("welcome");
  const [mode, setMode] = useState<GameMode>("offline");
  const [level, setLevel] = useState<Level>("Средний");
  const [activePackId, setActivePackId] = useState<string>(() => {
    if (typeof window === "undefined") return "base";
    return window.localStorage.getItem("activePackId") ?? "base";
  });
  const [packs, setPacks] = useState<Pack[]>(PACKS);
  const [ownedPacks, setOwnedPacks] = useState<string[]>(() => {
    if (typeof window === "undefined") return ["base"];
    const saved = window.localStorage.getItem("ownedPacks");
    return saved ? JSON.parse(saved) : ["base"];
  });
  const [ageConfirmed, setAgeConfirmed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("ageConfirmed") === "true";
  });
  const [showAgeGate, setShowAgeGate] = useState(false);
  const [pendingPackId, setPendingPackId] = useState<string | null>(null);

  const [players, setPlayers] = useState<Player[]>(DEFAULT_PLAYERS);
  const [currentPlayerIndex, setCurrentPlayerIndex] = useState(0);
  const [allowFF, setAllowFF] = useState(true);
  const [allowMM, setAllowMM] = useState(true);
  const [allowFM, setAllowFM] = useState(true);

  const [cardType, setCardType] = useState<"truth" | "dare">("truth");
  const [currentCard, setCurrentCard] = useState<Card | null>(null);
  const [roundLog, setRoundLog] = useState<RoundEntry[]>([]);
  const [roomRounds, setRoomRounds] = useState<RoundEntry[]>([]);

  const [roomId, setRoomId] = useState("");
  const [createdBy, setCreatedBy] = useState("12345");
  const [groupId, setGroupId] = useState("-1001234567890");
  const [botUsername, setBotUsername] = useState("trordgamebot");
  const [apiBase, setApiBase] = useState("http://127.0.0.1:4000");
  const [apiStatus, setApiStatus] = useState("unknown");

  const [proofId, setProofId] = useState("");
  const [proofStatus, setProofStatus] = useState("pending");
  const [proofVotes, setProofVotes] = useState<{ yes: number; no: number }>({ yes: 0, no: 0 });
  const [chatLink, setChatLink] = useState("");
  const [lastRoundId, setLastRoundId] = useState<string>("");

  const [devLog, setDevLog] = useState<string[]>([]);
  const [newPackTitle, setNewPackTitle] = useState("");
  const [newPackLevels, setNewPackLevels] = useState("Лайт,Средний");
  const [newPackPrice, setNewPackPrice] = useState("50 ⭐");
  const [newCardText, setNewCardText] = useState("");
  const [newCardType, setNewCardType] = useState<"truth" | "dare">("truth");
  const [newCardLevel, setNewCardLevel] = useState<Level>("Лайт");
  const [newCardTarget, setNewCardTarget] = useState<"none" | "m" | "f" | "any">("none");
  const [packCards, setPackCards] = useState<Card[]>([]);
  const [roomPlayers, setRoomPlayers] = useState<Player[]>([]);
  const [adminPacks, setAdminPacks] = useState<
    { id: string; title: string; filename: string; baseId?: string; mode?: GameMode }[]
  >([]);
  const [packJson, setPackJson] = useState("");
  const [packJsonId, setPackJsonId] = useState("");

  const title = useMemo(() => "Правда или Действие", []);
  const statusLabel = (status?: RoundEntry["status"]) => {
    if (!status) return "";
    if (status === "assigned") return "назначено";
    if (status === "completed") return "выполнено";
    return "пропущено";
  };

  const isDev = typeof window !== "undefined" && new URLSearchParams(window.location.search).has("dev");

  const visiblePacks = useMemo(
    () => packs.filter((pack) => (pack.mode ?? "offline") === mode),
    [packs, mode]
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("activePackId", activePackId);
  }, [activePackId]);

  useEffect(() => {
    if (!activePackId) return;
    const hasActive = visiblePacks.some((pack) => pack.id === activePackId);
    if (!hasActive) {
      setActivePackId(visiblePacks[0]?.id ?? "");
    }
  }, [visiblePacks, activePackId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("ownedPacks", JSON.stringify(ownedPacks));
  }, [ownedPacks]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("ageConfirmed", ageConfirmed ? "true" : "false");
  }, [ageConfirmed]);

  useEffect(() => {
    if (screen === "lobby" || screen === "catalog" || screen === "room" || screen === "my-packs") {
      fetchPacks();
    }
  }, [screen]);

  const pushLog = (line: string) => {
    setDevLog((prev) => [line, ...prev].slice(0, 200));
  };

  const getFallbackBase = () =>
    apiBase.includes("127.0.0.1") ? "http://localhost:4000" : "http://127.0.0.1:4000";

  const call = async (path: string, init?: RequestInit, fallbackBase?: string) => {
    const attempt = async (base: string) => {
      const res = await fetch(`${base}${path}`, {
        headers: { "Content-Type": "application/json" },
        ...init
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error ?? `HTTP ${res.status}`);
      }
      return { data, base };
    };

    try {
      const result = await attempt(apiBase);
      setApiStatus("ok");
      return result.data;
    } catch (err) {
      if (fallbackBase) {
        const result = await attempt(fallbackBase);
        setApiBase(result.base);
        setApiStatus("ok");
        pushLog(`API base переключён на ${result.base}`);
        return result.data;
      }
      setApiStatus((err as Error).message || "error");
      throw err;
    }
  };

  const fetchPacks = async () => {
    try {
      const data = await call("/packs", undefined, getFallbackBase());
      if (Array.isArray(data)) {
        const normalized = data.map((pack) => ({
          id: pack.id,
          title: pack.title,
          paid: Boolean(pack.paid),
          levels: Array.isArray(pack.levels) && pack.levels.length > 0 ? pack.levels : LEVELS,
          price: pack.price
        }));
        setPacks(normalized);
        if (!normalized.find((pack) => pack.id === activePackId)) {
          const fallback = normalized.find((pack) => ownedPacks.includes(pack.id));
          setActivePackId(fallback?.id ?? "base");
        }
      }
      pushLog("Наборы загружены из API");
    } catch (err) {
      pushLog(`Не удалось загрузить наборы: ${(err as Error).message}`);
      setApiStatus("offline");
    }
  };

  const selectPack = (packId: string) => {
    if (!ownedPacks.includes(packId)) {
      setScreen("catalog");
      return;
    }
    if (isAdultPackId(packId) && !ageConfirmed) {
      setPendingPackId(packId);
      setShowAgeGate(true);
      return;
    }
    setActivePackId(packId);
  };

  const confirmAge = () => {
    setAgeConfirmed(true);
    setShowAgeGate(false);
    if (pendingPackId) {
      setActivePackId(pendingPackId);
    }
    setPendingPackId(null);
  };

  const denyAge = () => {
    setShowAgeGate(false);
    setPendingPackId(null);
  };

  const buyPack = (packId: string) => {
    if (ownedPacks.includes(packId)) return;
    if (isAdultPackId(packId) && !ageConfirmed) {
      setPendingPackId(packId);
      setShowAgeGate(true);
      return;
    }
    setOwnedPacks((prev) => [...prev, packId]);
    pushLog(`Набор куплен: ${packId}`);
  };

  const createRoom = async () => {
    try {
      const data = await call(
        "/rooms",
        {
          method: "POST",
          body: JSON.stringify({ createdBy })
        },
        getFallbackBase()
      );
      setRoomId(data.id);
      pushLog(`Комната создана: ${data.id}`);
    } catch (err) {
      pushLog(`Ошибка создания комнаты: ${(err as Error).message}`);
    }
  };

  const bindGroup = async () => {
    if (!roomId) return;
    try {
      const data = await call(
        `/rooms/${roomId}/group`,
        {
          method: "POST",
          body: JSON.stringify({ groupId })
        },
        getFallbackBase()
      );
      pushLog(`Группа привязана: ${data.groupId}`);
    } catch (err) {
      pushLog(`Ошибка привязки группы: ${(err as Error).message}`);
    }
  };

  const syncPlayersToRoom = async () => {
    if (!roomId) {
      pushLog("Нет room_id для синхронизации игроков.");
      return;
    }
    try {
      for (const player of players) {
        await call(
          `/rooms/${roomId}/players`,
          {
            method: "POST",
            body: JSON.stringify({ name: player.name, gender: player.gender })
          },
          getFallbackBase()
        );
      }
      await fetchRoomPlayers();
      pushLog("Игроки синхронизированы с комнатой.");
    } catch (err) {
      pushLog(`Не удалось синхронизировать игроков: ${(err as Error).message}`);
    }
  };

  const fetchRoomPlayers = async () => {
    if (!roomId) return;
    try {
      const data = await call(`/rooms/${roomId}/players`, undefined, getFallbackBase());
      if (Array.isArray(data)) {
        setRoomPlayers(data);
      }
      pushLog("Игроки комнаты загружены.");
    } catch (err) {
      pushLog(`Не удалось загрузить игроков: ${(err as Error).message}`);
    }
  };

  const fetchRoomRounds = async () => {
    if (!roomId) return;
    try {
      const data = await call(`/rooms/${roomId}/rounds`, undefined, getFallbackBase());
      if (Array.isArray(data)) {
        setRoomRounds(
          data.map((item) => ({
            id: item.id,
            player: item.playerName,
            cardText: item.cardText,
            cardType: item.cardType,
            level: item.level,
            packId: item.packId,
            status: item.status
          }))
        );
      }
      pushLog("История раунда загружена.");
    } catch (err) {
      pushLog(`Не удалось загрузить историю: ${(err as Error).message}`);
    }
  };

  const pickCard = async () => {
    const packId = activePackId || visiblePacks[0]?.id || "";
    if (!packId) {
      pushLog("Нет выбранного набора для запроса карточки.");
      return;
    }
    const query = new URLSearchParams({
      type: cardType,
      level,
      packId
    });
    try {
      const card = (await call(`/cards/next?${query.toString()}`, undefined, getFallbackBase())) as Card;
      const formattedText = formatCardText(card.text);
      pushLog(`Карточка запрошена: pack=${packId}, level=${level}, type=${cardType}`);
      setCurrentCard({
        ...card,
        packId: card.packId ?? card.pack_id,
        text: formattedText
      });
      const player = players[currentPlayerIndex]?.name ?? "Игрок";
      setRoundLog((prev) => [
        {
          id: `${Date.now()}-${card.id}`,
          player,
          cardText: formattedText,
          cardType: card.type,
          level: card.level,
          packId: card.packId ?? card.pack_id
        },
        ...prev
      ]);
      const nextIndex = (currentPlayerIndex + 1) % players.length;
      setCurrentPlayerIndex(nextIndex);

      if (mode === "online" && roomId) {
        const roomPlayer = roomPlayers.find((p) => p.name === player);
        if (roomPlayer) {
          const result = await call(
            `/rooms/${roomId}/rounds`,
            {
              method: "POST",
              body: JSON.stringify({
                playerId: roomPlayer.id,
                cardId: card.id,
                cardText: formattedText,
                cardType: card.type,
                level: card.level,
                packId: card.packId ?? card.pack_id
              })
            },
            getFallbackBase()
          );
          if (result?.id) {
            setLastRoundId(result.id);
            pushLog(`Раунд сохранён: ${result.id}`);
          }
        } else {
          pushLog("Игрок не синхронизирован с комнатой (roomPlayers пуст)." );
        }
      }
    } catch (err) {
      pushLog(`Не удалось получить карточку: ${(err as Error).message}`);
      const localPool = LOCAL_FALLBACK_CARDS.filter((card) => card.type === cardType && card.packId === packId);
      const fallbackCard = localPool[Math.floor(Math.random() * localPool.length)];
      if (fallbackCard) {
        setCurrentCard(fallbackCard);
        const player = players[currentPlayerIndex]?.name ?? "Игрок";
        setRoundLog((prev) => [
          {
            id: `${Date.now()}-${fallbackCard.id}`,
            player,
            cardText: fallbackCard.text,
            cardType: fallbackCard.type,
            level: fallbackCard.level,
            packId: fallbackCard.packId
          },
          ...prev
        ]);
        setCurrentPlayerIndex((prev) => (prev + 1) % players.length);
        pushLog("Использована локальная карточка (fallback)." );
      }
    }
  };

  const createProof = async () => {
    if (!roomId) return;
    try {
      const data = await call(
        `/rooms/${roomId}/proofs`,
        {
          method: "POST",
          body: JSON.stringify({ createdBy, roundId: lastRoundId || undefined })
        },
        getFallbackBase()
      );
      setProofId(data.proofId);
      setProofStatus("pending");
      setChatLink("");
      setProofVotes({ yes: 0, no: 0 });
      pushLog(`Proof создан: ${data.proofId}`);
    } catch (err) {
      pushLog(`Ошибка создания proof: ${(err as Error).message}`);
    }
  };

  const formatCardText = (text: string) => {
    const names = players.map((p) => p.name).filter(Boolean);
    const currentName = players[currentPlayerIndex]?.name;
    const others = names.filter((name) => name !== currentName);
    const pickRandom = () => (others.length ? others[Math.floor(Math.random() * others.length)] : "игрока");
    const leftIndex = (currentPlayerIndex - 1 + players.length) % players.length;
    const rightIndex = (currentPlayerIndex + 1) % players.length;
    const oppositeIndex = players.length >= 4 ? (currentPlayerIndex + Math.floor(players.length / 2)) % players.length : -1;

    const replace = (value: string, fallback: string) => {
      if (!value) return fallback;
      return value;
    };

    let result = text;
    if (result.includes("{player}")) {
      result = result.replaceAll("{player}", replace(pickRandom(), "игрока"));
    }
    if (result.includes("{left}")) {
      result = result.replaceAll("{left}", replace(players[leftIndex]?.name ?? "", "игрока слева"));
    }
    if (result.includes("{right}")) {
      result = result.replaceAll("{right}", replace(players[rightIndex]?.name ?? "", "игрока справа"));
    }
    if (result.includes("{opposite}")) {
      const name = oppositeIndex >= 0 ? players[oppositeIndex]?.name ?? "" : "";
      result = result.replaceAll("{opposite}", replace(name, "игрока напротив"));
    }
    return result;
  };

  const completeProof = async () => {
    if (!roomId || !proofId) return;
    try {
      await call(
        `/rooms/${roomId}/proofs/${proofId}/complete`,
        {
          method: "POST",
          body: JSON.stringify({ telegramChatId: groupId, telegramMessageId: "55" })
        },
        getFallbackBase()
      );
      pushLog(`Proof подтвержден: ${proofId}`);
    } catch (err) {
      pushLog(`Ошибка подтверждения proof: ${(err as Error).message}`);
    }
  };

  const vote = async (value: "yes" | "no") => {
    if (!roomId || !proofId) return;
    try {
      const data = await call(
        `/rooms/${roomId}/proofs/${proofId}/vote`,
        {
          method: "POST",
          body: JSON.stringify({ voterId: createdBy, vote: value })
        },
        getFallbackBase()
      );
      setProofStatus(data.status ?? proofStatus);
      setProofVotes({ yes: data.yes ?? 0, no: data.no ?? 0 });
      pushLog(`Голос учтен: ${data.yes}:${data.no}, статус ${data.status}`);
    } catch (err) {
      pushLog(`Ошибка голосования: ${(err as Error).message}`);
    }
  };

  const fetchProof = async () => {
    if (!roomId || !proofId) return;
    try {
      const data = await call(`/rooms/${roomId}/proofs/${proofId}`, undefined, getFallbackBase());
      setProofStatus(data.status ?? "pending");
      const votes = Object.values(data.votes ?? {});
      const yes = votes.filter((v: string) => v === "yes").length;
      const no = votes.filter((v: string) => v === "no").length;
      setProofVotes({ yes, no });
      setChatLink(
        data.telegramChatId
          ? `https://t.me/c/${String(data.telegramChatId).replace("-100", "")}/${data.telegramMessageId ?? ""}`
          : ""
      );
      pushLog(`Proof статус обновлен: ${data.status}`);
    } catch (err) {
      pushLog(`Ошибка загрузки proof: ${(err as Error).message}`);
    }
  };

  const fetchPackCards = async () => {
    if (!activePackId) return;
    try {
      const data = await call(`/packs/${activePackId}/cards`, undefined, getFallbackBase());
      if (Array.isArray(data)) {
        setPackCards(
          data.map((card) => ({
            ...card,
            packId: card.packId ?? card.pack_id
          }))
        );
      }
      pushLog(`Карточки набора загружены: ${activePackId}`);
    } catch (err) {
      pushLog(`Не удалось загрузить карточки набора: ${(err as Error).message}`);
    }
  };

  const fetchAdminPacks = async () => {
    try {
      const data = await call("/admin/packs", undefined, getFallbackBase());
      if (Array.isArray(data)) {
        setAdminPacks(data);
      }
      pushLog("Админ пакеты загружены.");
    } catch (err) {
      pushLog(`Не удалось загрузить админ-паки: ${(err as Error).message}`);
    }
  };

  const loadAdminPack = async (id: string) => {
    try {
      const res = await fetch(`${apiBase}/admin/packs/${id}`);
      const text = await res.text();
      setPackJson(text);
      setPackJsonId(id);
      pushLog(`Файл ${id} загружен.`);
    } catch (err) {
      pushLog(`Не удалось загрузить файл: ${(err as Error).message}`);
    }
  };

  const saveAdminPack = async () => {
    try {
      const parsed = JSON.parse(packJson);
      const packId = parsed?.pack?.id ?? packJsonId;
      if (!packId) {
        pushLog("В JSON нет pack.id");
        return;
      }
      await call(`/admin/packs/${packId}`, { method: "PUT", body: packJson }, getFallbackBase());
      pushLog(`Файл ${packId} сохранён.`);
      await fetchAdminPacks();
      await fetchPacks();
    } catch (err) {
      pushLog(`Не удалось сохранить файл: ${(err as Error).message}`);
    }
  };

  const createAdminPack = async () => {
    try {
      await call("/admin/packs", { method: "POST", body: packJson }, getFallbackBase());
      pushLog("Новый файл создан.");
      await fetchAdminPacks();
      await fetchPacks();
    } catch (err) {
      pushLog(`Не удалось создать файл: ${(err as Error).message}`);
    }
  };

  const deleteAdminPack = async (id: string) => {
    try {
      await call(`/admin/packs/${id}`, { method: "DELETE" }, getFallbackBase());
      pushLog(`Файл ${id} удалён.`);
      await fetchAdminPacks();
      await fetchPacks();
    } catch (err) {
      pushLog(`Не удалось удалить файл: ${(err as Error).message}`);
    }
  };

  const createPack = async () => {
    try {
      const levels = newPackLevels
        .split(",")
        .map((level) => level.trim())
        .filter(Boolean);
      const data = await call(
        "/packs",
        {
          method: "POST",
          body: JSON.stringify({
            title: newPackTitle || "Новый набор",
            paid: true,
            price: newPackPrice || "100 ⭐",
            levels
          })
        },
        getFallbackBase()
      );
      setActivePackId(data.id);
      setOwnedPacks((prev) => [...prev, data.id]);
      pushLog(`Создан набор: ${data.id} и выбран как активный`);
      await fetchPacks();
    } catch (err) {
      pushLog(`Не удалось создать набор: ${(err as Error).message}`);
    }
  };

  const createCard = async () => {
    if (!activePackId) return;
    try {
      const data = await call(
        `/packs/${activePackId}/cards`,
        {
          method: "POST",
          body: JSON.stringify({
            type: newCardType,
            text: newCardText,
            level: newCardLevel,
            requiresTarget: newCardTarget !== "none",
            targetGender: newCardTarget === "none" ? null : newCardTarget
          })
        },
        getFallbackBase()
      );
      pushLog(`Создана карточка: ${data.id}`);
      await fetchPackCards();
    } catch (err) {
      pushLog(`Не удалось создать карточку: ${(err as Error).message}`);
    }
  };

  const deleteCard = async (cardId: string) => {
    if (!activePackId) return;
    try {
      await call(`/packs/${activePackId}/cards/${cardId}`, { method: "DELETE" }, getFallbackBase());
      pushLog(`Карточка удалена: ${cardId}`);
      await fetchPackCards();
    } catch (err) {
      pushLog(`Не удалось удалить карточку: ${(err as Error).message}`);
    }
  };

  const startGroupLink = roomId ? `https://t.me/${botUsername}?startgroup=${roomId}` : "";

  return (
    <div className="page">
      <header className="topbar">
        <div className="brand">
          <div className="brand-title">{title}</div>
          <div className="brand-sub">TG Mini App</div>
        </div>
        <nav className="nav">
          <button className={screen === "welcome" ? "pill active" : "pill"} onClick={() => setScreen("welcome")}>Главная</button>
          <button className={screen === "lobby" ? "pill active" : "pill"} onClick={() => setScreen("lobby")}>Настройка</button>
          {mode === "online" && (
            <button className={screen === "room" ? "pill active" : "pill"} onClick={() => setScreen("room")}>Комната</button>
          )}
          <button className={screen === "round" ? "pill active" : "pill"} onClick={() => setScreen("round")}>Игра</button>
          <button className={screen === "catalog" ? "pill active" : "pill"} onClick={() => setScreen("catalog")}>Магазин</button>
          <button className={screen === "my-packs" ? "pill active" : "pill"} onClick={() => setScreen("my-packs")}>Мои наборы</button>
          {isDev && (
            <button className={screen === "dev" ? "pill active" : "pill"} onClick={() => setScreen("dev")}>Админка</button>
          )}
        </nav>
        <div className={`mode-chip ${mode}`}>{mode === "online" ? "Онлайн" : "Оффлайн"}</div>
      </header>

      {screen === "welcome" && (
        <section className="hero-card">
          <div className="hero-copy">
            <div className="badge">Игра для компаний</div>
            <h2>Правда или Действие — по‑взрослому</h2>
            <p className="muted">
              Выбирайте режим, собирайте игроков, получайте карточки и подтверждайте действия через Telegram.
            </p>
            <div className="actions">
              <button className="primary" onClick={() => setScreen("lobby")}>Начать игру</button>
              <button className="ghost" onClick={() => setScreen("catalog")}>Посмотреть наборы</button>
            </div>
          </div>
          <div className="mode-grid">
            {MODES.map((item) => (
              <button
                key={item.id}
                className={`mode-card ${item.id === mode ? "active" : ""}`}
                onClick={() => setMode(item.id)}
              >
                <div className="mode-title">{item.title}</div>
                <div className="mode-sub">
                  {item.id === "online"
                    ? "Комната, подтверждения и голосование"
                    : "Один телефон, компания рядом"}
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      {screen === "lobby" && (
        <>
          <section className="card">
            <h2>Наборы</h2>
            <div className="pack-grid">
              {visiblePacks.length === 0 ? (
                <div className="muted">Для этого режима пока нет наборов.</div>
              ) : (
                visiblePacks.map((pack) => {
                  const locked = !ownedPacks.includes(pack.id);
                  return (
                    <button
                      key={pack.id}
                      className={`pack-card ${pack.id === activePackId ? "active" : ""}`}
                      onClick={() => selectPack(pack.id)}
                    >
                      <div className="pack-title">{pack.title}</div>
                      <div className="pack-sub">{pack.levels.join(" / ")}</div>
                      <div className="pack-price">{pack.price}</div>
                      {locked && <div className="pack-lock">Закрыт</div>}
                    </button>
                  );
                })
              )}
            </div>
          </section>

          <section className="card">
            <h2>Сложность</h2>
            <div className="options">
              {(visiblePacks.find((pack) => pack.id === activePackId)?.levels ?? LEVELS).map((item) => (
                <button key={item} className={item === level ? "pill active" : "pill"} onClick={() => setLevel(item)}>
                  {item}
                </button>
              ))}
            </div>
          </section>

          <section className="card">
            <h2>Игроки</h2>
            <div className="players">
              {players.map((player, idx) => (
                <div key={player.id} className="player">
                  <input value={player.name} onChange={(e) => {
                    const next = [...players];
                    next[idx] = { ...player, name: e.target.value };
                    setPlayers(next);
                  }} />
                  <select value={player.gender} onChange={(e) => {
                    const next = [...players];
                    next[idx] = { ...player, gender: e.target.value as "m" | "f" };
                    setPlayers(next);
                  }}>
                    <option value="f">Девушка</option>
                    <option value="m">Парень</option>
                  </select>
                  <button
                    className="icon-btn"
                    onClick={() => {
                      if (players.length <= 2) return;
                      setPlayers(players.filter((_, i) => i !== idx));
                    }}
                    title="Удалить игрока"
                  >
                    −
                  </button>
                </div>
              ))}
            </div>
            <div className="actions">
              <button
                className="ghost"
                onClick={() => {
                  const nextId = `p${players.length + 1}`;
                  setPlayers([...players, { id: nextId, name: `Игрок ${players.length + 1}`, gender: "m" }]);
                }}
              >
                Добавить игрока
              </button>
            </div>
            <div className="options">
              <label className="toggle"><input type="checkbox" checked={allowFF} onChange={(e) => setAllowFF(e.target.checked)} />Девушка ↔ Девушка</label>
              <label className="toggle"><input type="checkbox" checked={allowMM} onChange={(e) => setAllowMM(e.target.checked)} />Парень ↔ Парень</label>
              <label className="toggle"><input type="checkbox" checked={allowFM} onChange={(e) => setAllowFM(e.target.checked)} />Девушка ↔ Парень</label>
            </div>
          </section>

          <div className="actions">
            <button className="primary" onClick={() => setScreen(mode === "online" ? "room" : "round")}>Перейти к игре</button>
          </div>
        </>
      )}

      {screen === "room" && mode === "online" && (
        <>
          <section className="card">
            <h2>Комната</h2>
            <div className="grid">
              <label>API base<input value={apiBase} onChange={(e) => setApiBase(e.target.value)} /></label>
              <div className="status"><div><strong>API статус:</strong> {apiStatus}</div></div>
              <label>Bot username<input value={botUsername} onChange={(e) => setBotUsername(e.target.value)} /></label>
              <label>Создатель (Telegram id)<input value={createdBy} onChange={(e) => setCreatedBy(e.target.value)} /></label>
              <button className="primary" onClick={createRoom}>Создать комнату</button>
              <label>room_id<input value={roomId} onChange={(e) => setRoomId(e.target.value)} /></label>
              <label>group_id<input value={groupId} onChange={(e) => setGroupId(e.target.value)} /></label>
              <button className="ghost" onClick={bindGroup}>Привязать группу</button>
              {startGroupLink ? (
                <a className="link" href={startGroupLink} target="_blank" rel="noreferrer">Открыть ссылку привязки группы</a>
              ) : (
                <div className="muted">Ссылка привязки появится после room_id</div>
              )}
            </div>
            <div className="actions">
              <button className="ghost" onClick={syncPlayersToRoom}>Синхронизировать игроков</button>
              <button className="ghost" onClick={fetchRoomPlayers}>Загрузить игроков комнаты</button>
            </div>
          </section>

          <section className="card">
            <h2>Подтверждение</h2>
            <div className="actions">
              <button className="primary" onClick={createProof}>Сгенерировать proof_id</button>
              <button className="ghost" onClick={completeProof}>Симулировать подтверждение</button>
              <button className="ghost" onClick={fetchProof}>Обновить статус proof</button>
            </div>
            <div className="status">
              <div><strong>Proof ID:</strong> {proofId || "—"}</div>
              <div><strong>Последний раунд:</strong> {lastRoundId || "—"}</div>
              <div><strong>Статус:</strong> {proofStatus}</div>
              <div><strong>Голоса:</strong> {proofVotes.yes}:{proofVotes.no}</div>
              {chatLink ? (
                <a className="link" href={chatLink} target="_blank" rel="noreferrer">Открыть сообщение в группе</a>
              ) : (
                <div className="muted">Ссылка на чат появится после подтверждения</div>
              )}
            </div>
            <div className="actions">
              <button className="primary" onClick={() => vote("yes")}>Засчитать (dev)</button>
              <button className="ghost" onClick={() => vote("no")}>Не засчитать (dev)</button>
            </div>
          </section>
        </>
      )}

      {screen === "round" && (
        <>
          <section className="card play">
            <div className="play-head">
              <div>
                <h2>Игра</h2>
                <div className="meta">Активный набор: {activePackId || "—"}</div>
              </div>
              <div className="player-chip">
                Ходит сейчас: <strong>{players[currentPlayerIndex]?.name ?? "Игрок"}</strong>
              </div>
            </div>
            <div className="play-grid">
              <div className="play-card">
                <div className="options">
                  <button className={cardType === "truth" ? "pill active" : "pill"} onClick={() => setCardType("truth")}>Правда</button>
                  <button className={cardType === "dare" ? "pill active" : "pill"} onClick={() => setCardType("dare")}>Действие</button>
                  <button className="primary" onClick={pickCard}>Получить карточку</button>
                </div>
                <div className="card-preview">
                  {currentCard ? (
                    <div>
                      <div className="card-badge">{currentCard.type === "truth" ? "Правда" : "Действие"}</div>
                      <p className="card-text">{currentCard.text}</p>
                      <div className="meta">Уровень: {currentCard.level} • Набор: {currentCard.packId}</div>
                    </div>
                  ) : (
                    <div className="muted">Карточка появится здесь</div>
                  )}
                </div>
              </div>
              <div className="play-actions">
                {mode === "online" ? (
                  <div className="action-card">
                    <div className="action-title">Подтверждение</div>
                    <div className="muted">
                      В онлайн‑режиме можно отправить фото/видео через бота и получить голосование.
                    </div>
                    <div className="actions">
                      <button className="primary" onClick={createProof}>Подтвердить действием</button>
                      <button className="ghost" onClick={fetchProof}>Обновить статус</button>
                    </div>
                    <div className="status">
                      <div><strong>Proof ID:</strong> {proofId || "—"}</div>
                      <div><strong>Статус:</strong> {proofStatus}</div>
                      <div><strong>Голоса:</strong> {proofVotes.yes}:{proofVotes.no}</div>
                      {chatLink ? (
                        <a className="link" href={chatLink} target="_blank" rel="noreferrer">Открыть сообщение в группе</a>
                      ) : (
                        <a className="link" href={`https://t.me/${botUsername}`} target="_blank" rel="noreferrer">Открыть чат с ботом</a>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="action-card muted">
                    <div className="action-title">Подтверждение</div>
                    <div>Доступно в онлайн‑режиме.</div>
                  </div>
                )}
                <div className="action-card">
                  <div className="action-title">История</div>
                  <div className="muted">Тут видны прошлые ходы и статусы.</div>
                  <div className="actions">
                    {mode === "online" && (
                      <button className="ghost" onClick={fetchRoomRounds}>Загрузить историю комнаты</button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="card">
            <h2>История раунда</h2>
            <div className="actions">
              {mode === "online" && (
                <button className="ghost" onClick={fetchRoomRounds}>Загрузить историю комнаты</button>
              )}
            </div>
            {mode === "online" && roomRounds.length > 0 ? (
              <ul className="round-log">
                {roomRounds.map((entry) => (
                  <li key={entry.id}>
                    <strong>{entry.player}</strong> — {entry.cardType === "truth" ? "Правда" : "Действие"}: {entry.cardText}
                    <span className={`meta status-tag ${entry.status ?? ""}`}>
                      {entry.level} • {entry.packId}{entry.status ? ` • ${statusLabel(entry.status)}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            ) : roundLog.length === 0 ? (
              <div className="muted">Пока нет ходов</div>
            ) : (
              <ul className="round-log">
                {roundLog.map((entry) => (
                  <li key={entry.id}>
                    <strong>{entry.player}</strong> — {entry.cardType === "truth" ? "Правда" : "Действие"}: {entry.cardText}
                    <span className="meta">{entry.level} • {entry.packId}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      {screen === "catalog" && (
        <section className="card">
          <h2>Каталог наборов</h2>
          <div className="store">
            {visiblePacks.length === 0 ? (
              <div className="muted">Для выбранного режима нет доступных наборов.</div>
            ) : (
              visiblePacks.map((pack) => (
                <div key={pack.id} className="store-card">
                  <div className="store-title">{pack.title}</div>
                  <div className="store-sub">{pack.levels.join(" / ")}</div>
                  <div className="store-price">{pack.price}</div>
                  {ownedPacks.includes(pack.id) ? (
                    <button className="ghost" disabled>Уже куплено</button>
                  ) : (
                    <button className="primary" onClick={() => buyPack(pack.id)}>Купить (тест)</button>
                  )}
                </div>
              ))
            )}
          </div>
          <div className="actions">
            <button className="ghost" onClick={() => setScreen("lobby")}>Вернуться в лобби</button>
          </div>
        </section>
      )}

      {screen === "my-packs" && (
        <section className="card">
          <h2>Мои наборы</h2>
          <div className="store">
            {visiblePacks.filter((pack) => ownedPacks.includes(pack.id)).length === 0 ? (
              <div className="muted">Пока нет купленных наборов.</div>
            ) : (
              visiblePacks.filter((pack) => ownedPacks.includes(pack.id)).map((pack) => (
                <div key={pack.id} className="store-card">
                  <div className="store-title">{pack.title}</div>
                  <div className="store-sub">{pack.levels.join(" / ")}</div>
                  <div className="store-price">{pack.price}</div>
                  <button className="ghost" onClick={() => selectPack(pack.id)}>Выбрать</button>
                </div>
              ))
            )}
          </div>
          <div className="actions">
            <button className="ghost" onClick={() => setScreen("lobby")}>Вернуться в лобби</button>
          </div>
        </section>
      )}

      {isDev && screen === "dev" && (
        <section className="card dev">
          <h2>Dev лог</h2>
          <div className="actions">
            <button className="ghost" onClick={fetchPacks}>Обновить наборы из API</button>
            <button className="ghost" onClick={fetchPackCards}>Загрузить карточки набора</button>
            <button className="ghost" onClick={fetchAdminPacks}>Загрузить файлы паков</button>
            <button
              className="ghost"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(devLog.slice().reverse().join("\n"));
                  pushLog("Dev лог скопирован.");
                } catch (err) {
                  pushLog(`Не удалось скопировать лог: ${(err as Error).message}`);
                }
              }}
            >
              Скопировать лог
            </button>
          </div>
          <div className="grid">
            <label>Новый набор<input value={newPackTitle} onChange={(e) => setNewPackTitle(e.target.value)} /></label>
            <label>Уровни (через запятую)<input value={newPackLevels} onChange={(e) => setNewPackLevels(e.target.value)} /></label>
            <label>Цена<input value={newPackPrice} onChange={(e) => setNewPackPrice(e.target.value)} /></label>
            <button className="primary" onClick={createPack}>Создать набор</button>
          </div>
          <div className="grid">
            <label>Текст карточки<input value={newCardText} onChange={(e) => setNewCardText(e.target.value)} /></label>
            <label>Тип<select value={newCardType} onChange={(e) => setNewCardType(e.target.value as "truth" | "dare")}> <option value="truth">Правда</option><option value="dare">Действие</option></select></label>
            <label>Уровень<select value={newCardLevel} onChange={(e) => setNewCardLevel(e.target.value as Level)}>{LEVELS.map((item) => (<option key={item} value={item}>{item}</option>))}</select></label>
            <label>Таргет<select value={newCardTarget} onChange={(e) => setNewCardTarget(e.target.value as "none" | "m" | "f" | "any")}>
              <option value="none">Не нужен</option>
              <option value="any">Любой</option>
              <option value="f">Девушка</option>
              <option value="m">Парень</option>
            </select></label>
            <button className="ghost" onClick={createCard}>Создать карточку</button>
          </div>
          <div className="admin-files">
            <div className="admin-list">
              {adminPacks.length === 0 ? (
                <div className="muted">Файлов нет</div>
              ) : (
                adminPacks.map((item) => (
                  <div key={item.id} className="card-row">
                    <div><strong>{item.id}</strong> — {item.title}</div>
                    <div className="actions">
                      <button className="ghost" onClick={() => loadAdminPack(item.id)}>Открыть</button>
                      <button className="ghost" onClick={() => deleteAdminPack(item.id)}>Удалить</button>
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className="admin-editor">
              <label>JSON файла</label>
              <textarea value={packJson} onChange={(e) => setPackJson(e.target.value)} rows={16} />
              <div className="actions">
                <button className="ghost" onClick={createAdminPack}>Создать файл</button>
                <button className="primary" onClick={saveAdminPack}>Сохранить файл</button>
              </div>
            </div>
          </div>
          <div className="card-list">
            {packCards.length === 0 ? (
              <div className="muted">Карточек нет</div>
            ) : (
              packCards.map((card) => (
                <div key={card.id} className="card-row">
                  <div><strong>{card.type}</strong> • {card.level} — {card.text}</div>
                  <button className="ghost" onClick={() => deleteCard(card.id)}>Удалить</button>
                </div>
              ))
            )}
          </div>
          <div className="log">
            {devLog.length === 0 ? (
              <div className="muted">Пока пусто</div>
            ) : (
              <ul>
                {devLog.map((line, idx) => (
                  <li key={`${line}-${idx}`}>{line}</li>
                ))}
              </ul>
            )}
          </div>
        </section>
      )}

      {showAgeGate && (
        <div className="modal-backdrop">
          <div className="modal">
            <h3>Контент 18+</h3>
            <p>Подтвердите, что вам уже исполнилось 18 лет. Продолжая, вы берёте ответственность за контент.</p>
            <div className="actions">
              <button className="primary" onClick={confirmAge}>Мне 18+</button>
              <button className="ghost" onClick={denyAge}>Нет</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
