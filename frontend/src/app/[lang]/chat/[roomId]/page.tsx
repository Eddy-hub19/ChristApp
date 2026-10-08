"use client";

import ChatWindow from "@/components/ChatWindow/ChatWindow";
import styles from "./chatRoom.module.scss";
import MessageInput from "@/components/MessageInput/MessageInput";
import {
  isMessageFromCurrentUser,
  type AppReactionType,
  type Message,
  type MessageReply,
} from "@/types/message";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import createSocket from "socket.io-client";
import { useParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { getInitials } from "@/lib/utils";
import { resolvePublicAvatarUrl } from "@/lib/avatarUrl";
import { useAuth } from "@/hooks/useAuth";
import { AUTH_CHANGED_EVENT, getAuthToken } from "@/lib/auth";
import { ensureAccessToken } from "@/lib/authSession";
import { apiFetch } from "@/lib/apiFetch";
import { dispatchChatUnreadChangedEvent } from "@/lib/chatUnreadEvents";
import { dismissRoomNotificationsLocally } from "@/lib/chatRoomNotifications";
import { clearServerViewState } from "@/lib/viewStateBeacon";
import { attachPresenceReporter } from "@/lib/presenceReporter";
import { showChatNotification } from "@/lib/notifications";
import AvatarWithFallback from "@/components/AvatarWithFallback/AvatarWithFallback";
import { Link } from "@/i18n/navigation";
import Image from "next/image";
import {
  GLOBAL_ROOM_ID,
  GLOBAL_ROOM_SLUG,
  SHARE_WITH_JESUS_ROOM_PREFIX,
  SHARE_WITH_JESUS_SLUG,
} from "@/lib/chatRooms";
import { chatMessagePreview } from "@/lib/chatMessagePreview";
import {
  parseLegacyReplyPrefix,
  stripLegacyReplyPrefix,
} from "@/lib/legacyReplyPrefix";
import { buildStickerMessagePayload } from "@/lib/stickerMessage";
import { formatLastSeenRelative } from "@/lib/chatLastSeenFormat";
import { type StickerItem } from "@/components/StickerPicker/StickerPicker";
import {
  fetchOlderRoomMessages,
  fetchRoomMessagesOrThrow,
} from "@/lib/chatMessagesApi";
import { chatRoomHistoryQueryKey } from "@/lib/chatQueryKeys";
import { reconcileMessages } from "@/lib/chatReconcile";
import { readCachedMessages, writeCachedMessages } from "@/lib/chatMessageCache";
import {
  addRawVoiceListen,
  appendRawMessage,
  patchRawMessage,
  removeRawMessage,
  writeHistoryCache,
} from "@/lib/chatHistoryCache";
import { STALE } from "@/lib/queryPolicy";
import { getUserIdFromJwt } from "@/lib/jwtUser";
import { HISTORY_PAGE_SIZE } from "@/lib/chatHistoryPrefetch";

import {
  OutgoingTextQueue,
  createClientMessageId,
  integrateEcho,
  isOptimisticMessageId,
  optimisticMessageId,
  setDeliveryStatus,
} from "@/lib/chatOutgoing";
import { PendingReactions } from "@/lib/chatReactionsPending";
import { useDelayedFlag } from "@/hooks/useDelayedFlag";
import ChatSkeleton from "@/components/ChatSkeleton/ChatSkeleton";
import { chatMyRoomsQueryKey } from "@/lib/chatRoomsQuery";
import { useChatUploads } from "@/hooks/useChatUploads";
import type { RecordedVoice } from "@/hooks/useVoiceRecorder";
import { voiceDurationFromTimer } from "@/lib/voiceDuration";
import {
  MAX_ATTACHMENT_SIZE_BYTES,
  MAX_FILES_PER_PICK,
  classifyAttachment,
  voiceFileName,
} from "@/lib/chatMedia";
import { getDirectApiOrigin, getHttpApiBase } from "@/lib/apiBase";
import { checkBackendHealth } from "@/lib/backendHealth";
import {
  HISTORY_REQUEST_TIMEOUT_MS,
  HISTORY_STALLED_AFTER_MS,
  createHistoryRefetchGate,
  historyRetryDelay,
  isColdStartHistoryError,
  isTerminalHistoryError,
  shouldRetryHistory,
} from "@/lib/chatHistoryLoad";
import OnlineUsersDrawer from "@/components/OnlineUsersDrawer/OnlineUsersDrawer";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { useVideoRecorder } from "@/hooks/useVideoRecorder";
import { useKeyboardInset } from "@/hooks/useKeyboardInset";
import { focusChatComposer } from "@/lib/chatComposerFocus";
import VideoNoteScene from "@/components/VideoNoteScene/VideoNoteScene";
import { Gamepad2, Phone } from "lucide-react";
import dynamic from "next/dynamic";
import type { DoodleRuntimeState } from "@/components/DoodleMiniGame/DoodleMiniGame";
import type { SnakeRuntimeState } from "@/components/SnakeMiniGame/SnakeMiniGame";
import {
  useGameActivityBroadcast,
  useGameActivityFeed,
} from "@/hooks/useGameActivity";
import { isGameActivityRoom } from "@/lib/games/gameActivity";
import type { GameId } from "@/lib/games/gameRegistry";
/** Мини-игры тянем только при открытии (и монтируем только пока открыты) — чат без них не парсит их код. */
const DoodleMiniGame = dynamic(
  () => import("@/components/DoodleMiniGame/DoodleMiniGame"),
  { ssr: false },
);
const SnakeMiniGame = dynamic(
  () => import("@/components/SnakeMiniGame/SnakeMiniGame"),
  { ssr: false },
);
const ChristianFilwordMiniGame = dynamic(
  () =>
    import("@/components/ChristianFilwordMiniGame/ChristianFilwordMiniGame"),
  { ssr: false },
);
const GuessCharacterMiniGame = dynamic(
  () => import("@/components/GuessCharacterMiniGame/GuessCharacterMiniGame"),
  { ssr: false },
);
const PuzzleMiniGame = dynamic(
  () => import("@/components/PuzzleMiniGame/PuzzleMiniGame"),
  { ssr: false },
);
const CallScreen = dynamic(() => import("@/components/calls/CallScreen"), {
  ssr: false,
});
const IncomingCallModal = dynamic(
  () => import("@/components/calls/IncomingCallModal"),
  { ssr: false },
);
import {
  avatarLikesForUserQueryKey,
  avatarLikesMeQueryKey,
  fetchAvatarLikesForUser,
  optimisticAvatarLikeToggle,
  toggleAvatarLikeForUser,
  type AvatarLikesUserResponse,
} from "@/lib/queries/avatarLikesQueries";
import { canSeeAdminPanelNav } from "@/lib/adminDashboardNav";

const CHAT_SOCKET_URL = getDirectApiOrigin();
const CHAT_HTTP_API = getHttpApiBase();
const LAST_SENT_PREVIEW_STORAGE_KEY = "chat:last-sent-previews";
const MAX_REPLY_PREVIEW_LENGTH = 180;
type AppSocket = ReturnType<typeof createSocket>;

type IncomingSocketMessage = {
  id?: string | number;
  roomId?: string;
  content?: string;
  type?: string;
  fileUrl?: string;
  voiceDuration?: number | null;
  mediaWidth?: number | null;
  mediaHeight?: number | null;
  fileSize?: number | null;
  voiceListens?: Array<{ userId?: string }>;
  createdAt?: string | Date;
  username?: string;
  handle?: string;
  senderId?: string;
  sender?: {
    id?: string;
    username?: string;
    nickname?: string;
  };
  reactions?: Array<{
    id?: string;
    userId?: string;
    type?: string;
    createdAt?: string | Date;
  }>;
  isEdited?: boolean;
  clientMessageId?: string;
  replyTo?: {
    id?: string;
    deleted?: boolean;
    username?: string;
    type?: string;
    content?: string;
    fileUrl?: string | null;
    voiceDuration?: number | null;
  } | null;
};

type MyRoomItem = {
  id: string;
  title: string;
  createdAt: string;
  directPeer?: {
    id: string;
    username: string;
    nickname?: string | null;
    avatarUrl?: string | null;
  };
};

type DirectRoomOpenedPayload = {
  roomId: string;
  targetUserId: string;
  title?: string;
  targetUsername?: string;
};

type RoomHistoryPayload = {
  roomId: string;
  messages: IncomingSocketMessage[];
};

type OnlineUsersPayload = {
  userIds: string[];
  count?: number;
};

type UserPresencePayload = {
  userId: string;
  isOnline: boolean;
  lastSeenAt?: string | null;
};

type MessageDeletedSocketEvent = {
  messageId?: string;
  roomId?: string;
};

type DeleteMessageResultSocketEvent = {
  ok?: boolean;
  messageId?: string;
  roomId?: string;
  error?: string;
};

type MessageEditedSocketEvent = {
  messageId?: string;
  roomId?: string;
  content?: string;
  isEdited?: boolean;
};

type EditMessageResultSocketEvent = {
  ok?: boolean;
  messageId?: string;
  roomId?: string;
  error?: string;
};

type ShareWithJesusRoomIdResolvedPayload = {
  ok?: boolean;
  roomId?: string;
  roomTitle?: string;
  error?: string;
};

type UpdateMessageReactionsPayload = {
  messageId?: string;
  reactions?: Array<{
    id?: string;
    userId?: string;
    type?: string;
    createdAt?: string | Date;
  }>;
};

type RoomReadStatesPayload = {
  roomId?: string;
  readStates?: Array<{
    userId?: string;
    lastReadAt?: string | Date;
  }>;
};

type IncomingCallPayload = {
  channelName?: string;
  initiator?: {
    id?: string;
    name?: string;
    nickname?: string | null;
    username?: string;
    avatarUrl?: string | null;
  };
};

type CallAcceptedPayload = {
  channelName?: string;
};

type CallDeclinedPayload = {
  channelName?: string;
};

type CallUserSentPayload = {
  ok?: boolean;
  offline?: boolean;
  channelName?: string;
  targetUserId?: string;
};

type DoodleScoreUpdatedPayload = {
  roomId?: string;
  userId?: string;
  score?: number;
};

/** Авторитетний зріз партії з сервера: рахунки всіх учасників кімнати. */
type GameSessionPayload = {
  roomId?: string;
  game?: string;
  round?: number;
  startedAt?: number;
  scores?: Record<string, number>;
};

type DoodleResetPayload = {
  roomId?: string;
};

type DoodleStateUpdatedPayload = {
  roomId?: string;
  userId?: string;
  state?: DoodleRuntimeState;
};

type SnakeScoreUpdatedPayload = {
  roomId?: string;
  userId?: string;
  score?: number;
};

type SnakeResetPayload = {
  roomId?: string;
};

type SnakeStateUpdatedPayload = {
  roomId?: string;
  userId?: string;
  state?: SnakeRuntimeState;
};

function persistLastSentPreview(
  roomKey: string,
  message: string,
  directUserId?: string,
) {
  if (typeof window === "undefined") return;

  try {
    const rawValue = window.localStorage.getItem(LAST_SENT_PREVIEW_STORAGE_KEY);
    const parsed = rawValue
      ? (JSON.parse(rawValue) as Record<string, string>)
      : {};

    parsed[roomKey] = message;
    if (directUserId) {
      parsed[directUserId] = message;
    }

    window.localStorage.setItem(
      LAST_SENT_PREVIEW_STORAGE_KEY,
      JSON.stringify(parsed),
    );
  } catch {
    // ігноруємо помилки localStorage
  }
}

function normalizeReplyContent(content: string) {
  return content.replace(/\s+/g, " ").trim().slice(0, MAX_REPLY_PREVIEW_LENGTH);
}

function parseMessageWithReply(rawContent: string) {
  const { text, meta } = parseLegacyReplyPrefix(rawContent);
  return {
    content: text,
    replyTo: meta
      ? ({
          id: meta.id,
          username: meta.username,
          // Цитата теж могла бути збережена "брудною" — чистимо й її.
          content: normalizeReplyContent(stripLegacyReplyPrefix(meta.content)),
        } satisfies MessageReply)
      : (undefined as MessageReply | undefined),
  };
}

function areSetsEqual<T>(left: Set<T>, right: Set<T>) {
  if (left.size !== right.size) return false;

  for (const value of left) {
    if (!right.has(value)) {
      return false;
    }
  }

  return true;
}

function shouldShowBrowserNotification(isOwnMessage: boolean) {
  return (
    !isOwnMessage &&
    (document.visibilityState !== "visible" || !document.hasFocus())
  );
}

function normalizeRoomHistory(
  history: IncomingSocketMessage[] | undefined,
  currentUsername?: string,
) {
  const normalizedHistory = (history ?? []).map((messageItem) =>
    normalizeIncomingMessage(messageItem, currentUsername),
  );

  const nextMessageIds = new Set<string>();
  const uniqueHistory: Message[] = [];

  for (const messageItem of normalizedHistory) {
    if (nextMessageIds.has(messageItem.id)) {
      continue;
    }
    nextMessageIds.add(messageItem.id);
    uniqueHistory.push(messageItem);
  }

  return {
    uniqueHistory,
    nextMessageIds,
  };
}

function normalizeMessageType(raw: unknown): Message["type"] {
  const value = typeof raw === "string" ? raw.trim().toUpperCase() : "";
  return value === "TEXT" ||
    value === "VOICE" ||
    value === "IMAGE" ||
    value === "FILE" ||
    value === "VIDEO_NOTE"
    ? value
    : undefined;
}

function positiveNumber(value: number | null | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : undefined;
}

function normalizeIncomingMessage(
  raw: IncomingSocketMessage | null | undefined,
  currentUsername?: string,
): Message {
  const senderId = raw?.senderId ?? raw?.sender?.id;
  const handle = raw?.handle ?? raw?.sender?.username;
  const displayName =
    raw?.username ??
    raw?.sender?.nickname ??
    raw?.sender?.username ??
    "Unknown";
  const rawContent = String(raw?.content ?? "");
  // Нові відповіді приходять з БД (raw.replyTo); старі зберігали цитату префіксом у тексті.
  const legacy = parseMessageWithReply(rawContent);
  const content = legacy.content;
  const replyTo: MessageReply | undefined = raw?.replyTo?.id
    ? {
        id: String(raw.replyTo.id),
        username: String(raw.replyTo.username ?? ""),
        content: String(raw.replyTo.content ?? ""),
        type: normalizeMessageType(raw.replyTo.type),
        fileUrl: raw.replyTo.fileUrl ?? undefined,
        voiceDuration: raw.replyTo.voiceDuration ?? undefined,
        deleted: Boolean(raw.replyTo.deleted),
      }
    : legacy.replyTo;
  const type = normalizeMessageType(raw?.type);
  const fileUrl = raw?.fileUrl?.trim() ? raw.fileUrl.trim() : undefined;
  const reactions = (raw?.reactions ?? [])
    .map((reaction) => {
      if (!reaction?.id || !reaction.userId) return null;
      if (typeof reaction.type !== "string" || !reaction.type) return null;
      return {
        id: String(reaction.id),
        userId: String(reaction.userId),
        type: reaction.type as AppReactionType,
        createdAt: String(reaction.createdAt ?? new Date().toISOString()),
      };
    })
    .filter(Boolean) as Message["reactions"];

  const legacyMe =
    Boolean(currentUsername) &&
    !senderId &&
    !handle &&
    (displayName === currentUsername ||
      raw?.sender?.username === currentUsername);

  return {
    id: String(raw?.id ?? Date.now()),
    content,
    type,
    fileUrl,
    voiceDuration: positiveNumber(raw?.voiceDuration),
    mediaWidth: positiveNumber(raw?.mediaWidth),
    mediaHeight: positiveNumber(raw?.mediaHeight),
    fileSize: positiveNumber(raw?.fileSize),
    voiceListenedBy: raw?.voiceListens
      ?.map((listen) => listen?.userId)
      .filter((id): id is string => typeof id === "string"),
    createdAt: String(raw?.createdAt ?? new Date().toISOString()),
    username: displayName,
    handle,
    senderId,
    sender: legacyMe || handle === currentUsername ? "me" : undefined,
    replyTo,
    reactions,
    isEdited: Boolean(raw?.isEdited),
    clientMessageId:
      typeof raw?.clientMessageId === "string" && raw.clientMessageId
        ? raw.clientMessageId
        : undefined,
  };
}

type ChatRoomTitleLabels = {
  globalChatTitle: string;
  shareWithJesusTitle: string;
  directChatWith: (name: string) => string;
  chatFallback: string;
};

function getReadableRoomTitle(
  roomId: string | undefined,
  rawTitle: string | undefined,
  currentUserId: string | undefined,
  users: Array<{ id: string; username: string; nickname?: string }> | undefined,
  directPeer: { username: string; nickname?: string | null } | null | undefined,
  labels: ChatRoomTitleLabels,
) {
  if (roomId === GLOBAL_ROOM_ID) {
    return labels.globalChatTitle;
  }

  if (rawTitle?.startsWith(SHARE_WITH_JESUS_ROOM_PREFIX)) {
    return labels.shareWithJesusTitle;
  }

  if (!rawTitle?.trim()) {
    return directPeer
      ? labels.directChatWith(directPeer.nickname ?? directPeer.username)
      : labels.chatFallback;
  }

  if (rawTitle.startsWith("dm:")) {
    const directIds = rawTitle.split(":").slice(1);
    const otherUserId = directIds.find((id) => id !== currentUserId);
    const otherUser = users?.find(
      (existingUser) => existingUser.id === otherUserId,
    );
    if (otherUser) {
      return labels.directChatWith(otherUser.nickname ?? otherUser.username);
    }
    if (directPeer) {
      return labels.directChatWith(directPeer.nickname ?? directPeer.username);
    }
    return labels.chatFallback;
  }

  return rawTitle;
}

function findDirectRoomByUserId(
  rooms: MyRoomItem[],
  currentUserId: string | undefined,
  targetUserId: string,
) {
  if (!currentUserId || !targetUserId || currentUserId === targetUserId) {
    return undefined;
  }
  const [idA, idB] = [currentUserId, targetUserId].sort();
  const dmTitle = `dm:${idA}:${idB}`;
  return rooms.find((room) => room.title === dmTitle);
}

export default function ChatPageDetails() {
  const t = useTranslations("chat");
  const tGuess = useTranslations("guessCharacter");
  const tPuzzle = useTranslations("puzzle");
  const tShared = useTranslations("chatShared");
  const lang = useLocale();
  const { user, users, loading } = useAuth({ redirectIfUnauthenticated: "/" });
  const queryClient = useQueryClient();
  // Runtime refs потрібні для socket callbacks, щоб уникнути stale state усередині listeners.
  const socketRef = useRef<AppSocket | null>(null);
  const usersRef = useRef(users);
  const currentRoomRef = useRef<string | undefined>(undefined);
  const joinedRoomRef = useRef<string | undefined>(undefined);
  const availableRoomIdsRef = useRef<Set<string>>(new Set());
  const openingDirectRoomRef = useRef<Set<string>>(new Set());
  const messageIdsRef = useRef<Set<string>>(new Set());
  const lastMyRoomsEmitAtRef = useRef(0);
  /** true після joinRoom до приходу roomHistory (зокрема при skipLoadingSpinner). */
  const awaitingRoomHistoryRef = useRef(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const jumpToMessageRef = useRef<((messageId: string) => void) | null>(null);
  const [roomTitle, setRoomTitle] = useState<string>("");
  const [roomRawTitle, setRoomRawTitle] = useState<string>("");
  const [isSocketConnected, setIsSocketConnected] = useState(false);
  const [isHistoryLoading, setIsHistoryLoading] = useState(true);
  /** Свіжа історія вже прийшла (сокетом або запитом): помилка завантаження більше не актуальна. */
  const [historyDelivered, setHistoryDelivered] = useState(false);
  /** Бекенд не відповідає (мережа / таймаут / 502-504): фоново опитуємо /health, UI при цьому не змінюється. */
  const [historyColdFailing, setHistoryColdFailing] = useState(false);
  /** Минуло ~60 с, а повідомлень немає: під скелетоном з'являється тихий сірий рядок. */
  const [historyStalled, setHistoryStalled] = useState(false);
  /** Остання відповідь 401/403/404: лише для логів і health-опитування, не для UI. */
  const historyTerminalFailureRef = useRef(false);
  const historyErrorLoggedRef = useRef<string | null>(null);
  /** Скелетон з'являється лише якщо завантаження триває довше за ~300 мс: без спалахів на швидкій мережі. */
  const showSkeleton = useDelayedFlag(isHistoryLoading, 300);
  const [skeletonWasShown, setSkeletonWasShown] = useState(false);
  /** Свіжа історія з сервера вже застосована: кеш більше не має права перезаписувати список. */
  const historyAppliedRef = useRef(false);
  /** Лише фатальні випадки (немає токена). Обриви сокета не показуємо замість чату. */
  const [authError, setAuthError] = useState<string | null>(null);
  const [sendNotice, setSendNotice] = useState<string | null>(null);
  const [replyToMessage, setReplyToMessage] = useState<Message | null>(null);
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);
  const [isParticipantsDrawerOpen, setIsParticipantsDrawerOpen] =
    useState(false);
  const [onlineCount, setOnlineCount] = useState(0);
  const [onlineUserIds, setOnlineUserIds] = useState<Set<string>>(new Set());
  const [lastSeenByUserId, setLastSeenByUserId] = useState<Map<string, string>>(
    () => new Map(),
  );
  const [nowTs, setNowTs] = useState(() => Date.now());
  const [typingUsers, setTypingUsers] = useState<
    Map<string, { username: string; activity: "text" | "voice" }>
  >(() => new Map());
  const [peerLastReadAt, setPeerLastReadAt] = useState<string | null>(null);
  const [roomReadStatesByUserId, setRoomReadStatesByUserId] = useState<
    Map<string, string>
  >(() => new Map());
  const [isAvatarPreviewOpen, setIsAvatarPreviewOpen] = useState(false);
  const [isUserProfileOpen, setIsUserProfileOpen] = useState(false);
  /** Профіль користувача з аватара/списку (глобальний чат) — без миттєвого переходу в DM. */
  const [peekProfileUserId, setPeekProfileUserId] = useState<string | null>(
    null,
  );
  const [incomingCall, setIncomingCall] = useState<IncomingCallPayload | null>(
    null,
  );
  const [activeCall, setActiveCall] = useState<IncomingCallPayload | null>(
    null,
  );
  const [isCallOverlayVisible, setIsCallOverlayVisible] = useState(true);
  const [pendingOutgoingCall, setPendingOutgoingCall] =
    useState<IncomingCallPayload | null>(null);
  const [isDoodleOpen, setIsDoodleOpen] = useState(false);
  const [isSnakeOpen, setIsSnakeOpen] = useState(false);
  const [isFilwordOpen, setIsFilwordOpen] = useState(false);
  const [isGuessOpen, setIsGuessOpen] = useState(false);
  const [isPuzzleOpen, setIsPuzzleOpen] = useState(false);
  const [isGameMenuOpen, setIsGameMenuOpen] = useState(false);
  const [myDoodleScore, setMyDoodleScore] = useState(0);
  const [peerDoodleScore, setPeerDoodleScore] = useState(0);
  const [peerDoodleState, setPeerDoodleState] =
    useState<DoodleRuntimeState | null>(null);
  /** Реальный RTT до сервера (ack сокета), а не разница часов двух устройств. */
  const [gamePingMs, setGamePingMs] = useState<number | null>(null);
  // Режим Snake (Класика/Дуель) для статусу «грає у Snake»: від нього залежить, чи показувати «Приєднатися».
  const [snakeMode, setSnakeMode] = useState<"classic" | "duel" | null>(null);
  // Snake раніше сам скидав режим при закритті (open=false); тепер компонент розмонтовується, тож скидаємо тут.
  useEffect(() => {
    if (!isSnakeOpen) setSnakeMode(null);
  }, [isSnakeOpen]);
  const [mySnakeScore, setMySnakeScore] = useState(0);
  const [peerSnakeScore, setPeerSnakeScore] = useState(0);
  const [peerSnakeState, setPeerSnakeState] =
    useState<SnakeRuntimeState | null>(null);
  const [socketAuthEpoch, setSocketAuthEpoch] = useState(0);
  const userIdRef = useRef<string | undefined>(undefined);
  const pendingOutgoingCallRef = useRef<IncomingCallPayload | null>(null);
  const outgoingCallTimeoutRef = useRef<number | null>(null);
  const ringtoneIntervalRef = useRef<number | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const typingTextEmitRef = useRef(false);
  const typingVoiceEmitRef = useRef(false);

  const titleLabels = useMemo(
    (): ChatRoomTitleLabels => ({
      globalChatTitle: t("globalChatTitle"),
      shareWithJesusTitle: t("shareWithJesusTitle"),
      directChatWith: (name: string) => t("directChatWith", { name }),
      chatFallback: t("chatFallback"),
    }),
    [t],
  );
  const titleLabelsRef = useRef(titleLabels);
  useEffect(() => {
    titleLabelsRef.current = titleLabels;
  }, [titleLabels]);

  const roomI18nRef = useRef({
    noAuthToken: t("noAuthToken"),
    noTokenOrRoom: t("noTokenOrRoom"),
    notificationGlobal: (sender: string) => t("notificationGlobal", { sender }),
    notificationDirect: (name: string) => t("notificationDirect", { name }),
  });
  useEffect(() => {
    roomI18nRef.current = {
      noAuthToken: t("noAuthToken"),
      noTokenOrRoom: t("noTokenOrRoom"),
      notificationGlobal: (sender: string) =>
        t("notificationGlobal", { sender }),
      notificationDirect: (name: string) => t("notificationDirect", { name }),
    };
  }, [t]);

  const requestMyRooms = useCallback(
    (targetSocket: { emit: (event: string) => void } | null | undefined) => {
      if (!targetSocket) return;
      const now = Date.now();
      if (now - lastMyRoomsEmitAtRef.current < 350) {
        return;
      }
      lastMyRoomsEmitAtRef.current = now;
      targetSocket.emit("getMyRooms");
    },
    [],
  );

  // Поле введення має підніматися разом із клавіатурою (iOS не стискає layout viewport сам).
  useKeyboardInset();

  const params = useParams<{ roomId: string }>();
  const router = useRouter();
  const routeRoomId = params?.roomId;
  const roomId =
    routeRoomId === GLOBAL_ROOM_SLUG
      ? GLOBAL_ROOM_ID
      : routeRoomId === SHARE_WITH_JESUS_SLUG
        ? SHARE_WITH_JESUS_SLUG
        : routeRoomId;

  const [resolvedShareJesusRoomId, setResolvedShareJesusRoomId] = useState<
    string | null
  >(null);
  const [directRouteRoomId, setDirectRouteRoomId] = useState<string | null>(
    null,
  );
  const routeRoomIdRef = useRef(routeRoomId);
  useEffect(() => {
    routeRoomIdRef.current = routeRoomId;
  }, [routeRoomId]);
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setDirectRouteRoomId(null);
  }, [routeRoomId]);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    document.body.classList.add("chatRoomPage");
    return () => document.body.classList.remove("chatRoomPage");
  }, []);

  useEffect(() => {
    if (!isGameMenuOpen) {
      return;
    }

    const onCloseMenu = () => setIsGameMenuOpen(false);
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsGameMenuOpen(false);
      }
    };

    document.addEventListener("click", onCloseMenu);
    window.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("click", onCloseMenu);
      window.removeEventListener("keydown", onEscape);
    };
  }, [isGameMenuOpen]);

  /**
   * Приватний чат відкривають за id співрозмовника; справжній id кімнати раніше з'являвся лише після сокет-події
   * `myRooms`, і до того історія запитувалась за чужим id (зайвий 4xx-запит, кеш не потрапляв). Беремо його з уже
   * закешованого списку чатів (реактивно, без запиту) — історія з кешу показується з першого кадру.
   */
  const myIdForRoomLookup =
    user?.id ?? getUserIdFromJwt(getAuthToken() ?? "") ?? undefined;
  const { data: cachedDirectRoomId } = useQuery({
    queryKey: chatMyRoomsQueryKey(myIdForRoomLookup),
    queryFn: async () => [] as MyRoomItem[],
    enabled: false,
    staleTime: Infinity,
    placeholderData: undefined,
    select: (rooms: MyRoomItem[]) =>
      routeRoomId &&
      routeRoomId !== GLOBAL_ROOM_SLUG &&
      routeRoomId !== SHARE_WITH_JESUS_SLUG
        ? (findDirectRoomByUserId(rooms, myIdForRoomLookup, routeRoomId)?.id ??
          null)
        : null,
  });

  const effectiveSocketRoomId = useMemo(() => {
    if (!routeRoomId) return null;
    if (routeRoomId === GLOBAL_ROOM_SLUG) return GLOBAL_ROOM_ID;
    if (routeRoomId === SHARE_WITH_JESUS_SLUG) return resolvedShareJesusRoomId;
    return directRouteRoomId ?? cachedDirectRoomId ?? routeRoomId;
  }, [
    directRouteRoomId,
    cachedDirectRoomId,
    routeRoomId,
    resolvedShareJesusRoomId,
  ]);

  const roomHistoryQuery = useQuery({
    queryKey: chatRoomHistoryQueryKey(effectiveSocketRoomId),
    enabled: Boolean(user?.id && effectiveSocketRoomId),
    /** Інакше глобальний placeholderData підставляє історію попередньої кімнати під час зміни чату. */
    placeholderData: undefined,
    queryFn: async () => {
      const token = getAuthToken();
      if (!token || !effectiveSocketRoomId) {
        throw new Error(t("noTokenOrRoom"));
      }
      try {
        const result = await fetchRoomMessagesOrThrow({
          token,
          roomId: effectiveSocketRoomId,
          limit: HISTORY_PAGE_SIZE,
          skip: 0,
          timeoutMs: HISTORY_REQUEST_TIMEOUT_MS,
        });
        historyTerminalFailureRef.current = false;
        setHistoryColdFailing(false);
        return result;
      } catch (error) {
        historyTerminalFailureRef.current = isTerminalHistoryError(error);
        setHistoryColdFailing(isColdStartHistoryError(error));
        if (historyTerminalFailureRef.current) {
          // Одна зрозуміла помилка в консолі замість серії однакових.
          const status = (error as { status?: number }).status;
          const key = `${effectiveSocketRoomId}:${status}`;
          if (historyErrorLoggedRef.current !== key) {
            historyErrorLoggedRef.current = key;
            console.error(
              `[chat] History request for room ${effectiveSocketRoomId} was rejected (${status}).`,
            );
          }
        }
        throw error;
      }
    },
    /** Повтори й помилки тихі: компонент не перерисовується, поки не з'явились дані. */
    notifyOnChangeProps: ["data", "isPlaceholderData"],
    /** Історію ведуть події сокета (дзеркало в кеші пишемо при виході з кімнати), тож вона довго лишається свіжою. */
    staleTime: STALE.live,
    /** Холодний старт бекенду (30–60 с): довгі повтори з наростаючою паузою замість миттєвої помилки. */
    retry: shouldRetryHistory,
    retryDelay: historyRetryDelay,
    /** Без цього офлайн-запит «паузиться» назавжди й не дає ні даних, ні помилки. */
    networkMode: "always",
  });

  // Пинг игры: круговой путь до сервера через ack сокета; пока измерения нет (или сервер не ответил) — «—».
  const isGameOpen = isDoodleOpen || isSnakeOpen;

  // «Грає в …»: свій статус шлемо, поки відкрита гра; чужі приходять з сервера (у загальному чаті — ні).
  const openGameId: GameId | null = isDoodleOpen
    ? "doodle"
    : isSnakeOpen
      ? "snake"
      : isFilwordOpen
        ? "filword"
        : isGuessOpen
          ? "guess"
          : isPuzzleOpen
            ? "puzzle"
            : null;
  // eslint-disable-next-line react-hooks/refs -- як і для ігор нижче: підписуємось на поточний живий сокет кімнати
  const activitySocket = isSocketConnected ? socketRef.current : null;
  useGameActivityBroadcast(
    activitySocket,
    effectiveSocketRoomId,
    openGameId,
    openGameId === "snake" ? snakeMode : null,
  );
  const gameActivityByRoom = useGameActivityFeed(activitySocket, user?.id);
  useEffect(() => {
    if (!isGameOpen || !isSocketConnected) {
      setGamePingMs(null);
      return;
    }
    let cancelled = false;
    const measure = () => {
      const socket = socketRef.current;
      if (!socket?.connected) return;
      const startedAt = performance.now();
      let settled = false;
      // Без ответа сервера (старый бэкенд, обрыв) показываем «—», а не устаревшее число.
      const giveUp = window.setTimeout(() => {
        if (settled || cancelled) return;
        settled = true;
        setGamePingMs(null);
      }, 4000);
      socket.emit("latency-ping", () => {
        window.clearTimeout(giveUp);
        if (settled || cancelled) return;
        settled = true;
        setGamePingMs(Math.max(1, Math.round(performance.now() - startedAt)));
      });
    };
    measure();
    const timer = window.setInterval(measure, 3000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [isGameOpen, isSocketConnected]);

  const markRoomAsRead = useCallback(() => {
    const target = effectiveSocketRoomId;
    if (!target) return;

    const socket = socketRef.current;
    if (!socket || !socket.connected) return;

    if (document.visibilityState !== "visible") {
      return;
    }

    socket.emit("markRoomRead", { roomId: target });
    dispatchChatUnreadChangedEvent();
    // Прочитане — сповіщення цієї кімнати більше не потрібні у шторці.
    void dismissRoomNotificationsLocally(target);
  }, [effectiveSocketRoomId]);

  const handleTypingActivity = useCallback((active: boolean) => {
    const socket = socketRef.current;
    const joinedId = joinedRoomRef.current;
    if (!socket?.connected || !joinedId) return;
    if (typingTextEmitRef.current === active) return;
    typingTextEmitRef.current = active;
    socket.emit("roomTyping", {
      roomId: joinedId,
      isTyping: active,
      activity: "text",
    });
  }, []);

  const handleVoiceRecordingActivity = useCallback((active: boolean) => {
    const socket = socketRef.current;
    const joinedId = joinedRoomRef.current;
    if (!socket?.connected || !joinedId) return;
    if (typingVoiceEmitRef.current === active) return;
    typingVoiceEmitRef.current = active;
    socket.emit("roomTyping", {
      roomId: joinedId,
      isTyping: active,
      activity: "voice",
    });
  }, []);

  const joinRoom = useCallback(
    (
      socket: AppSocket,
      targetRoomId: string,
      opts?: { skipLoadingSpinner?: boolean },
    ) => {
      if (joinedRoomRef.current === targetRoomId) {
        return;
      }

      if (!opts?.skipLoadingSpinner) {
        setIsHistoryLoading(true);
      }
      awaitingRoomHistoryRef.current = true;
      socket.emit("joinRoom", {
        roomId: targetRoomId,
        limit: HISTORY_PAGE_SIZE,
        skip: 0,
      });
      joinedRoomRef.current = targetRoomId;
    },
    [],
  );

  const leaveCurrentRoom = useCallback((socket: AppSocket) => {
    const joinedRoomId = joinedRoomRef.current;
    if (!joinedRoomId) {
      return;
    }

    if (typingTextEmitRef.current) {
      typingTextEmitRef.current = false;
      socket.emit("roomTyping", {
        roomId: joinedRoomId,
        isTyping: false,
        activity: "text",
      });
    }
    if (typingVoiceEmitRef.current) {
      typingVoiceEmitRef.current = false;
      socket.emit("roomTyping", {
        roomId: joinedRoomId,
        isTyping: false,
        activity: "voice",
      });
    }

    socket.emit("leaveRoom", joinedRoomId);
    joinedRoomRef.current = undefined;
  }, []);

  useEffect(() => {
    usersRef.current = users;
  }, [users]);

  useEffect(() => {
    userIdRef.current = user?.id;
  }, [user?.id]);

  useEffect(() => {
    pendingOutgoingCallRef.current = pendingOutgoingCall;
  }, [pendingOutgoingCall]);

  useEffect(() => {
    const onAuthChanged = () => setSocketAuthEpoch((value) => value + 1);
    window.addEventListener(AUTH_CHANGED_EVENT, onAuthChanged);
    return () => window.removeEventListener(AUTH_CHANGED_EVENT, onAuthChanged);
  }, []);

  const stopIncomingRingtone = useCallback(() => {
    if (ringtoneIntervalRef.current !== null) {
      window.clearInterval(ringtoneIntervalRef.current);
      ringtoneIntervalRef.current = null;
    }
    if (audioCtxRef.current) {
      void audioCtxRef.current.close();
      audioCtxRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!incomingCall) {
      stopIncomingRingtone();
      return;
    }

    const playSingleRing = () => {
      try {
        const AudioContextCtor =
          window.AudioContext ||
          (
            window as typeof window & {
              webkitAudioContext?: typeof AudioContext;
            }
          ).webkitAudioContext;
        if (!AudioContextCtor) {
          return;
        }
        if (!audioCtxRef.current) {
          audioCtxRef.current = new AudioContextCtor();
        }
        const ctx = audioCtxRef.current;
        if (ctx.state === "suspended") {
          void ctx.resume();
        }
        const oscillator = ctx.createOscillator();
        const gain = ctx.createGain();
        oscillator.type = "sine";
        oscillator.frequency.setValueAtTime(880, ctx.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(
          660,
          ctx.currentTime + 0.32,
        );
        gain.gain.setValueAtTime(0.0001, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.36);
        oscillator.connect(gain);
        gain.connect(ctx.destination);
        oscillator.start(ctx.currentTime);
        oscillator.stop(ctx.currentTime + 0.38);
      } catch {
        // ignore ringtone errors in browsers without audio support
      }
    };

    playSingleRing();
    ringtoneIntervalRef.current = window.setInterval(playSingleRing, 1300);
    return () => stopIncomingRingtone();
  }, [incomingCall, stopIncomingRingtone]);

  /**
   * Сирий список повідомлень кімнати для кешу RQ. Сокет-події застосовуємо до нього через ref (без перемальовування
   * сторінки на кожне повідомлення), а в `setQueryData` пишемо при виході з кімнати — повторний вхід показує
   * актуальну історію з кешу без запиту всієї історії.
   */
  const rawHistoryRef = useRef<IncomingSocketMessage[]>([]);
  /**
   * Надіслані тексти, що чекають ехо сервера: показуємо одразу (тимчасовий id `tmp-<clientMessageId>`). Ехо замінює
   * саме цю «бульбашку» за clientMessageId навіть після таймауту; без ехо за 12 с вона стає «Не надіслано» з
   * «Повторити» (повтор з тим самим id — сервер дубль не створює).
   */
  const [outgoing] = useState(
    () =>
      new OutgoingTextQueue((clientMessageId, status) =>
        setMessages((prev) => setDeliveryStatus(prev, clientMessageId, status)),
      ),
  );
  /**
   * Оптимістичні реакції. Відкат — лише за явною помилкою сервера (`reactionError`) або якщо після перепідключення
   * сервер так і не підтвердив; затримане ехо реакцію не скасовує.
   */
  const [pendingReactions] = useState(
    () =>
      new PendingReactions<NonNullable<Message["reactions"]>>(
        (messageId, previous) => {
          rawHistoryRef.current = patchRawMessage(
            rawHistoryRef.current,
            messageId,
            { reactions: previous },
          );
          setMessages((prev) =>
            prev.map((item) =>
              item.id === messageId ? { ...item, reactions: previous } : item,
            ),
          );
        },
      ),
  );
  useEffect(() => {
    return () => {
      outgoing.clear();
      pendingReactions.clear();
    };
  }, [effectiveSocketRoomId, outgoing, pendingReactions]);

  /**
   * Звіряє показаний список (кеш або попередня версія) зі свіжою історією сервера: видалені зникають,
   * відредаговані й реакції оновлюються, нові додаються — без перемальовування незмінених повідомлень.
   */
  const applyServerHistory = useCallback(
    (fresh: Message[]) => {
    historyAppliedRef.current = true;
    setHistoryDelivered(true);
    // Історія вже містить наші відправки (за clientMessageId) — їх більше не чекаємо.
    for (const item of fresh) {
      if (item.clientMessageId) outgoing.confirm(item.clientMessageId);
    }
    setMessages((prev) => {
      const next = reconcileMessages(prev, fresh);
      messageIdsRef.current = new Set(next.map((item) => item.id));
      return next;
    });
    },
    [outgoing],
  );

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setMessages([]);
    messageIdsRef.current = new Set();
    historyAppliedRef.current = false;
    setHistoryDelivered(false);
    setSkeletonWasShown(false);
    awaitingRoomHistoryRef.current = false;
    setReplyToMessage(null);
    setEditingMessage(null);
    setResolvedShareJesusRoomId(null);
    if (routeRoomId === SHARE_WITH_JESUS_SLUG && user) {
      setRoomTitle(t("shareWithJesusTitle"));
      setRoomRawTitle(`${SHARE_WITH_JESUS_ROOM_PREFIX}${user.id}`);
      setIsHistoryLoading(false);
    } else {
      setRoomTitle("");
      setRoomRawTitle("");
      setIsHistoryLoading(true);
    }
  }, [roomId, routeRoomId, t, user]);

  useEffect(() => {
    if (!roomHistoryQuery.data || !effectiveSocketRoomId) {
      return;
    }
    if (roomHistoryQuery.isPlaceholderData) {
      return;
    }

    rawHistoryRef.current = roomHistoryQuery.data as IncomingSocketMessage[];
    const { uniqueHistory } = normalizeRoomHistory(
      roomHistoryQuery.data as IncomingSocketMessage[],
      user?.username,
    );

    applyServerHistory(uniqueHistory);
    setIsHistoryLoading(false);
    awaitingRoomHistoryRef.current = false;
  }, [
    applyServerHistory,
    effectiveSocketRoomId,
    roomHistoryQuery.data,
    roomHistoryQuery.isPlaceholderData,
    user?.username,
  ]);

  // Миттєвий показ: останні повідомлення з IndexedDB, поки свіжа історія ще в дорозі.
  useEffect(() => {
    // id з JWT доступний одразу, без очікування GET /auth/me: кеш показується на першому ж кадрі.
    const userId = user?.id ?? getUserIdFromJwt(getAuthToken() ?? "");
    if (!userId || !effectiveSocketRoomId) return;
    let cancelled = false;
    void readCachedMessages<Message>(userId, effectiveSocketRoomId).then((cached) => {
      if (cancelled || historyAppliedRef.current || !cached?.length) return;
      messageIdsRef.current = new Set(cached.map((item) => item.id));
      setMessages(cached);
      setIsHistoryLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [roomId, routeRoomId, t, user, effectiveSocketRoomId]);

  // Після звірки з сервером (і далі — при кожній зміні) перезаписуємо кеш останніх повідомлень.
  useEffect(() => {
    const userId = user?.id;
    if (!userId || !effectiveSocketRoomId || !historyAppliedRef.current) return;
    const timer = window.setTimeout(() => {
      void writeCachedMessages(
        userId,
        effectiveSocketRoomId,
        messages.filter((item) => !isOptimisticMessageId(item.id)),
      );
    }, 600);
    return () => window.clearTimeout(timer);
  }, [messages, user?.id, effectiveSocketRoomId]);

  useEffect(() => {
    if (showSkeleton) setSkeletonWasShown(true);
  }, [showSkeleton]);

  useEffect(() => {
    const cachedRoomId = effectiveSocketRoomId;
    return () => {
      if (cachedRoomId && rawHistoryRef.current.length > 0) {
        writeHistoryCache(queryClient, cachedRoomId, rawHistoryRef.current);
      }
      rawHistoryRef.current = [];
    };
  }, [effectiveSocketRoomId, queryClient]);

  const refetchHistoryRef = useRef(roomHistoryQuery.refetch);
  useEffect(() => {
    refetchHistoryRef.current = roomHistoryQuery.refetch;
  });
  /** Не частіше разу за кілька секунд, скільки б подій (connect/visibility/online) не прийшло. */
  const historyRefetchGateRef = useRef(createHistoryRefetchGate());

  // Бекенд прокидається: поки health-check не проходить, опитуємо його й одразу перезапускаємо історію, щойно він ожив.
  useEffect(() => {
    if (!historyColdFailing || historyDelivered || !effectiveSocketRoomId) return;
    let cancelled = false;
    let timer: number | null = null;
    const poll = async () => {
      const alive = await checkBackendHealth(getHttpApiBase(), 6000);
      if (cancelled) return;
      if (alive) {
        if (!historyAppliedRef.current && historyRefetchGateRef.current()) {
          void refetchHistoryRef.current();
        }
        return;
      }
      timer = window.setTimeout(() => void poll(), 3000);
    };
    void poll();
    return () => {
      cancelled = true;
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [historyColdFailing, historyDelivered, effectiveSocketRoomId]);

  // Мережа повернулась / застосунок знову на екрані / сокет перепідключився — догружаємо історію самі
  // (в тому числі після 401/403/404, але не частіше разу за кілька секунд, без циклу).
  useEffect(() => {
    const retryIfMissing = () => {
      if (document.visibilityState === "hidden") return;
      if (historyAppliedRef.current || !effectiveSocketRoomId || !user?.id) return;
      if (!historyRefetchGateRef.current()) return;
      void refetchHistoryRef.current();
    };
    window.addEventListener("online", retryIfMissing);
    document.addEventListener("visibilitychange", retryIfMissing);
    return () => {
      window.removeEventListener("online", retryIfMissing);
      document.removeEventListener("visibilitychange", retryIfMissing);
    };
  }, [effectiveSocketRoomId, user?.id]);

  useEffect(() => {
    if (!isSocketConnected || historyAppliedRef.current) return;
    if (!effectiveSocketRoomId || !user?.id) return;
    if (!historyRefetchGateRef.current()) return;
    void refetchHistoryRef.current();
  }, [isSocketConnected, effectiveSocketRoomId, user?.id]);

  // ~60 с без повідомлень: під скелетоном з'являється тихий рядок «потягніть вниз або торкніться».
  const hasAnyMessages = messages.length > 0;
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHistoryStalled(false);
    if (!effectiveSocketRoomId || historyDelivered || hasAnyMessages) return;
    const timer = window.setTimeout(() => setHistoryStalled(true), HISTORY_STALLED_AFTER_MS);
    return () => window.clearTimeout(timer);
  }, [effectiveSocketRoomId, historyDelivered, hasAnyMessages]);

  /** Ручне оновлення зі скелетона (тап / pull-down): і HTTP-запит, і повторне приєднання до кімнати сокета. */
  const handleManualHistoryRefresh = useCallback(() => {
    void refetchHistoryRef.current();
    const socket = socketRef.current;
    if (socket?.connected && effectiveSocketRoomId) {
      joinedRoomRef.current = undefined;
      joinRoom(socket, effectiveSocketRoomId, { skipLoadingSpinner: true });
    }
  }, [effectiveSocketRoomId, joinRoom]);

  useEffect(() => {
    setTypingUsers(new Map());
    typingTextEmitRef.current = false;
    typingVoiceEmitRef.current = false;
    setPeerLastReadAt(null);
    setLastSeenByUserId(new Map());
    setRoomReadStatesByUserId(new Map());
    setIsAvatarPreviewOpen(false);
    setIsUserProfileOpen(false);
    setIsDoodleOpen(false);
    setIsGuessOpen(false);
    setIsPuzzleOpen(false);
    setMyDoodleScore(0);
    setPeerDoodleScore(0);
    setPeerDoodleState(null);
  }, [roomId, routeRoomId, effectiveSocketRoomId]);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    const tickId = window.setInterval(() => {
      setNowTs(Date.now());
    }, 1000);
    return () => window.clearInterval(tickId);
  }, []);

  useEffect(() => {
    currentRoomRef.current = effectiveSocketRoomId ?? undefined;
  }, [effectiveSocketRoomId]);

  useEffect(() => {
    if (loading || !user || !roomId) return;

    if (roomId === user.id) {
      router.replace(`/chat/${GLOBAL_ROOM_SLUG}`);
    }
  }, [loading, user, roomId, router]);

  // Повний життєвий цикл socket: connect/disconnect, історія, нові повідомлення, presence.
  useEffect(() => {
    if (loading) return;

    if (socketRef.current) {
      return;
    }

    const token = getAuthToken();
    if (!token) {
      void ensureAccessToken()
        .then(() => setSocketAuthEpoch((value) => value + 1))
        .catch(() => {
          setAuthError(roomI18nRef.current.noAuthToken);
          setIsHistoryLoading(false);
        });
      return;
    }

    const socket = createSocket(CHAT_SOCKET_URL, {
      auth: { token },
      transports: ["websocket"],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 400,
      reconnectionDelayMax: 4000,
      randomizationFactor: 0.35,
    });

    socketRef.current = socket;
    // «Онлайн» = застосунок видно, а не «сокет підключений» — див. presenceReporter.
    const detachPresence = attachPresenceReporter(socket);

    const onConnect = () => {
      setIsSocketConnected(true);
      setAuthError(null);
      setSendNotice(null);
      // Реакції, що чекали ехо до обриву: чекаємо свіжу історію / ехо, інакше відкат (див. PendingReactions).
      pendingReactions.onReconnect();

      const rr = routeRoomIdRef.current;
      if (rr === GLOBAL_ROOM_SLUG) {
        joinRoom(socket, GLOBAL_ROOM_ID);
      }

      const cachedRooms = queryClient.getQueryData<MyRoomItem[]>(
        chatMyRoomsQueryKey(user?.id),
      );
      if (
        cachedRooms?.length &&
        rr &&
        rr !== GLOBAL_ROOM_SLUG &&
        rr !== SHARE_WITH_JESUS_SLUG
      ) {
        const directRoom = findDirectRoomByUserId(cachedRooms, user?.id, rr);
        if (directRoom) {
          joinRoom(socket, directRoom.id);
          setRoomRawTitle(directRoom.title);
          setRoomTitle(
            getReadableRoomTitle(
              directRoom.id,
              directRoom.title,
              user?.id,
              usersRef.current,
              directRoom.directPeer,
              titleLabelsRef.current,
            ),
          );
        }
      }

      requestMyRooms(socket);
    };
    socket.on("connect", onConnect);

    const onDisconnect = () => {
      setIsSocketConnected(false);
      setIsHistoryLoading((prev) => awaitingRoomHistoryRef.current || prev);
      setOnlineCount(0);
      setOnlineUserIds(new Set());
      setLastSeenByUserId(new Map());
      setRoomReadStatesByUserId(new Map());
      setTypingUsers(new Map());
      typingTextEmitRef.current = false;
      typingVoiceEmitRef.current = false;
      joinedRoomRef.current = undefined;
    };
    socket.on("disconnect", onDisconnect);

    const onSocketError = () => {
      setIsHistoryLoading((prev) => awaitingRoomHistoryRef.current || prev);
    };
    socket.on("connect_error", onSocketError);
    socket.on("error", onSocketError);

    const onNewMessage = (msg: IncomingSocketMessage) => {
      const joinedId = joinedRoomRef.current;
      if (joinedId && msg.roomId && msg.roomId !== joinedId) {
        return;
      }

      const normalized = normalizeIncomingMessage(msg, user?.username);
      const previewLine = chatMessagePreview(
        {
          content: normalized.content,
          type: normalized.type,
          fileUrl: normalized.fileUrl,
        },
        tShared,
      );
      if (!previewLine.trim()) {
        return;
      }

      if (messageIdsRef.current.has(normalized.id)) {
        return;
      }

      messageIdsRef.current.add(normalized.id);
      rawHistoryRef.current = appendRawMessage(rawHistoryRef.current, msg);

      if (joinedId && previewLine.trim()) {
        persistLastSentPreview(joinedId, previewLine);
      }

      const isOwnMessage = isMessageFromCurrentUser(normalized, user);
      const shouldShowNotification =
        shouldShowBrowserNotification(isOwnMessage);

      if (shouldShowNotification && joinedId) {
        const targetUrl =
          joinedId === GLOBAL_ROOM_ID
            ? `/chat/${GLOBAL_ROOM_SLUG}`
            : `/chat/${joinedId}`;
        const i18n = roomI18nRef.current;
        const notificationTitle =
          joinedId === GLOBAL_ROOM_ID
            ? i18n.notificationGlobal(normalized.username)
            : i18n.notificationDirect(normalized.username);

        void showChatNotification({
          title: notificationTitle,
          body: previewLine,
          targetUrl,
          tag: `room-${joinedId}`,
        });
      }

      setTypingUsers((prev) => {
        const next = new Map(prev);
        if (normalized.senderId) {
          next.delete(normalized.senderId);
        }
        return next;
      });

      // Ехо за clientMessageId замінює саме свою «бульбашку» (навіть запізніле); ехо без id — за текстом.
      const confirmed = outgoing.confirm(
        normalized.clientMessageId,
        isOwnMessage ? normalized.content.trim() : undefined,
      );
      setMessages((prev) =>
        integrateEcho(prev, normalized, confirmed?.clientMessageId),
      );
      dispatchChatUnreadChangedEvent();
    };
    socket.on("newMessage", onNewMessage);

    const onVoiceListened = (payload: {
      messageId?: string;
      userId?: string;
    }) => {
      const { messageId, userId } = payload ?? {};
      if (!messageId || !userId) return;
      rawHistoryRef.current = addRawVoiceListen(
        rawHistoryRef.current,
        messageId,
        userId,
      );
      setMessages((prev) =>
        prev.map((message) =>
          message.id === messageId && !message.voiceListenedBy?.includes(userId)
            ? {
                ...message,
                voiceListenedBy: [...(message.voiceListenedBy ?? []), userId],
              }
            : message,
        ),
      );
    };
    socket.on("voiceListened", onVoiceListened);

    const onMessageDeleted = (payload: MessageDeletedSocketEvent) => {
      const deletedMessageId = payload?.messageId;
      const deletedRoomId = payload?.roomId;
      const joinedId = joinedRoomRef.current;

      if (
        !deletedMessageId ||
        !deletedRoomId ||
        !joinedId ||
        deletedRoomId !== joinedId
      ) {
        return;
      }

      messageIdsRef.current.delete(deletedMessageId);
      rawHistoryRef.current = removeRawMessage(
        rawHistoryRef.current,
        deletedMessageId,
      );

      setMessages((prev) =>
        prev
          .filter((messageItem) => messageItem.id !== deletedMessageId)
          .map((messageItem) =>
            messageItem.replyTo?.id === deletedMessageId
              ? {
                  ...messageItem,
                  replyTo: { ...messageItem.replyTo, deleted: true },
                }
              : messageItem,
          ),
      );

      setReplyToMessage((prev) =>
        prev?.id === deletedMessageId ? null : prev,
      );
      setEditingMessage((prev) =>
        prev?.id === deletedMessageId ? null : prev,
      );
      dispatchChatUnreadChangedEvent();
    };
    socket.on("messageDeleted", onMessageDeleted);

    const onDeleteMessageResult = (payload: DeleteMessageResultSocketEvent) => {
      if (!payload || payload.ok !== false || !payload.error) {
        return;
      }

      window.alert(payload.error);
    };
    socket.on("deleteMessageResult", onDeleteMessageResult);

    const onMessageEdited = (payload: MessageEditedSocketEvent) => {
      const editedMessageId = payload?.messageId;
      const editedRoomId = payload?.roomId;
      const nextContent = payload?.content?.trim();
      const joinedId = joinedRoomRef.current;
      if (
        !editedMessageId ||
        !editedRoomId ||
        !joinedId ||
        editedRoomId !== joinedId ||
        !nextContent
      ) {
        return;
      }

      rawHistoryRef.current = patchRawMessage(
        rawHistoryRef.current,
        editedMessageId,
        { content: nextContent, isEdited: payload?.isEdited !== false },
      );
      setMessages((prev) =>
        prev.map((messageItem) =>
          messageItem.id === editedMessageId
            ? {
                ...messageItem,
                content: nextContent,
                isEdited: payload?.isEdited !== false,
              }
            : messageItem,
        ),
      );

      setEditingMessage((prev) =>
        prev?.id === editedMessageId
          ? {
              ...prev,
              content: nextContent,
              isEdited: payload?.isEdited !== false,
            }
          : prev,
      );
    };
    socket.on("messageEdited", onMessageEdited);

    const onRoomHistory = ({
      roomId: historyRoomId,
      messages: history,
    }: RoomHistoryPayload) => {
      if (historyRoomId !== joinedRoomRef.current) {
        return;
      }

      awaitingRoomHistoryRef.current = false;

      const { uniqueHistory } = normalizeRoomHistory(history, user?.username);

      const lastMessage = uniqueHistory[uniqueHistory.length - 1];
      if (historyRoomId && lastMessage) {
        const historyPreview = chatMessagePreview(
          {
            content: lastMessage.content,
            type: lastMessage.type,
            fileUrl: lastMessage.fileUrl,
          },
          tShared,
        );
        if (historyPreview.trim()) {
          persistLastSentPreview(historyRoomId, historyPreview);
        }
      }

      rawHistoryRef.current = history;
      // Авторитетна історія вже містить справжні реакції — очікування підтвердження знімається без відкату.
      pendingReactions.onHistoryResynced();
      applyServerHistory(uniqueHistory);
      setIsHistoryLoading(false);
      void queryClient.setQueryData(
        chatRoomHistoryQueryKey(historyRoomId),
        history,
      );
    };
    socket.on("roomHistory", onRoomHistory);

    const onMyRooms = ({ rooms }: { rooms: MyRoomItem[] }) => {
      queryClient.setQueryData(chatMyRoomsQueryKey(user?.id), rooms);
      availableRoomIdsRef.current = new Set(rooms.map((room) => room.id));

      const rr = routeRoomIdRef.current;
      const uid = user?.id;

      const shareRoom = uid
        ? rooms.find(
            (room) => room.title === `${SHARE_WITH_JESUS_ROOM_PREFIX}${uid}`,
          )
        : undefined;

      if (shareRoom && (rr === SHARE_WITH_JESUS_SLUG || rr === shareRoom.id)) {
        setResolvedShareJesusRoomId(shareRoom.id);
        setRoomRawTitle(shareRoom.title);
        setRoomTitle(titleLabelsRef.current.shareWithJesusTitle);
      }

      let roomForRoute: MyRoomItem | undefined;
      if (rr === GLOBAL_ROOM_SLUG || rr === GLOBAL_ROOM_ID) {
        roomForRoute = rooms.find((room) => room.id === GLOBAL_ROOM_ID);
      } else if (rr === SHARE_WITH_JESUS_SLUG) {
        roomForRoute = shareRoom;
      } else if (rr) {
        roomForRoute = rooms.find((room) => room.id === rr);
        if (!roomForRoute) {
          roomForRoute = findDirectRoomByUserId(rooms, uid, rr);
        }
      }

      if (
        roomForRoute?.title &&
        rr !== SHARE_WITH_JESUS_SLUG &&
        rr !== shareRoom?.id
      ) {
        setRoomRawTitle(roomForRoute.title);
        setRoomTitle(
          getReadableRoomTitle(
            roomForRoute.id,
            roomForRoute.title,
            uid,
            usersRef.current,
            roomForRoute.directPeer,
            titleLabelsRef.current,
          ),
        );
      }

      const routeCandidate = rr;
      if (!roomForRoute && routeCandidate) {
        const isGlobal =
          routeCandidate === GLOBAL_ROOM_ID ||
          routeCandidate === GLOBAL_ROOM_SLUG;
        const isSelfRoute = routeCandidate === uid;
        const isShareSlug = routeCandidate === SHARE_WITH_JESUS_SLUG;
        const alreadyOpening = openingDirectRoomRef.current.has(routeCandidate);

        if (!isGlobal && !isSelfRoute && !isShareSlug && !alreadyOpening) {
          openingDirectRoomRef.current.add(routeCandidate);
          socket.emit("openDirectRoom", { targetUserId: routeCandidate });
        }
      }

      if (roomForRoute) {
        if (
          rr !== GLOBAL_ROOM_SLUG &&
          rr !== GLOBAL_ROOM_ID &&
          rr !== SHARE_WITH_JESUS_SLUG
        ) {
          setDirectRouteRoomId(roomForRoute.id);
        }
        const isShareTitle = Boolean(
          roomForRoute.title?.startsWith(SHARE_WITH_JESUS_ROOM_PREFIX),
        );
        if (rr === SHARE_WITH_JESUS_SLUG && isShareTitle) {
          joinRoom(socket, roomForRoute.id, { skipLoadingSpinner: true });
        } else if (rr !== SHARE_WITH_JESUS_SLUG) {
          joinRoom(
            socket,
            roomForRoute.id,
            isShareTitle ? { skipLoadingSpinner: true } : undefined,
          );
        }
      }
    };
    socket.on("myRooms", onMyRooms);

    const onDirectRoomOpened = (payload: DirectRoomOpenedPayload) => {
      openingDirectRoomRef.current.delete(payload.targetUserId);
      setDirectRouteRoomId(payload.roomId);
      joinRoom(socket, payload.roomId);

      if (payload.targetUsername) {
        setRoomTitle(
          titleLabelsRef.current.directChatWith(payload.targetUsername),
        );
        setRoomRawTitle(payload.title ?? "");
      } else if (payload.title) {
        setRoomRawTitle(payload.title);
        setRoomTitle(
          getReadableRoomTitle(
            payload.roomId,
            payload.title,
            user?.id,
            usersRef.current,
            undefined,
            titleLabelsRef.current,
          ),
        );
      }
    };
    socket.on("directRoomOpened", onDirectRoomOpened);

    const onOnlineCount = (count: number) => {
      if (typeof count === "number") {
        setOnlineCount((prev) => (prev === count ? prev : count));
      }
    };
    socket.on("onlineCount", onOnlineCount);

    const onOnlineUsers = (payload: OnlineUsersPayload) => {
      const nextUserIds = Array.isArray(payload?.userIds)
        ? payload.userIds
        : [];
      const nextUserIdsSet = new Set(nextUserIds);
      setOnlineUserIds((prev) =>
        areSetsEqual(prev, nextUserIdsSet) ? prev : nextUserIdsSet,
      );

      if (typeof payload?.count === "number") {
        const nextCount = payload.count;
        setOnlineCount((prev) => (prev === nextCount ? prev : nextCount));
      }
    };
    socket.on("onlineUsers", onOnlineUsers);

    const onUserPresenceChanged = (payload: UserPresencePayload) => {
      if (!payload?.userId) return;

      setOnlineUserIds((prev) => {
        const alreadyOnline = prev.has(payload.userId);
        if (alreadyOnline === payload.isOnline) {
          return prev;
        }

        const next = new Set(prev);
        if (payload.isOnline) {
          next.add(payload.userId);
        } else {
          next.delete(payload.userId);
        }
        return next;
      });

      if (!payload.isOnline && payload.lastSeenAt) {
        setLastSeenByUserId((prev) => {
          const next = new Map(prev);
          next.set(payload.userId, payload.lastSeenAt as string);
          return next;
        });
      }
    };
    socket.on("userPresenceChanged", onUserPresenceChanged);

    const onUserTyping = (payload: {
      roomId?: string;
      userId?: string;
      username?: string;
      isTyping?: boolean;
      activity?: "text" | "voice";
    }) => {
      const joinedId = joinedRoomRef.current;
      if (!joinedId || payload.roomId !== joinedId) return;
      if (!payload.userId || payload.userId === userIdRef.current) return;

      setTypingUsers((prev) => {
        const next = new Map(prev);
        const uid = payload.userId;
        if (!uid) return prev;
        if (payload.isTyping && payload.username) {
          next.set(uid, {
            username: payload.username,
            activity: payload.activity === "voice" ? "voice" : "text",
          });
        } else {
          next.delete(uid);
        }
        return next;
      });
    };
    socket.on("userTyping", onUserTyping);

    const onUserJoinedRoom = (payload: {
      roomId?: string;
      userId?: string;
    }) => {
      const joinedId = joinedRoomRef.current;
      if (!joinedId || payload.roomId !== joinedId) return;
      if (!payload.userId || payload.userId === userIdRef.current) return;
      setPeerLastReadAt(new Date().toISOString());
      setRoomReadStatesByUserId((prev) => {
        const next = new Map(prev);
        next.set(payload.userId as string, new Date().toISOString());
        return next;
      });
    };
    socket.on("userJoinedRoom", onUserJoinedRoom);

    const onRoomReadUpdated = (payload: {
      roomId?: string;
      userId?: string;
      lastReadAt?: string;
    }) => {
      const joinedId = joinedRoomRef.current;
      if (!joinedId || payload.roomId !== joinedId) return;
      if (!payload.userId || payload.userId === userIdRef.current) return;
      if (!payload.lastReadAt) return;
      const nextLastReadAt = payload.lastReadAt;
      setRoomReadStatesByUserId((prev) => {
        const next = new Map(prev);
        const current = next.get(payload.userId as string);
        if (
          !current ||
          new Date(nextLastReadAt).getTime() >= new Date(current).getTime()
        ) {
          next.set(payload.userId as string, nextLastReadAt);
        }
        return next;
      });
      setPeerLastReadAt((prev) => {
        if (!prev) return nextLastReadAt;
        return new Date(nextLastReadAt).getTime() >= new Date(prev).getTime()
          ? nextLastReadAt
          : prev;
      });
    };
    socket.on("roomReadUpdated", onRoomReadUpdated);

    const onRoomReadStates = (payload: RoomReadStatesPayload) => {
      const joinedId = joinedRoomRef.current;
      if (!joinedId || payload.roomId !== joinedId) return;

      const next = new Map<string, string>();
      for (const item of payload.readStates ?? []) {
        if (!item?.userId || !item?.lastReadAt) continue;
        next.set(String(item.userId), String(item.lastReadAt));
      }
      setRoomReadStatesByUserId(next);
    };
    socket.on("roomReadStates", onRoomReadStates);

    const onUpdateMessageReactions = (
      payload: UpdateMessageReactionsPayload,
    ) => {
      const joinedId = joinedRoomRef.current;
      if (!joinedId || !payload?.messageId) return;
      const normalizedReactions = (payload.reactions ?? [])
        .map((reaction) => {
          if (!reaction?.id || !reaction.userId) return null;
          if (typeof reaction.type !== "string" || !reaction.type) return null;
          return {
            id: String(reaction.id),
            userId: String(reaction.userId),
            type: reaction.type as AppReactionType,
            createdAt: String(reaction.createdAt ?? new Date().toISOString()),
          };
        })
        .filter(Boolean) as NonNullable<Message["reactions"]>;

      pendingReactions.confirm(payload.messageId);
      rawHistoryRef.current = patchRawMessage(
        rawHistoryRef.current,
        payload.messageId,
        { reactions: normalizedReactions },
      );
      setMessages((prev) =>
        prev.map((messageItem) =>
          messageItem.id === payload.messageId
            ? {
                ...messageItem,
                reactions: normalizedReactions,
              }
            : messageItem,
        ),
      );
    };
    socket.on("update-message-reactions", onUpdateMessageReactions);

    const onReactionError = (payload: { messageId?: string }) => {
      if (payload?.messageId) pendingReactions.fail(payload.messageId);
    };
    socket.on("reactionError", onReactionError);

    const onInvitedToRoom = () => {
      requestMyRooms(socket);
    };
    socket.on("userInvitedToRoom", onInvitedToRoom);

    const onIncomingCall = (payload: IncomingCallPayload) => {
      if (!payload?.channelName) return;
      setIncomingCall(payload);
    };
    socket.on("incoming-call", onIncomingCall);

    const onCallAccepted = (payload: CallAcceptedPayload) => {
      const pending = pendingOutgoingCallRef.current;
      if (
        !pending?.channelName ||
        !payload?.channelName ||
        pending.channelName !== payload.channelName
      ) {
        return;
      }
      if (outgoingCallTimeoutRef.current !== null) {
        window.clearTimeout(outgoingCallTimeoutRef.current);
        outgoingCallTimeoutRef.current = null;
      }
      setActiveCall(pending);
      setIsCallOverlayVisible(true);
      setPendingOutgoingCall(null);
      setSendNotice(null);
    };
    socket.on("call-accepted", onCallAccepted);

    const onCallDeclined = (payload: CallDeclinedPayload) => {
      const pending = pendingOutgoingCallRef.current;
      if (
        !pending?.channelName ||
        !payload?.channelName ||
        pending.channelName !== payload.channelName
      ) {
        return;
      }
      if (outgoingCallTimeoutRef.current !== null) {
        window.clearTimeout(outgoingCallTimeoutRef.current);
        outgoingCallTimeoutRef.current = null;
      }
      setPendingOutgoingCall(null);
      setSendNotice(t("callDeclinedNotice"));

      const joinedId = joinedRoomRef.current;
      if (joinedId) {
        socket.emit("sendMessage", {
          roomId: joinedId,
          content: t("missedCallNoticeFromMe"),
        });
      }
    };
    socket.on("call-declined", onCallDeclined);

    const onCallError = (payload: { error?: string }) => {
      const pending = pendingOutgoingCallRef.current;
      if (!pending) {
        return;
      }
      if (outgoingCallTimeoutRef.current !== null) {
        window.clearTimeout(outgoingCallTimeoutRef.current);
        outgoingCallTimeoutRef.current = null;
      }
      setPendingOutgoingCall(null);
      setSendNotice(payload?.error?.trim() || t("callConnectionFailed"));

      const joinedId = joinedRoomRef.current;
      if (joinedId) {
        socket.emit("sendMessage", {
          roomId: joinedId,
          content: t("missedCallNoticeFromMe"),
        });
      }
    };
    socket.on("call-error", onCallError);

    const onCallUserSent = (payload: CallUserSentPayload) => {
      if (!payload?.offline) return;
      const pending = pendingOutgoingCallRef.current;
      if (!pending) return;
      if (outgoingCallTimeoutRef.current !== null) {
        window.clearTimeout(outgoingCallTimeoutRef.current);
        outgoingCallTimeoutRef.current = null;
      }
      setPendingOutgoingCall(null);
      setSendNotice(t("callPushSentNotice"));
    };
    socket.on("call-user-sent", onCallUserSent);

    const onGameSession = (payload: GameSessionPayload) => {
      const joinedId = joinedRoomRef.current;
      if (!joinedId || payload?.roomId !== joinedId) {
        return;
      }

      const myId = userIdRef.current;
      const scores = payload.scores ?? {};
      let mine = 0;
      let peer = 0;
      for (const [userId, rawScore] of Object.entries(scores)) {
        const value = Number(rawScore);
        if (!Number.isFinite(value)) {
          continue;
        }
        const normalized = Math.max(0, Math.floor(value));
        if (userId === myId) {
          mine = normalized;
        } else {
          peer = Math.max(peer, normalized);
        }
      }

      if (payload.game === "snake") {
        setMySnakeScore(mine);
        setPeerSnakeScore(peer);
        return;
      }
      setMyDoodleScore(mine);
      setPeerDoodleScore(peer);
    };
    socket.on("gameSession", onGameSession);

    const onDoodleScoreUpdated = (payload: DoodleScoreUpdatedPayload) => {
      const joinedId = joinedRoomRef.current;
      if (!joinedId || payload?.roomId !== joinedId || !payload?.userId) {
        return;
      }
      const nextScore = Number(payload.score);
      if (!Number.isFinite(nextScore)) {
        return;
      }
      const normalized = Math.max(0, Math.floor(nextScore));
      if (payload.userId === userIdRef.current) {
        setMyDoodleScore(normalized);
      } else {
        setPeerDoodleScore(normalized);
      }
    };
    socket.on("doodle-score-updated", onDoodleScoreUpdated);

    const onDoodleReset = (payload: DoodleResetPayload) => {
      const joinedId = joinedRoomRef.current;
      if (!joinedId || payload?.roomId !== joinedId) {
        return;
      }
      setMyDoodleScore(0);
      setPeerDoodleScore(0);
      setPeerDoodleState(null);
    };
    socket.on("doodle-reset", onDoodleReset);

    const onDoodleStateUpdated = (payload: DoodleStateUpdatedPayload) => {
      const joinedId = joinedRoomRef.current;
      if (
        !joinedId ||
        payload?.roomId !== joinedId ||
        !payload?.userId ||
        !payload.state
      ) {
        return;
      }
      const state = payload.state;
      if (
        !Number.isFinite(state.x) ||
        !Number.isFinite(state.y) ||
        !Number.isFinite(state.cameraY) ||
        !Number.isFinite(state.score)
      ) {
        return;
      }

      if (payload.userId === userIdRef.current) {
        setMyDoodleScore(Math.max(0, Math.floor(state.score)));
        return;
      }


      setPeerDoodleState({
        x: state.x,
        y: state.y,
        cameraY: state.cameraY,
        score: Math.max(0, Math.floor(state.score)),
        alive: Boolean(state.alive),
        emittedAt: Number.isFinite(state.emittedAt)
          ? Number(state.emittedAt)
          : undefined,
      });
      setPeerDoodleScore(Math.max(0, Math.floor(state.score)));
    };
    socket.on("doodle-state-updated", onDoodleStateUpdated);

    const onSnakeScoreUpdated = (payload: SnakeScoreUpdatedPayload) => {
      const joinedId = joinedRoomRef.current;
      if (!joinedId || payload?.roomId !== joinedId || !payload?.userId) {
        return;
      }
      const nextScore = Number(payload.score);
      if (!Number.isFinite(nextScore)) {
        return;
      }
      const normalized = Math.max(0, Math.floor(nextScore));
      if (payload.userId === userIdRef.current) {
        setMySnakeScore(normalized);
      } else {
        setPeerSnakeScore(normalized);
      }
    };
    socket.on("snake-score-updated", onSnakeScoreUpdated);

    const onSnakeReset = (payload: SnakeResetPayload) => {
      const joinedId = joinedRoomRef.current;
      if (!joinedId || payload?.roomId !== joinedId) {
        return;
      }
      setMySnakeScore(0);
      setPeerSnakeScore(0);
      setPeerSnakeState(null);
    };
    socket.on("snake-reset", onSnakeReset);

    const onSnakeStateUpdated = (payload: SnakeStateUpdatedPayload) => {
      const joinedId = joinedRoomRef.current;
      if (
        !joinedId ||
        payload?.roomId !== joinedId ||
        !payload?.userId ||
        !payload.state
      ) {
        return;
      }
      const state = payload.state;
      if (
        !Number.isFinite(state.headX) ||
        !Number.isFinite(state.headY) ||
        !Number.isFinite(state.foodX) ||
        !Number.isFinite(state.foodY) ||
        !Number.isFinite(state.score)
      ) {
        return;
      }

      if (payload.userId === userIdRef.current) {
        setMySnakeScore(Math.max(0, Math.floor(state.score)));
        return;
      }


      const body = Array.isArray(state.body)
        ? state.body
            .map((point) => ({ x: Number(point.x), y: Number(point.y) }))
            .filter(
              (point) => Number.isFinite(point.x) && Number.isFinite(point.y),
            )
        : [];

      setPeerSnakeState({
        headX: state.headX,
        headY: state.headY,
        foodX: state.foodX,
        foodY: state.foodY,
        body,
        score: Math.max(0, Math.floor(state.score)),
        alive: Boolean(state.alive),
        emittedAt: Number.isFinite(state.emittedAt)
          ? Number(state.emittedAt)
          : undefined,
      });
      setPeerSnakeScore(Math.max(0, Math.floor(state.score)));
    };
    socket.on("snake-state-updated", onSnakeStateUpdated);

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("connect_error", onSocketError);
      socket.off("error", onSocketError);
      socket.off("newMessage", onNewMessage);
      socket.off("messageDeleted", onMessageDeleted);
      socket.off("voiceListened", onVoiceListened);
      socket.off("deleteMessageResult", onDeleteMessageResult);
      socket.off("messageEdited", onMessageEdited);
      socket.off("roomHistory", onRoomHistory);
      socket.off("myRooms", onMyRooms);
      socket.off("directRoomOpened", onDirectRoomOpened);
      socket.off("userInvitedToRoom", onInvitedToRoom);
      socket.off("onlineCount", onOnlineCount);
      socket.off("onlineUsers", onOnlineUsers);
      socket.off("userPresenceChanged", onUserPresenceChanged);
      socket.off("userTyping", onUserTyping);
      socket.off("userJoinedRoom", onUserJoinedRoom);
      socket.off("roomReadUpdated", onRoomReadUpdated);
      socket.off("roomReadStates", onRoomReadStates);
      socket.off("update-message-reactions", onUpdateMessageReactions);
      socket.off("reactionError", onReactionError);
      socket.off("incoming-call", onIncomingCall);
      socket.off("call-user-sent", onCallUserSent);
      socket.off("call-accepted", onCallAccepted);
      socket.off("call-declined", onCallDeclined);
      socket.off("call-error", onCallError);
      socket.off("gameSession", onGameSession);
      socket.off("doodle-score-updated", onDoodleScoreUpdated);
      socket.off("doodle-reset", onDoodleReset);
      socket.off("doodle-state-updated", onDoodleStateUpdated);
      socket.off("snake-score-updated", onSnakeScoreUpdated);
      socket.off("snake-reset", onSnakeReset);
      socket.off("snake-state-updated", onSnakeStateUpdated);
      stopIncomingRingtone();
      if (outgoingCallTimeoutRef.current !== null) {
        window.clearTimeout(outgoingCallTimeoutRef.current);
        outgoingCallTimeoutRef.current = null;
      }
      leaveCurrentRoom(socket);
      detachPresence();
      socket.disconnect();
      socketRef.current = null;
    };
  }, [
    applyServerHistory,
    outgoing,
    pendingReactions,
    joinRoom,
    leaveCurrentRoom,
    loading,
    queryClient,
    requestMyRooms,
    router,
    stopIncomingRingtone,
    t,
    user,
    socketAuthEpoch,
  ]);

  const prevRouteForSocketRef = useRef<string | undefined>(undefined);

  // Синхронізуємо socket-room під час зміни URL (використовуємо routeRoomId: slug «share-with-jesus», global, uuid).
  useEffect(() => {
    if (loading || !routeRoomId) return;

    const socket = socketRef.current;
    if (!socket?.connected) return;

    const prev = prevRouteForSocketRef.current;
    prevRouteForSocketRef.current = routeRoomId;

    if (prev && prev !== routeRoomId && joinedRoomRef.current) {
      leaveCurrentRoom(socket);
    }

    if (routeRoomId === GLOBAL_ROOM_SLUG) {
      joinRoom(socket, GLOBAL_ROOM_ID);
      return;
    }

    if (routeRoomId === SHARE_WITH_JESUS_SLUG) {
      socket.emit("resolveShareWithJesusRoomId");
      return;
    }

    if (availableRoomIdsRef.current.has(routeRoomId)) {
      joinRoom(socket, routeRoomId);
      return;
    }

    const cachedRooms = queryClient.getQueryData<MyRoomItem[]>(
      chatMyRoomsQueryKey(user?.id),
    );
    if (cachedRooms?.length && user?.id) {
      const directRoom = findDirectRoomByUserId(
        cachedRooms,
        user.id,
        routeRoomId,
      );
      if (directRoom) {
        joinRoom(socket, directRoom.id);
        setRoomRawTitle(directRoom.title);
        setRoomTitle(
          getReadableRoomTitle(
            directRoom.id,
            directRoom.title,
            user.id,
            usersRef.current,
            directRoom.directPeer,
            titleLabelsRef.current,
          ),
        );
        return;
      }
    }

    requestMyRooms(socket);
  }, [
    queryClient,
    requestMyRooms,
    routeRoomId,
    loading,
    joinRoom,
    leaveCurrentRoom,
    user?.id,
  ]);

  // Швидке підключення «Поділися з Ісусом» без очікування `myRooms`.
  useEffect(() => {
    if (loading || routeRoomId !== SHARE_WITH_JESUS_SLUG) return;

    const socket = socketRef.current;
    if (!socket) return;

    const onResolved = (payload: ShareWithJesusRoomIdResolvedPayload) => {
      if (!payload?.ok || !payload.roomId) {
        if (payload?.error) {
          window.alert(payload.error);
        }
        return;
      }

      if (!user?.id) return;

      setResolvedShareJesusRoomId(payload.roomId);
      setRoomRawTitle(
        payload.roomTitle ?? `${SHARE_WITH_JESUS_ROOM_PREFIX}${user.id}`,
      );
      setRoomTitle(titleLabelsRef.current.shareWithJesusTitle);
      joinRoom(socket, payload.roomId, { skipLoadingSpinner: true });
    };

    socket.on("shareWithJesusRoomIdResolved", onResolved);
    return () => {
      socket.off("shareWithJesusRoomIdResolved", onResolved);
    };
  }, [routeRoomId, loading, joinRoom, user?.id]);

  useEffect(() => {
    if (isHistoryLoading || authError) {
      return;
    }

    // Щойно історія завантажилась або прилетіло нове повідомлення,
    // і користувач реально дивиться кімнату, позначаємо її прочитаною.
    markRoomAsRead();
  }, [messages.length, isHistoryLoading, authError, markRoomAsRead]);

  useEffect(() => {
    const handleFocus = () => {
      markRoomAsRead();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        markRoomAsRead();
      }
    };

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [markRoomAsRead]);

  /**
   * Поки кімната справді на екрані — сервер не шле з неї пуші (пункт «без сповіщень
   * під час живого спілкування»). Згорнули застосунок — прапорець знімається, пуші вертаються.
   */
  useEffect(() => {
    const roomForViewState = effectiveSocketRoomId;
    if (!roomForViewState || !isSocketConnected) {
      return;
    }

    const emitViewState = (active: boolean) => {
      const socket = socketRef.current;
      if (!socket?.connected) {
        return;
      }
      socket.emit("roomViewState", { roomId: roomForViewState, active });
    };

    const syncFromVisibility = () => {
      const visible = document.visibilityState === "visible";
      emitViewState(visible);
      // Сховали застосунок/заблокували екран: знімаємо перегляд негайно, не чекаючи на розрив сокета.
      if (!visible) clearServerViewState(socketRef.current?.id);
    };

    // pagehide/freeze: сторінка йде у фон або закривається — перегляд знімаємо безумовно
    // (visibilityState на цей момент ще може бути "visible").
    const goInactive = () => {
      emitViewState(false);
      clearServerViewState(socketRef.current?.id);
    };

    syncFromVisibility();
    document.addEventListener("visibilitychange", syncFromVisibility);
    window.addEventListener("pagehide", goInactive);
    document.addEventListener("freeze", goInactive);

    return () => {
      document.removeEventListener("visibilitychange", syncFromVisibility);
      window.removeEventListener("pagehide", goInactive);
      document.removeEventListener("freeze", goInactive);
      emitViewState(false);
    };
  }, [effectiveSocketRoomId, isSocketConnected]);

  const isShareWithJesusView =
    routeRoomId === SHARE_WITH_JESUS_SLUG ||
    roomRawTitle.startsWith(SHARE_WITH_JESUS_ROOM_PREFIX);

  const shareJesusParchmentBanner = isShareWithJesusView ? (
    <div className={styles.shareJesusParchment}>
      <span className={styles.shareJesusParchmentEdge} aria-hidden />
      <p className={styles.shareJesusParchmentTitle}>{t("parchmentTitle")}</p>
      <p className={styles.shareJesusParchmentText}>{t("parchmentText")}</p>
    </div>
  ) : null;

  const resolvedTitle =
    roomTitle ||
    getReadableRoomTitle(
      roomId,
      undefined,
      user?.id,
      users,
      undefined,
      titleLabels,
    );
  const routeUser = useMemo(
    () => users.find((existingUser) => existingUser.id === roomId),
    [users, roomId],
  );
  const directRoomUserIdFromTitle = useMemo(() => {
    if (!roomRawTitle.startsWith("dm:")) {
      return undefined;
    }

    return roomRawTitle
      .split(":")
      .slice(1)
      .find((id) => id !== user?.id);
  }, [roomRawTitle, user?.id]);

  const directChatTargetUserId = routeUser?.id ?? directRoomUserIdFromTitle;
  const directChatTargetUser = useMemo(
    () =>
      users.find((existingUser) => existingUser.id === directChatTargetUserId),
    [users, directChatTargetUserId],
  );

  const hideSenderNamesInMessages = Boolean(
    directChatTargetUser && roomId !== GLOBAL_ROOM_ID && !isShareWithJesusView,
  );
  const useCompactSenderNamesInGlobal = roomId === GLOBAL_ROOM_ID;
  const hideOwnSenderNameInGlobal = roomId === GLOBAL_ROOM_ID;

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (roomId === GLOBAL_ROOM_ID) {
      setRoomTitle(titleLabels.globalChatTitle);
      return;
    }
    if (
      routeRoomId === SHARE_WITH_JESUS_SLUG ||
      roomRawTitle.startsWith(SHARE_WITH_JESUS_ROOM_PREFIX)
    ) {
      setRoomTitle(titleLabels.shareWithJesusTitle);
      return;
    }
    if (roomRawTitle.trim()) {
      const peer =
        directChatTargetUser != null
          ? {
              username: directChatTargetUser.username,
              nickname: directChatTargetUser.nickname ?? null,
            }
          : undefined;
      setRoomTitle(
        getReadableRoomTitle(
          roomId,
          roomRawTitle,
          user?.id,
          users,
          peer,
          titleLabels,
        ),
      );
    }
  }, [
    directChatTargetUser,
    roomId,
    roomRawTitle,
    routeRoomId,
    titleLabels,
    user?.id,
    users,
  ]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const usersById = useMemo(() => {
    const map = new Map<string, (typeof users)[number]>();
    for (const item of users) {
      map.set(item.id, item);
    }
    return map;
  }, [users]);

  const peekProfileUser = peekProfileUserId
    ? (usersById.get(peekProfileUserId) ?? null)
    : null;

  const participants = useMemo(() => {
    const list: Array<(typeof users)[number]> = [];
    if (roomId === GLOBAL_ROOM_ID) {
      return users.map((item) => ({
        ...item,
        isOnline: onlineUserIds.has(item.id),
      }));
    }

    if (user) {
      list.push(user);
    }
    if (
      directChatTargetUser &&
      !list.some((item) => item.id === directChatTargetUser.id)
    ) {
      list.push(directChatTargetUser);
    }

    return list.map((item) => ({
      ...item,
      isOnline: onlineUserIds.has(item.id),
    }));
  }, [directChatTargetUser, onlineUserIds, roomId, user, users]);
  const headerAvatarSrc = useMemo(() => {
    if (isShareWithJesusView) {
      return "/jesus-say.svg";
    }
    if (roomId === GLOBAL_ROOM_ID) {
      return "/ava-chat.jpeg";
    }
    return resolvePublicAvatarUrl(directChatTargetUser?.avatarUrl);
  }, [directChatTargetUser?.avatarUrl, isShareWithJesusView, roomId]);

  const headerAvatarClassName =
    headerAvatarSrc != null && headerAvatarSrc !== ""
      ? isShareWithJesusView
        ? `${styles.avatar} ${styles.avatarJesus}`
        : `${styles.avatar} ${styles.avatarWithPhoto}`
      : styles.avatar;
  const canOpenAvatarPreview =
    Boolean(directChatTargetUserId) &&
    Boolean(headerAvatarSrc) &&
    roomId !== GLOBAL_ROOM_ID &&
    !isShareWithJesusView;
  const canOpenDirectUserProfile =
    Boolean(directChatTargetUser) &&
    roomId !== GLOBAL_ROOM_ID &&
    !isShareWithJesusView;

  const avatarLikesQueryEnabled =
    Boolean(directChatTargetUserId) &&
    roomId !== GLOBAL_ROOM_ID &&
    !isShareWithJesusView &&
    Boolean(getAuthToken());

  const { data: peerAvatarLikes } = useQuery({
    queryKey: avatarLikesForUserQueryKey(directChatTargetUserId ?? ""),
    queryFn: () => fetchAvatarLikesForUser(directChatTargetUserId!),
    enabled: avatarLikesQueryEnabled,
    staleTime: STALE.slow,
  });

  const isPeerSelf = Boolean(user?.id && directChatTargetUserId === user.id);
  const avatarLikeCount = peerAvatarLikes?.receivedCount ?? 0;
  const isAvatarLiked = peerAvatarLikes?.likedByMe ?? false;

  /** Лайк аватара: інтерфейс реагує одразу (оптимістично), при помилці — відкат до попереднього значення. */
  const toggleAvatarLikeMutation = useMutation({
    mutationFn: async () => {
      if (!directChatTargetUserId) {
        throw new Error("no peer");
      }
      return toggleAvatarLikeForUser(directChatTargetUserId);
    },
    onMutate: async () => {
      if (!directChatTargetUserId) return undefined;
      const key = avatarLikesForUserQueryKey(directChatTargetUserId);
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<AvatarLikesUserResponse>(key);
      queryClient.setQueryData<AvatarLikesUserResponse>(
        key,
        optimisticAvatarLikeToggle(previous),
      );
      return { key, previous };
    },
    onError: (_error, _vars, context) => {
      if (context) queryClient.setQueryData(context.key, context.previous);
    },
    onSuccess: (serverState) => {
      if (directChatTargetUserId) {
        queryClient.setQueryData(
          avatarLikesForUserQueryKey(directChatTargetUserId),
          serverState,
        );
      }
      // «Мої» лічильники змінюються лише при лайку власного аватара.
      if (user?.id && directChatTargetUserId === user.id) {
        void queryClient.invalidateQueries({ queryKey: avatarLikesMeQueryKey });
      }
    },
  });

  const handleToggleAvatarLike = useCallback(() => {
    if (!directChatTargetUserId || isPeerSelf) {
      return;
    }
    toggleAvatarLikeMutation.mutate();
  }, [directChatTargetUserId, isPeerSelf, toggleAvatarLikeMutation]);

  const profileModalUser =
    peekProfileUserId != null
      ? peekProfileUser
      : isUserProfileOpen && canOpenDirectUserProfile
        ? (directChatTargetUser ?? null)
        : null;

  const showUserProfileModal =
    Boolean(profileModalUser) &&
    (Boolean(peekProfileUserId) ||
      (isUserProfileOpen && canOpenDirectUserProfile));

  const profileModalJoinedAt = useMemo(() => {
    const createdAt = profileModalUser?.createdAt;
    if (!createdAt) {
      return null;
    }

    const joinedAt = new Date(createdAt);
    if (Number.isNaN(joinedAt.getTime())) {
      return null;
    }

    return new Intl.DateTimeFormat(lang, {
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(joinedAt);
  }, [profileModalUser?.createdAt, lang]);

  const profileModalDaysInApp = useMemo(() => {
    const createdAt = profileModalUser?.createdAt;
    if (!createdAt) {
      return null;
    }

    const joinedAtTs = new Date(createdAt).getTime();
    if (Number.isNaN(joinedAtTs)) {
      return null;
    }

    const daysInApp = Math.max(
      1,
      Math.floor((nowTs - joinedAtTs) / (1000 * 60 * 60 * 24)) + 1,
    );
    return t("profileDaysInApp", { count: daysInApp });
  }, [profileModalUser?.createdAt, nowTs, t]);

  const profileModalTitle =
    profileModalUser?.nickname?.trim() ||
    profileModalUser?.username?.trim() ||
    t("anonymousUser");

  const profileModalAvatarSrc = useMemo(
    () => resolvePublicAvatarUrl(profileModalUser?.avatarUrl),
    [profileModalUser?.avatarUrl],
  );

  const canOpenBigAvatarFromProfile =
    isUserProfileOpen &&
    !peekProfileUserId &&
    canOpenAvatarPreview &&
    Boolean(profileModalUser?.id) &&
    profileModalUser?.id === directChatTargetUserId;

  const isDirectTargetOnline = Boolean(
    directChatTargetUserId && onlineUserIds.has(directChatTargetUserId),
  );
  const globalOnlineCount = onlineCount;
  const directTargetLastSeenAt = directChatTargetUserId
    ? (lastSeenByUserId.get(directChatTargetUserId) ??
      directChatTargetUser?.lastSeenAt ??
      undefined)
    : undefined;
  const roomGameActivities = useMemo(
    () =>
      isGameActivityRoom(effectiveSocketRoomId)
        ? (gameActivityByRoom.get(effectiveSocketRoomId) ?? [])
        : [],
    [gameActivityByRoom, effectiveSocketRoomId],
  );
  // Хто друкує, той уже в чаті, а не в грі: лишаємо один рядок «друкує», а не два суперечливі.
  const visibleGameActivities = useMemo(
    () => roomGameActivities.filter((a) => !typingUsers.has(a.userId)),
    [roomGameActivities, typingUsers],
  );
  const directPeerGameActivity = directChatTargetUserId
    ? visibleGameActivities.find((a) => a.userId === directChatTargetUserId)
    : undefined;
  const voiceRecordingStatusLine = (() => {
    for (const value of typingUsers.values()) {
      if (value.activity === "voice") {
        return t("recordingVoice", { name: value.username });
      }
    }
    return null;
  })();

  const formatLastSeenAgo = (lastSeenIso: string | undefined) => {
    if (!lastSeenIso) {
      return t("offline");
    }

    const formatted = formatLastSeenRelative(lastSeenIso, nowTs, {
      justNow: () => t("lastSeenJustNow"),
      minutes: (count) => t("lastSeenMinutes", { count }),
      hours: (count) => t("lastSeenHours", { count }),
      days: (count) => t("lastSeenDays", { count }),
    });

    if (!formatted) {
      return t("offline");
    }

    return formatted;
  };

  // Під час завантаження історії в шапці лишається звичайний статус; «Завантаження…» — лише коли іншого статусу немає.
  const statusLine =
    (!isSocketConnected
      ? t("connecting")
      : voiceRecordingStatusLine
        ? voiceRecordingStatusLine
        : roomId === GLOBAL_ROOM_ID
          ? t("usersOnlineCount", { count: globalOnlineCount })
          : routeRoomId === SHARE_WITH_JESUS_SLUG ||
              roomRawTitle.startsWith(SHARE_WITH_JESUS_ROOM_PREFIX)
            ? t("shareJesusNotesHint")
            : directChatTargetUser && directPeerGameActivity
              ? t("gameActivity.statusPlaying", {
                  game: t(`gameActivity.games.${directPeerGameActivity.game}`),
                })
              : directChatTargetUser
              ? isDirectTargetOnline
                ? t("onlineShort")
                : formatLastSeenAgo(directTargetLastSeenAt)
              : "") || (isHistoryLoading ? t("loadingShort") : "");

  const headerPresenceClass =
    directChatTargetUser != null
      ? isDirectTargetOnline
        ? styles.peerOnline
        : styles.peerOffline
      : styles.peerNeutral;

  /** Зелений колір рядка «N користувачів онлайн» у загальному чаті (не для «Завантаження…» / «Підключення…»). */
  const globalOnlineStatusHighlight =
    roomId === GLOBAL_ROOM_ID && !isHistoryLoading && isSocketConnected;

  const typingStatuses = useMemo(
    () => Array.from(typingUsers.values()),
    [typingUsers],
  );

  const readReceiptMessageId = useMemo(() => {
    const isEligibleDirectChat =
      Boolean(directChatTargetUserId) &&
      effectiveSocketRoomId !== GLOBAL_ROOM_ID &&
      !isShareWithJesusView;
    if (!peerLastReadAt || !user || !isEligibleDirectChat) {
      return null;
    }
    const readTs = new Date(peerLastReadAt).getTime();
    let lastOwnReadMessageId: string | null = null;
    for (const messageItem of messages) {
      const isOwn = isMessageFromCurrentUser(messageItem, user);
      if (!isOwn) continue;
      const messageTs = new Date(messageItem.createdAt).getTime();
      if (messageTs <= readTs) {
        lastOwnReadMessageId = messageItem.id;
      }
    }
    return lastOwnReadMessageId;
  }, [
    messages,
    peerLastReadAt,
    user,
    directChatTargetUserId,
    effectiveSocketRoomId,
    isShareWithJesusView,
  ]);

  const readReceiptUsersByMessageId = useMemo(() => {
    if (!user || roomId !== GLOBAL_ROOM_ID) {
      return new Map<
        string,
        Array<{ id: string; avatarSrc?: string; label?: string }>
      >();
    }

    const otherParticipants = participants.filter(
      (participant) => participant.id !== user.id,
    );
    const result = new Map<
      string,
      Array<{ id: string; avatarSrc?: string; label?: string }>
    >();

    for (const messageItem of messages) {
      if (!isMessageFromCurrentUser(messageItem, user)) continue;

      const messageTs = new Date(messageItem.createdAt).getTime();
      const readers = otherParticipants
        .filter((participant) => {
          const lastReadAt = roomReadStatesByUserId.get(participant.id);
          if (!lastReadAt) return false;
          return new Date(lastReadAt).getTime() >= messageTs;
        })
        .map((participant) => ({
          id: participant.id,
          avatarSrc: resolvePublicAvatarUrl(participant.avatarUrl),
          label: participant.nickname ?? participant.username,
        }));

      if (readers.length > 0) {
        result.set(messageItem.id, readers);
      }
    }

    return result;
  }, [messages, participants, roomId, roomReadStatesByUserId, user]);

  const handleReplyMessage = (message: Message) => {
    // Ще не підтверджене сервером повідомлення (id тимчасовий) не можна цитувати.
    if (isOptimisticMessageId(message.id)) return;
    setReplyToMessage(message);
    setEditingMessage(null);
    // Синхронно в жесті — інакше iOS не відкриє (або закриє) клавіатуру.
    focusChatComposer();
  };

  /**
   * Оригінал цитати ще не в списку: дозавантажуємо історію до нього і гортаємо.
   * Повторний промах за той самий id (повідомлення немає навіть у БД) — лише повідомляємо.
   */
  const olderLoadAttemptedRef = useRef<Set<string>>(new Set());
  const messagesRef = useRef<Message[]>([]);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const handleMissingReferencedMessage = useCallback(
    async (referencedMessageId: string) => {
      const targetRoomId = joinedRoomRef.current;
      const token = getAuthToken();
      const oldest = messagesRef.current[0];
      if (
        !targetRoomId ||
        !token ||
        !oldest ||
        olderLoadAttemptedRef.current.has(referencedMessageId)
      ) {
        setSendNotice(t("replyOriginalMissing"));
        return;
      }
      olderLoadAttemptedRef.current.add(referencedMessageId);

      try {
        const { messages: older } = await fetchOlderRoomMessages({
          token,
          roomId: targetRoomId,
          beforeId: oldest.id,
          untilId: referencedMessageId,
        });
        if (joinedRoomRef.current !== targetRoomId) return;
        const { uniqueHistory } = normalizeRoomHistory(
          older as IncomingSocketMessage[],
          user?.username,
        );
        const fresh = uniqueHistory.filter(
          (item) => !messageIdsRef.current.has(item.id),
        );
        if (fresh.length > 0) {
          for (const item of fresh) messageIdsRef.current.add(item.id);
          setMessages((prev) => [...fresh, ...prev]);
        }
        // Дочекатись рендеру нових рядків, тоді гортати.
        window.setTimeout(() => {
          jumpToMessageRef.current?.(referencedMessageId);
        }, 80);
      } catch {
        setSendNotice(t("replyOriginalMissing"));
      }
    },
    [t, user?.username],
  );

  const handleStartEditMessage = useCallback(
    (message: Message) => {
      if (!isMessageFromCurrentUser(message, user)) return;
      if (isOptimisticMessageId(message.id)) return;
      if (message.type && message.type !== "TEXT") return;
      setEditingMessage(message);
      setReplyToMessage(null);
      focusChatComposer();
    },
    [user],
  );

  const handleSaveEditedMessage = useCallback(
    async (messageId: string, text: string) => {
      const nextContent = text.trim();
      if (!nextContent) return false;

      const socket = socketRef.current;
      const targetRoomId = joinedRoomRef.current;
      if (!socket?.connected || !targetRoomId) {
        setSendNotice(t("sendWaitConnection"));
        return false;
      }

      return await new Promise<boolean>((resolve) => {
        let done = false;

        const finish = (result: boolean) => {
          if (done) return;
          done = true;
          window.clearTimeout(timeoutId);
          socket.off("editMessageResult", onEditMessageResult);
          resolve(result);
        };

        const onEditMessageResult = (payload: EditMessageResultSocketEvent) => {
          if (!payload || payload.messageId !== messageId) {
            return;
          }
          if (!payload.ok) {
            if (payload.error) {
              window.alert(payload.error);
            }
            finish(false);
            return;
          }
          setEditingMessage(null);
          finish(true);
        };

        const timeoutId = window.setTimeout(() => {
          window.alert(t("serverUnreachable"));
          finish(false);
        }, 6000);

        socket.on("editMessageResult", onEditMessageResult);
        socket.emit("editMessage", {
          messageId,
          content: nextContent,
        });
      });
    },
    [t],
  );

  const canModerateMessages = useMemo(
    () => canSeeAdminPanelNav(user?.username),
    [user?.username],
  );

  /** Прибрати «Не надіслано» без повторної відправки. */
  const handleDismissUnsent = useCallback(
    (message: Message) => {
      if (message.clientMessageId) outgoing.confirm(message.clientMessageId);
      setMessages((prev) => prev.filter((item) => item.id !== message.id));
    },
    [outgoing],
  );

  const handleDeleteMessage = useCallback(
    (message: Message) => {
      if (!effectiveSocketRoomId) {
        return;
      }
      // Неотправленное сообщение удаляется локально: на сервере его ещё нет.
      if (isOptimisticMessageId(message.id)) {
        handleDismissUnsent(message);
        return;
      }

      const socket = socketRef.current;
      if (!socket || !socket.connected) {
        window.alert(t("serverUnreachable"));
        return;
      }

      const isOwnMessage = isMessageFromCurrentUser(message, user);
      if (!isOwnMessage && !canModerateMessages) {
        return;
      }

      const isGlobal = effectiveSocketRoomId === GLOBAL_ROOM_ID;
      const confirmed = window.confirm(
        isGlobal ? t("deleteMessageGlobalConfirm") : t("deleteMessageConfirm"),
      );
      if (!confirmed) {
        return;
      }

      socket.emit("deleteMessage", { messageId: message.id });
    },
    [canModerateMessages, effectiveSocketRoomId, handleDismissUnsent, t, user],
  );

  const handleOpenDmFromAvatar = useCallback(
    (message: Message) => {
      if (!message.senderId || message.senderId === user?.id) {
        return;
      }
      setPeekProfileUserId(message.senderId);
    },
    [user?.id],
  );

  const handleParticipantClick = useCallback(
    (participant: { id: string }) => {
      if (!participant?.id || participant.id === user?.id) {
        return;
      }
      setPeekProfileUserId(participant.id);
      setIsParticipantsDrawerOpen(false);
    },
    [user?.id],
  );

  const closeUserProfileModal = useCallback(() => {
    setIsUserProfileOpen(false);
    setPeekProfileUserId(null);
  }, []);

  const handleProfileModalWrite = useCallback(() => {
    const targetId = peekProfileUserId;
    if (!targetId || targetId === user?.id) {
      return;
    }
    const socket = socketRef.current;
    if (socket?.connected) {
      socket.emit("openDirectRoom", { targetUserId: targetId });
    }
    router.push(`/chat/${targetId}`);
    setPeekProfileUserId(null);
  }, [peekProfileUserId, router, user?.id]);

  useEffect(() => {
    setPeekProfileUserId(null);
    setIsUserProfileOpen(false);
  }, [roomId]);

  /**
   * Реакція: інтерфейс реагує одразу (оптимістично), авторитетну відповідь дає `update-message-reactions`.
   * Затримане ехо (повільна мережа, перепідключення) реакцію не скасовує; відкат — лише за `reactionError`
   * або якщо після перепідключення сервер так і не підтвердив (див. `PendingReactions`).
   */
  const handleToggleReaction = useCallback(
    (message: Message, reaction: AppReactionType) => {
      const targetRoomId = effectiveSocketRoomId;
      const socket = socketRef.current;
      if (!socket || !socket.connected || !targetRoomId) {
        return;
      }
      if (isOptimisticMessageId(message.id)) return;
      const myId = user?.id;
      if (myId) {
        const base = message.reactions ?? [];
        pendingReactions.track(message.id, base);
        const mine = base.find(
          (item) => item.userId === myId && item.type === reaction,
        );
        const optimistic = mine
          ? base.filter((item) => item !== mine)
          : [
              ...base,
              {
                id: `optimistic-${message.id}-${reaction}`,
                userId: myId,
                type: reaction,
                createdAt: new Date().toISOString(),
              },
            ];
        setMessages((prev) =>
          prev.map((item) =>
            item.id === message.id ? { ...item, reactions: optimistic } : item,
          ),
        );
      }
      socket.emit("toggle-reaction", {
        messageId: message.id,
        type: reaction,
        chatId: targetRoomId,
      });
    },
    [effectiveSocketRoomId, user?.id, pendingReactions],
  );

  const handleStartCall = useCallback(() => {
    const socket = socketRef.current;
    if (!socket?.connected || !directChatTargetUserId || !user?.id) {
      return;
    }

    const callerUid = user.id.slice(0, 8);
    const targetUid = directChatTargetUserId.slice(0, 8);
    const channelName = `dm-${[callerUid, targetUid].sort().join("-")}`;
    socket.emit("call-user", {
      targetUserId: directChatTargetUserId,
      channelName,
    });

    const outgoingPayload: IncomingCallPayload = {
      channelName,
      initiator: {
        id: directChatTargetUserId,
        name:
          directChatTargetUser?.nickname ??
          directChatTargetUser?.username ??
          t("chatFallback"),
        avatarUrl: directChatTargetUser?.avatarUrl ?? null,
      },
    };
    setPendingOutgoingCall(outgoingPayload);
    setSendNotice(t("callingNotice"));

    if (outgoingCallTimeoutRef.current !== null) {
      window.clearTimeout(outgoingCallTimeoutRef.current);
    }
    outgoingCallTimeoutRef.current = window.setTimeout(() => {
      const joinedId = joinedRoomRef.current;
      if (joinedId && socket.connected) {
        socket.emit("sendMessage", {
          roomId: joinedId,
          content: t("missedCallNoticeFromMe"),
        });
      }
      setPendingOutgoingCall(null);
      setSendNotice(t("callNoAnswerNotice"));
    }, 30_000);
  }, [directChatTargetUser, directChatTargetUserId, t, user]);

  useEffect(() => {
    if (!activeCall?.channelName) {
      setIsCallOverlayVisible(true);
    }
  }, [activeCall?.channelName]);

  const handleOpenDoodle = useCallback((options?: { join?: boolean }) => {
    if (!directChatTargetUserId || !effectiveSocketRoomId) {
      return;
    }
    const socket = socketRef.current;
    if (!socket?.connected) {
      return;
    }
    setIsSnakeOpen(false);
    setIsFilwordOpen(false);
    setIsGuessOpen(false);
    setIsPuzzleOpen(false);
    setIsGameMenuOpen(false);
    setIsDoodleOpen(true);
    setMyDoodleScore(0);
    setPeerDoodleScore(0);
    setPeerDoodleState(null);
    // «Приєднатися» не скидає партію, яку співрозмовник уже почав.
    if (!options?.join) {
      socket.emit("doodle-reset", { roomId: effectiveSocketRoomId });
    }
    socket.emit("gameSync", { roomId: effectiveSocketRoomId, game: "doodle" });
  }, [directChatTargetUserId, effectiveSocketRoomId]);

  const handleDoodleScoreChange = useCallback((score: number) => {
    setMyDoodleScore(score);
    const socket = socketRef.current;
    const joinedId = joinedRoomRef.current;
    if (!socket?.connected || !joinedId) {
      return;
    }
    socket.emit("doodle-score", {
      roomId: joinedId,
      score,
    });
  }, []);

  const doodleStateEmitTsRef = useRef(0);
  const handleDoodleStateChange = useCallback((state: DoodleRuntimeState) => {
    const socket = socketRef.current;
    const joinedId = joinedRoomRef.current;
    if (!socket?.connected || !joinedId) {
      return;
    }

    const now = Date.now();
    if (now - doodleStateEmitTsRef.current < 75 && state.alive) {
      return;
    }
    doodleStateEmitTsRef.current = now;

    socket.emit("doodle-state", {
      roomId: joinedId,
      state: {
        ...state,
        emittedAt: Date.now(),
      },
    });
  }, []);

  const handleOpenSnake = useCallback((options?: { join?: boolean }) => {
    if (!directChatTargetUserId || !effectiveSocketRoomId) {
      return;
    }
    const socket = socketRef.current;
    if (!socket?.connected) {
      return;
    }
    setIsDoodleOpen(false);
    setIsFilwordOpen(false);
    setIsGuessOpen(false);
    setIsPuzzleOpen(false);
    setIsGameMenuOpen(false);
    setIsSnakeOpen(true);
    setMySnakeScore(0);
    setPeerSnakeScore(0);
    setPeerSnakeState(null);
    if (!options?.join) {
      socket.emit("snake-reset", { roomId: effectiveSocketRoomId });
    }
    socket.emit("gameSync", { roomId: effectiveSocketRoomId, game: "snake" });
  }, [directChatTargetUserId, effectiveSocketRoomId]);

  const handleOpenFilword = useCallback(() => {
    if (!directChatTargetUserId || !effectiveSocketRoomId) {
      return;
    }
    setIsDoodleOpen(false);
    setIsSnakeOpen(false);
    setIsGuessOpen(false);
    setIsPuzzleOpen(false);
    setIsGameMenuOpen(false);
    setIsFilwordOpen(true);
  }, [directChatTargetUserId, effectiveSocketRoomId]);

  /** Стан гри живе на сервері: відкриття нічого не скидає, а повернення продовжує партію. */
  const handleOpenGuess = useCallback(() => {
    if (!directChatTargetUserId || !effectiveSocketRoomId) {
      return;
    }
    setIsDoodleOpen(false);
    setIsSnakeOpen(false);
    setIsFilwordOpen(false);
    setIsGameMenuOpen(false);
    setIsPuzzleOpen(false);
    setIsGuessOpen(true);
  }, [directChatTargetUserId, effectiveSocketRoomId]);

  /** Стан пазла живе на сервері: відкриття нічого не скидає, а повернення продовжує збірку. */
  const handleOpenPuzzle = useCallback(() => {
    if (!directChatTargetUserId || !effectiveSocketRoomId) {
      return;
    }
    setIsDoodleOpen(false);
    setIsSnakeOpen(false);
    setIsFilwordOpen(false);
    setIsGuessOpen(false);
    setIsGameMenuOpen(false);
    setIsPuzzleOpen(true);
  }, [directChatTargetUserId, effectiveSocketRoomId]);

  const handleJoinGame = useCallback(
    (game: GameId) => {
      if (game === "doodle") handleOpenDoodle({ join: true });
      else if (game === "snake") handleOpenSnake({ join: true });
      else if (game === "guess") handleOpenGuess();
      else if (game === "puzzle") handleOpenPuzzle();
    },
    [handleOpenDoodle, handleOpenSnake, handleOpenGuess, handleOpenPuzzle],
  );

  const handleSnakeScoreChange = useCallback((score: number) => {
    setMySnakeScore(score);
    const socket = socketRef.current;
    const joinedId = joinedRoomRef.current;
    if (!socket?.connected || !joinedId) {
      return;
    }
    socket.emit("snake-score", {
      roomId: joinedId,
      score,
    });
  }, []);

  const snakeStateEmitTsRef = useRef(0);
  const handleSnakeStateChange = useCallback((state: SnakeRuntimeState) => {
    const socket = socketRef.current;
    const joinedId = joinedRoomRef.current;
    if (!socket?.connected || !joinedId) {
      return;
    }

    const now = Date.now();
    if (now - snakeStateEmitTsRef.current < 70 && state.alive) {
      return;
    }
    snakeStateEmitTsRef.current = now;

    socket.emit("snake-state", {
      roomId: joinedId,
      state: {
        ...state,
        emittedAt: Date.now(),
      },
    });
  }, []);

  const handleCallEnded = useCallback(
    (durationSeconds: number) => {
      const joinedId = joinedRoomRef.current;
      const socket = socketRef.current;
      if (!joinedId || !socket?.connected) return;
      const minutes = Math.floor(durationSeconds / 60);
      const content =
        minutes < 1 ? t("callEndedShort") : t("callEndedMinutes", { minutes });
      socket.emit("sendMessage", { roomId: joinedId, content });
    },
    [t],
  );

  async function handleSend(text: string, replyTarget?: Message | null) {
    const targetRoomId = effectiveSocketRoomId;
    if (!socketRef.current || !targetRoomId || !text.trim()) return false;

    if (!socketRef.current.connected) {
      setSendNotice(t("sendWaitConnection"));
      return false;
    }

    if (routeRoomId === user?.id) return false;

    if (routeRoomId === SHARE_WITH_JESUS_SLUG && !resolvedShareJesusRoomId) {
      requestMyRooms(socketRef.current);
      return false;
    }

    if (
      !availableRoomIdsRef.current.has(targetRoomId) &&
      targetRoomId !== GLOBAL_ROOM_ID
    ) {
      if (routeRoomId && !openingDirectRoomRef.current.has(routeRoomId)) {
        openingDirectRoomRef.current.add(routeRoomId);
        socketRef.current.emit("openDirectRoom", { targetUserId: routeRoomId });
      }
      return false;
    }

    const normalizedText = text.trim();
    setSendNotice(null);
    persistLastSentPreview(
      targetRoomId,
      normalizedText,
      directChatTargetUserId,
    );

    const clientMessageId = createClientMessageId();
    socketRef.current.emit("sendMessage", {
      roomId: targetRoomId,
      content: normalizedText,
      replyToId: replyTarget?.id,
      clientMessageId,
    });

    if (user) {
      const optimistic = {
        ...normalizeIncomingMessage(
          {
            id: optimisticMessageId(clientMessageId),
            roomId: targetRoomId,
            content: normalizedText,
            type: "TEXT",
            senderId: user.id,
            username: user.nickname ?? user.username,
            handle: user.username,
            createdAt: new Date().toISOString(),
            reactions: [],
            replyTo: replyTarget
              ? {
                  id: replyTarget.id,
                  username: replyTarget.username,
                  type: replyTarget.type,
                  content: replyTarget.content,
                  fileUrl: replyTarget.fileUrl,
                  voiceDuration: replyTarget.voiceDuration,
                }
              : null,
          },
          user.username,
        ),
        clientMessageId,
        deliveryStatus: "sending" as const,
      };
      outgoing.add({
        clientMessageId,
        roomId: targetRoomId,
        content: normalizedText,
        replyToId: replyTarget?.id,
      });
      setMessages((prev) => [...prev, optimistic]);
    }
    return true;
  }

  /** «Повторити» для «Не надіслано»: той самий clientMessageId — сервер дубль не створить, якщо перша відправка дійшла. */
  const handleRetryUnsent = useCallback(
    (message: Message) => {
      const clientMessageId = message.clientMessageId;
      const socket = socketRef.current;
      if (!clientMessageId || !outgoing.get(clientMessageId)) return;
      if (!socket?.connected) {
        setSendNotice(t("sendWaitConnection"));
        return;
      }
      setSendNotice(null);
      const entry = outgoing.retry(clientMessageId);
      if (!entry) return;
      socket.emit("sendMessage", {
        roomId: entry.roomId,
        content: entry.content,
        replyToId: entry.replyToId,
        clientMessageId: entry.clientMessageId,
      });
    },
    [outgoing, t],
  );

  const handleVideoNoteUploaded = useCallback(
    async (secureUrl: string) => {
      const targetRoomId = effectiveSocketRoomId;
      const socket = socketRef.current;
      if (!targetRoomId || !secureUrl || !socket?.connected) {
        setSendNotice(t("roomNotReady"));
        return;
      }

      if (routeRoomId === SHARE_WITH_JESUS_SLUG && !resolvedShareJesusRoomId) {
        setSendNotice(t("roomConnecting"));
        return;
      }

      if (
        !availableRoomIdsRef.current.has(targetRoomId) &&
        targetRoomId !== GLOBAL_ROOM_ID
      ) {
        if (routeRoomId && !openingDirectRoomRef.current.has(routeRoomId)) {
          openingDirectRoomRef.current.add(routeRoomId);
          socket.emit("openDirectRoom", { targetUserId: routeRoomId });
        }
        setSendNotice(t("roomNotReady"));
        return;
      }

      setSendNotice(null);
      persistLastSentPreview(
        targetRoomId,
        "Видео-овечка",
        directChatTargetUserId,
      );
      socket.emit("sendMessage", {
        roomId: targetRoomId,
        type: "video_note",
        fileUrl: secureUrl,
      });
    },
    [
      directChatTargetUserId,
      effectiveSocketRoomId,
      resolvedShareJesusRoomId,
      routeRoomId,
      t,
    ],
  );

  const {
    start: startVideoRecording,
    stop: stopVideoRecording,
    closeScene: closeVideoRecordingScene,
    switchCamera: switchVideoCamera,
    isRecording: isVideoRecording,
    isUploading: isVideoUploading,
    isSceneOpen: isVideoSceneOpen,
    elapsedSeconds: videoElapsedSeconds,
    maxDurationSeconds: videoMaxDurationSeconds,
    facingMode: videoFacingMode,
    isSwitchingCamera: isSwitchingVideoCamera,
    previewVideoRef,
  } = useVideoRecorder({
    uploadUrl: `${CHAT_HTTP_API}/messages/video-note`,
    getAuthToken: async () =>
      (await ensureAccessToken().catch(() => null)) ?? getAuthToken(),
    onUploaded: handleVideoNoteUploaded,
    onError: (message) => setSendNotice(message),
  });

  /** Перевіряє, що кімната готова, і дає roomId + токен для завантаження медіа. */
  const resolveUploadTarget = useCallback(async () => {
    const targetRoomId = effectiveSocketRoomId;
    if (!targetRoomId || routeRoomId === user?.id) {
      return null;
    }

    if (routeRoomId === SHARE_WITH_JESUS_SLUG && !resolvedShareJesusRoomId) {
      setSendNotice(t("roomConnecting"));
      return null;
    }

    if (
      !availableRoomIdsRef.current.has(targetRoomId) &&
      targetRoomId !== GLOBAL_ROOM_ID
    ) {
      if (routeRoomId && !openingDirectRoomRef.current.has(routeRoomId)) {
        openingDirectRoomRef.current.add(routeRoomId);
        socketRef.current?.emit("openDirectRoom", {
          targetUserId: routeRoomId,
        });
      }
      setSendNotice(t("roomNotReady"));
      return null;
    }

    const token =
      (await ensureAccessToken().catch(() => null)) ?? getAuthToken();
    if (!token) {
      setSendNotice(t("noAuthTokenNotice"));
      return null;
    }

    setSendNotice(null);
    return { roomId: targetRoomId, token };
  }, [effectiveSocketRoomId, resolvedShareJesusRoomId, routeRoomId, t, user?.id]);

  const chatUploads = useChatUploads({
    resolveTarget: resolveUploadTarget,
    apiBase: CHAT_HTTP_API,
  });
  const enqueueUpload = chatUploads.enqueue;

  const handleSendVoice = useCallback(
    async (audioBlob: Blob): Promise<boolean> => {
      if (!audioBlob?.size) {
        return false;
      }
      const recorded = audioBlob as RecordedVoice;
      const replyToId = replyToMessage?.id ?? null;
      if (replyToMessage) setReplyToMessage(null);
      return enqueueUpload({
        kind: "voice",
        file: audioBlob,
        fileName: voiceFileName(audioBlob.type),
        voiceDuration: voiceDurationFromTimer(recorded.durationMs),
        replyToId,
      });
    },
    [enqueueUpload, replyToMessage],
  );

  /**
   * Розбирає вибрані файли за типом і ставить у чергу завантаження.
   * Нові типи вкладень додаються в `lib/chatMedia.ts` (FILE_ATTACHMENT_TYPES) — тут нічого міняти не треба.
   */
  const handleSelectAttachments = useCallback(
    async (pickedFiles: File[]) => {
      const files = pickedFiles.slice(0, MAX_FILES_PER_PICK);
      if (!files.length) return;
      if (pickedFiles.length > files.length) {
        setSendNotice(t("tooManyFiles", { count: MAX_FILES_PER_PICK }));
      }

      const tooLarge = files.find(
        (file) => file.size > MAX_ATTACHMENT_SIZE_BYTES,
      );
      if (tooLarge) {
        setSendNotice(t("fileTooLarge", { name: tooLarge.name }));
        return;
      }

      const unsupportedNames: string[] = [];
      const queued: Array<{ kind: "image" | "file"; file: File }> = [];
      for (const file of files) {
        const kind = classifyAttachment(file);
        if (kind) {
          queued.push({ kind, file });
        } else {
          unsupportedNames.push(file.name);
        }
      }

      if (unsupportedNames.length > 0) {
        const unsupportedPreview = unsupportedNames.slice(0, 2).join(", ");
        const restCount = unsupportedNames.length - 2;
        setSendNotice(
          t("allowedFilesOnly", {
            list: unsupportedPreview,
            more:
              restCount > 0
                ? t("allowedFilesOnlyMore", { count: restCount })
                : "",
          }),
        );
        if (!queued.length) return;
      }

      const replyToId = replyToMessage?.id ?? null;
      if (replyToMessage) setReplyToMessage(null);
      // Усі файли одразу з'являються в чаті з прогресом і вантажаться паралельно.
      await Promise.all(
        queued.map(({ kind, file }, index) =>
          enqueueUpload({
            kind,
            file,
            replyToId: index === 0 ? replyToId : null,
          }),
        ),
      );
    },
    [enqueueUpload, replyToMessage, t],
  );

  const handleSendImage = useCallback(
    async (imageFile: File): Promise<boolean> => {
      await handleSelectAttachments([imageFile]);
      return true;
    },
    [handleSelectAttachments],
  );

  const handleSendSticker = useCallback(
    async (
      sticker: StickerItem,
      replyTarget?: Message | null,
    ): Promise<boolean> => {
      const targetRoomId = effectiveSocketRoomId;
      const socket = socketRef.current;
      if (!socket || !targetRoomId) {
        return false;
      }
      if (!socket.connected) {
        setSendNotice(t("stickerWaitConnection"));
        return false;
      }
      if (routeRoomId === user?.id) {
        return false;
      }
      if (routeRoomId === SHARE_WITH_JESUS_SLUG && !resolvedShareJesusRoomId) {
        requestMyRooms(socket);
        return false;
      }
      if (
        !availableRoomIdsRef.current.has(targetRoomId) &&
        targetRoomId !== GLOBAL_ROOM_ID
      ) {
        if (routeRoomId && !openingDirectRoomRef.current.has(routeRoomId)) {
          openingDirectRoomRef.current.add(routeRoomId);
          socket.emit("openDirectRoom", { targetUserId: routeRoomId });
        }
        return false;
      }

      const payload = buildStickerMessagePayload(sticker.id, sticker.path);
      setSendNotice(null);
      persistLastSentPreview(
        targetRoomId,
        t("stickerLabel"),
        directChatTargetUserId,
      );
      socket.emit("sendMessage", {
        roomId: targetRoomId,
        content: payload,
        replyToId: replyTarget?.id,
      });
      return true;
    },
    [
      directChatTargetUserId,
      effectiveSocketRoomId,
      requestMyRooms,
      resolvedShareJesusRoomId,
      routeRoomId,
      t,
      user?.id,
    ],
  );

  const wideChatLayout = useMediaQuery("(min-width: 1024px)", false);
  /** Оверлей учасників лише на вузькому екрані; у глобальному чаті на десктопі — колонка `inline`. */
  const participantsOverlayOpen =
    isParticipantsDrawerOpen && (roomId !== GLOBAL_ROOM_ID || !wideChatLayout);

  const messagingPane = (
    <ChatWindow
      messages={messages}
      revealOnMount={skeletonWasShown}
      pendingUploads={chatUploads.items.filter(
        (item) => !item.roomId || item.roomId === effectiveSocketRoomId,
      )}
      onCancelUpload={chatUploads.cancel}
      onRetryUpload={chatUploads.retry}
      onRetryUnsent={handleRetryUnsent}
      onDismissUnsent={handleDismissUnsent}
      currentUsername={user?.username}
      currentUser={user}
      withSenderAvatars
      resolveAvatarUrl={(senderId) =>
        resolvePublicAvatarUrl(
          users.find((existingUser) => existingUser.id === senderId)?.avatarUrl,
        )
      }
      onAvatarClick={handleOpenDmFromAvatar}
      onReplyMessage={handleReplyMessage}
      onMissingReferencedMessage={handleMissingReferencedMessage}
      onEditMessage={handleStartEditMessage}
      onDeleteMessage={handleDeleteMessage}
      canDeleteOwnMessages={Boolean(effectiveSocketRoomId)}
      canModerateMessages={canModerateMessages}
      topBanner={shareJesusParchmentBanner}
      typingStatuses={typingStatuses}
      gameActivities={visibleGameActivities}
      onJoinGame={handleJoinGame}
      readReceiptMessageId={readReceiptMessageId}
      readReceiptUsersByMessageId={readReceiptUsersByMessageId}
      readReceiptAvatarSrc={resolvePublicAvatarUrl(
        directChatTargetUser?.avatarUrl,
      )}
      readReceiptLabel={t("readReceipt")}
      onToggleReaction={handleToggleReaction}
      resolveReactionAvatarUrl={(senderId) =>
        resolvePublicAvatarUrl(usersById.get(senderId)?.avatarUrl)
      }
      resolveReactionUserLabel={(senderId) =>
        usersById.get(senderId)?.nickname ?? usersById.get(senderId)?.username
      }
      roomKey={effectiveSocketRoomId ?? routeRoomId}
      hideSenderNames={hideSenderNamesInMessages}
      hideOwnSenderName={hideOwnSenderNameInGlobal}
      senderNameMode={
        useCompactSenderNamesInGlobal ? "compact-above" : "inline"
      }
      jumpToMessageRef={jumpToMessageRef}
    />
  );

  return (
    <div className={styles.chatScene}>
      <section className={`${styles.chat} container`}>
        <div className={styles.headerGlass}>
          <div className={styles.header}>
            <div
              className={`${styles.headerContent} ${headerPresenceClass} ${globalOnlineStatusHighlight ? styles.globalOnlineStatus : ""}`}
            >
              <Link href="/chat">
                <Image
                  className={styles.backIcon}
                  src="/back-icon.svg"
                  alt={t("backAlt")}
                  width={24}
                  height={24}
                />
              </Link>
              {canOpenDirectUserProfile ? (
                <button
                  type="button"
                  className={`${headerAvatarClassName} ${styles.headerAvatarButton}`}
                  onClick={() => setIsUserProfileOpen(true)}
                  aria-label={t("profileButtonAria", { name: resolvedTitle })}
                >
                  <AvatarWithFallback
                    src={headerAvatarSrc}
                    initials={getInitials(resolvedTitle)}
                    colorSeed={
                      directChatTargetUser?.id ?? roomId ?? resolvedTitle
                    }
                    width={40}
                    height={40}
                    imageClassName={styles.avatarPhoto}
                    fallbackClassName={styles.avatarLetterFallback}
                    loading="eager"
                    fallbackTint="onError"
                  />
                </button>
              ) : (
                <div className={headerAvatarClassName}>
                  <AvatarWithFallback
                    src={headerAvatarSrc}
                    initials={getInitials(resolvedTitle)}
                    colorSeed={
                      directChatTargetUser?.id ?? roomId ?? resolvedTitle
                    }
                    width={40}
                    height={40}
                    imageClassName={styles.avatarPhoto}
                    fallbackClassName={styles.avatarLetterFallback}
                    loading="eager"
                    fallbackTint="onError"
                  />
                </div>
              )}
              <div className={styles.wrapContent}>
                <div className={styles.titleRow}>
                  <h2 className={styles.chatName}>{resolvedTitle}</h2>
                </div>
                {statusLine ? (
                  <span className={styles.status}>{statusLine}</span>
                ) : null}
              </div>
              {roomId === GLOBAL_ROOM_ID ? (
                <button
                  type="button"
                  className={styles.participantsButton}
                  onClick={() => setIsParticipantsDrawerOpen(true)}
                  aria-label={t("participantsTitle")}
                  title={t("participantsTitle")}
                >
                  <Image
                    src="/icon-profile.svg"
                    alt=""
                    width={18}
                    height={18}
                    className={styles.participantsIcon}
                    aria-hidden
                  />
                </button>
              ) : null}
              {directChatTargetUser ? (
                <div className={styles.headerActions}>
                  <div className={styles.gameMenuWrap}>
                    <button
                      type="button"
                      className={styles.gameButton}
                      onClick={(event) => {
                        event.stopPropagation();
                        setIsGameMenuOpen((prev) => !prev);
                      }}
                      aria-label="Игры"
                      aria-haspopup="menu"
                      aria-expanded={isGameMenuOpen}
                      title="Игры"
                    >
                      <Gamepad2 size={18} strokeWidth={2.1} aria-hidden />
                    </button>
                    {isGameMenuOpen ? (
                      <div
                        className={styles.gameMenu}
                        role="menu"
                        onClick={(event) => event.stopPropagation()}
                      >
                        <button
                          type="button"
                          className={styles.gameMenuItem}
                          role="menuitem"
                          onClick={() => handleOpenDoodle()}
                        >
                          Doodle
                        </button>
                        <button
                          type="button"
                          className={styles.gameMenuItem}
                          role="menuitem"
                          onClick={() => handleOpenSnake()}
                        >
                          Snake
                        </button>
                        <button
                          type="button"
                          className={styles.gameMenuItem}
                          role="menuitem"
                          onClick={handleOpenFilword}
                        >
                          Филворд
                        </button>
                        <button
                          type="button"
                          className={styles.gameMenuItem}
                          role="menuitem"
                          onClick={handleOpenGuess}
                        >
                          {tGuess("title")}
                        </button>
                        <button
                          type="button"
                          className={styles.gameMenuItem}
                          role="menuitem"
                          onClick={handleOpenPuzzle}
                        >
                          {tPuzzle("title")}
                        </button>
                      </div>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    className={styles.callButton}
                    onClick={handleStartCall}
                    aria-label="Аудиозвонок"
                    title="Аудиозвонок"
                  >
                    <Phone size={17} strokeWidth={2.1} aria-hidden />
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        {authError ? (
          <p className={styles.stateMessage}>{authError}</p>
        ) : isHistoryLoading ? (
          <ChatSkeleton
            visible={showSkeleton}
            stalledHint={historyStalled ? t("historyStalledHint") : undefined}
            onRefresh={handleManualHistoryRefresh}
          />
        ) : roomId === GLOBAL_ROOM_ID ? (
          <div className={styles.chatSplit}>
            <div className={styles.chatSplitMain}>{messagingPane}</div>
            {isParticipantsDrawerOpen && wideChatLayout ? (
              <OnlineUsersDrawer
                variant="inline"
                open
                onClose={() => setIsParticipantsDrawerOpen(false)}
                participants={participants}
                title={t("participantsTitle")}
                onParticipantClick={handleParticipantClick}
              />
            ) : null}
          </div>
        ) : (
          messagingPane
        )}

        <div className={styles.composerDock}>
          <div className={styles.composerGlass}>
            <MessageInput
              onSend={handleSend}
              onSaveEdit={handleSaveEditedMessage}
              editingMessage={editingMessage}
              replyToMessage={replyToMessage}
              onCancelReply={() => setReplyToMessage(null)}
              onCancelEdit={() => setEditingMessage(null)}
              onSelectFiles={handleSelectAttachments}
              disabled={
                routeRoomId === SHARE_WITH_JESUS_SLUG &&
                !resolvedShareJesusRoomId
              }
              placeholder={
                routeRoomId === SHARE_WITH_JESUS_SLUG &&
                !resolvedShareJesusRoomId
                  ? t("composerConnecting")
                  : t("composerPlaceholder")
              }
              onTypingActivity={
                isSocketConnected && !authError
                  ? handleTypingActivity
                  : undefined
              }
              onVoiceRecordingActivity={
                isSocketConnected && !authError
                  ? handleVoiceRecordingActivity
                  : undefined
              }
              onSendVoice={
                authError || routeRoomId === user?.id
                  ? undefined
                  : handleSendVoice
              }
              onSendImage={
                authError || routeRoomId === user?.id
                  ? undefined
                  : handleSendImage
              }
              onSendSticker={
                authError || routeRoomId === user?.id
                  ? undefined
                  : handleSendSticker
              }
              onStartVideoRecording={
                authError || routeRoomId === user?.id
                  ? undefined
                  : startVideoRecording
              }
              onStopVideoRecording={
                authError || routeRoomId === user?.id
                  ? undefined
                  : stopVideoRecording
              }
              isVideoRecording={isVideoRecording}
            />
            {sendNotice ? (
              <p className={styles.sendNotice}>{sendNotice}</p>
            ) : null}
          </div>
        </div>
        <VideoNoteScene
          open={isVideoSceneOpen}
          isRecording={isVideoRecording}
          isUploading={isVideoUploading}
          elapsedSeconds={videoElapsedSeconds}
          maxDurationSeconds={videoMaxDurationSeconds}
          facingMode={videoFacingMode}
          isSwitchingCamera={isSwitchingVideoCamera}
          previewVideoRef={previewVideoRef}
          onSwitchCamera={switchVideoCamera}
          onStop={stopVideoRecording}
          onClose={closeVideoRecordingScene}
        />
        <OnlineUsersDrawer
          open={participantsOverlayOpen}
          onClose={() => setIsParticipantsDrawerOpen(false)}
          participants={participants}
          title={t("participantsTitle")}
          onParticipantClick={handleParticipantClick}
        />

        {isAvatarPreviewOpen && canOpenAvatarPreview ? (
          <div
            className={styles.avatarPreviewOverlay}
            onClick={() => setIsAvatarPreviewOpen(false)}
          >
            <div
              className={styles.avatarPreviewCard}
              role="dialog"
              aria-modal="true"
              onClick={(event) => event.stopPropagation()}
            >
              <button
                type="button"
                className={styles.avatarPreviewClose}
                onClick={() => setIsAvatarPreviewOpen(false)}
                aria-label="Закрыть просмотр аватара"
              >
                ×
              </button>
              <AvatarWithFallback
                src={headerAvatarSrc}
                initials={getInitials(resolvedTitle)}
                colorSeed={directChatTargetUser?.id ?? roomId ?? resolvedTitle}
                width={220}
                height={220}
                imageClassName={styles.avatarPreviewImage}
                fallbackClassName={styles.avatarPreviewFallback}
                loading="eager"
                fallbackTint="onError"
              />
              <button
                type="button"
                className={`${styles.avatarLikeButton} ${isAvatarLiked ? styles.avatarLikeButtonActive : ""}`}
                onClick={handleToggleAvatarLike}
                disabled={isPeerSelf || toggleAvatarLikeMutation.isPending}
                aria-label="Лайкнуть аватар"
                title="Лайк"
              >
                <span aria-hidden>❤</span>
                <span>{avatarLikeCount}</span>
              </button>
            </div>
          </div>
        ) : null}

        {showUserProfileModal && profileModalUser ? (
          <div
            className={styles.avatarPreviewOverlay}
            onClick={closeUserProfileModal}
          >
            <div
              className={styles.profilePreviewCard}
              role="dialog"
              aria-modal="true"
              onClick={(event) => event.stopPropagation()}
            >
              <button
                type="button"
                className={styles.avatarPreviewClose}
                onClick={closeUserProfileModal}
                aria-label={t("profileCloseAria")}
              >
                ×
              </button>

              {canOpenBigAvatarFromProfile ? (
                <button
                  type="button"
                  className={styles.profilePreviewAvatarButton}
                  onClick={() => {
                    setIsUserProfileOpen(false);
                    setPeekProfileUserId(null);
                    setIsAvatarPreviewOpen(true);
                  }}
                  aria-label="Открыть большую аватарку"
                >
                  <AvatarWithFallback
                    src={profileModalAvatarSrc}
                    initials={getInitials(profileModalTitle)}
                    colorSeed={
                      profileModalUser.id ?? roomId ?? profileModalTitle
                    }
                    width={88}
                    height={88}
                    imageClassName={styles.profilePreviewAvatar}
                    fallbackClassName={styles.profilePreviewAvatarFallback}
                    loading="eager"
                    fallbackTint="onError"
                  />
                </button>
              ) : (
                <AvatarWithFallback
                  src={profileModalAvatarSrc}
                  initials={getInitials(profileModalTitle)}
                  colorSeed={profileModalUser.id ?? roomId ?? profileModalTitle}
                  width={88}
                  height={88}
                  imageClassName={styles.profilePreviewAvatar}
                  fallbackClassName={styles.profilePreviewAvatarFallback}
                  loading="eager"
                  fallbackTint="onError"
                />
              )}

              <div className={styles.profilePreviewIdentity}>
                <h3 className={styles.profilePreviewTitle}>
                  {profileModalTitle}
                </h3>
                <p className={styles.profilePreviewHandle}>
                  @{profileModalUser.username ?? t("anonymousUser")}
                </p>
                {profileModalUser.bio?.trim() ? (
                  <p className={styles.profilePreviewBio}>
                    {profileModalUser.bio.trim()}
                  </p>
                ) : null}
              </div>

              <div className={styles.profilePreviewFacts}>
                <div className={styles.profilePreviewFact}>
                  <span className={styles.profilePreviewFactLabel}>
                    {t("profileJoinedAt")}
                  </span>
                  <span className={styles.profilePreviewFactValue}>
                    {profileModalJoinedAt ?? t("profileNoData")}
                  </span>
                </div>
                <div className={styles.profilePreviewFact}>
                  <span className={styles.profilePreviewFactLabel}>
                    {t("profileDaysLabel")}
                  </span>
                  <span className={styles.profilePreviewFactValue}>
                    {profileModalDaysInApp ?? t("profileNoData")}
                  </span>
                </div>
                <div className={styles.profilePreviewFact}>
                  <span className={styles.profilePreviewFactLabel}>
                    {t("profileLastRead")}
                  </span>
                  <span className={styles.profilePreviewFactValueMuted}>
                    {t("profileNoData")}
                  </span>
                </div>
              </div>

              {peekProfileUserId ? (
                <button
                  type="button"
                  className={styles.profilePreviewWriteButton}
                  onClick={handleProfileModalWrite}
                >
                  {t("profileWriteMessage")}
                </button>
              ) : null}
            </div>
          </div>
        ) : null}
        <IncomingCallModal
          open={Boolean(incomingCall)}
          callerName={
            incomingCall?.initiator?.name ||
            incomingCall?.initiator?.nickname ||
            incomingCall?.initiator?.username ||
            "Unknown"
          }
          onDecline={() => {
            const socket = socketRef.current;
            if (
              socket?.connected &&
              incomingCall?.channelName &&
              incomingCall?.initiator?.id
            ) {
              socket.emit("call-response", {
                initiatorId: incomingCall.initiator.id,
                channelName: incomingCall.channelName,
                accepted: false,
              });
            }
            stopIncomingRingtone();
            setIncomingCall(null);
          }}
          onAccept={() => {
            const socket = socketRef.current;
            if (
              socket?.connected &&
              incomingCall?.channelName &&
              incomingCall?.initiator?.id
            ) {
              socket.emit("call-response", {
                initiatorId: incomingCall.initiator.id,
                channelName: incomingCall.channelName,
                accepted: true,
              });
            }
            stopIncomingRingtone();
            setActiveCall(incomingCall);
            setIsCallOverlayVisible(true);
            setIncomingCall(null);
          }}
        />
        {activeCall?.channelName && !isCallOverlayVisible ? (
          <button
            type="button"
            className={styles.callReturnButton}
            onClick={() => setIsCallOverlayVisible(true)}
            aria-label="Вернуться к звонку"
            title="Вернуться к звонку"
          >
            <Phone size={15} strokeWidth={2.25} aria-hidden />
            <span>Вернуться к звонку</span>
          </button>
        ) : null}
        <CallScreen
          isOpen={Boolean(activeCall?.channelName)}
          isVisible={isCallOverlayVisible}
          channelName={activeCall?.channelName ?? null}
          peerName={
            activeCall?.initiator?.name ||
            activeCall?.initiator?.nickname ||
            activeCall?.initiator?.username ||
            t("chatFallback")
          }
          peerAvatarUrl={activeCall?.initiator?.avatarUrl ?? null}
          onMinimize={() => setIsCallOverlayVisible(false)}
          onClose={() => {
            setActiveCall(null);
            setIsCallOverlayVisible(true);
          }}
          onCallEnded={handleCallEnded}
        />
        {isDoodleOpen ? (
          <DoodleMiniGame
            open
            myScore={myDoodleScore}
            peerScore={peerDoodleScore}
            peerName={
              directChatTargetUser?.nickname ??
              directChatTargetUser?.username ??
              "Собеседник"
            }
            peerState={peerDoodleState}
            pingMs={gamePingMs}
            onClose={() => setIsDoodleOpen(false)}
            onScoreChange={handleDoodleScoreChange}
            onStateChange={handleDoodleStateChange}
          />
        ) : null}
        {isSnakeOpen ? (
          <SnakeMiniGame
            open
            roomId={effectiveSocketRoomId}
            // eslint-disable-next-line react-hooks/refs -- гра підписується на поточний (живий) сокет кімнати; зміна isSocketConnected перерендерює сторінку
            socket={isSocketConnected ? socketRef.current : null}
            userId={user?.id ?? ""}
            myScore={mySnakeScore}
            peerScore={peerSnakeScore}
            peerName={
              directChatTargetUser?.nickname ??
              directChatTargetUser?.username ??
              "Собеседник"
            }
            peerState={peerSnakeState}
            pingMs={gamePingMs}
            onClose={() => setIsSnakeOpen(false)}
            onScoreChange={handleSnakeScoreChange}
            onStateChange={handleSnakeStateChange}
            onModeChange={setSnakeMode}
          />
        ) : null}
        {isFilwordOpen ? (
          <ChristianFilwordMiniGame
            open
            onClose={() => setIsFilwordOpen(false)}
          />
        ) : null}
        {isGuessOpen ? (
          <GuessCharacterMiniGame
            open
            roomId={effectiveSocketRoomId}
            // eslint-disable-next-line react-hooks/refs -- як і Snake: підписуємось на поточний живий сокет кімнати
            socket={isSocketConnected ? socketRef.current : null}
            userId={user?.id ?? ""}
            peerName={
              directChatTargetUser?.nickname ??
              directChatTargetUser?.username ??
              "Собеседник"
            }
            onClose={() => setIsGuessOpen(false)}
          />
        ) : null}
        {isPuzzleOpen ? (
          <PuzzleMiniGame
            open
            roomId={effectiveSocketRoomId}
            // eslint-disable-next-line react-hooks/refs -- як і Snake: підписуємось на поточний живий сокет кімнати
            socket={isSocketConnected ? socketRef.current : null}
            userId={user?.id ?? ""}
            peerName={
              directChatTargetUser?.nickname ??
              directChatTargetUser?.username ??
              "Собеседник"
            }
            myName={user?.nickname ?? user?.username}
            myAvatarUrl={resolvePublicAvatarUrl(user?.avatarUrl)}
            peerAvatarUrl={resolvePublicAvatarUrl(directChatTargetUser?.avatarUrl)}
            onClose={() => setIsPuzzleOpen(false)}
          />
        ) : null}
      </section>
    </div>
  );
}
