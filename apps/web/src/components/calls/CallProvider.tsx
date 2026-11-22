"use client";

import dynamic from "next/dynamic";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Phone, PhoneOff } from "lucide-react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/hooks/useAuth";
import { pickCallSocket, registerCallSocket, subscribeCallSockets, type Socket } from "@/lib/calls/callSocketRegistry";
import { installCallAudioUnlock, startCallSound, stopCallSound } from "@/lib/calls/callSounds";
import { usePresenceSocket } from "@/components/PresenceSocket/PresenceSocket";
import { track } from "@/lib/analytics";
import styles from "./CallProvider.module.scss";

const CallScreen = dynamic(() => import("./CallScreen"), { ssr: false });
const IncomingCallModal = dynamic(() => import("./IncomingCallModal"), { ssr: false });

export type CallPeer = { id: string; name: string; avatarUrl?: string | null };

type CallInfo = { callId?: string; channelName: string; peer: CallPeer; roomId?: string };

type Notice = { key: string; text: string };

type CallContextValue = {
  /** Звоним сейчас (ждём ответа). */
  outgoing: CallInfo | null;
  incoming: CallInfo | null;
  active: CallInfo | null;
  /** Запустить звонок из личного чата. false - звонок не стартовал (нет сокета и т. п.). */
  startCall: (input: { targetUserId: string; peer: CallPeer; roomId?: string }) => boolean;
  cancelOutgoing: () => void;
};

const CallContext = createContext<CallContextValue>({
  outgoing: null,
  incoming: null,
  active: null,
  startCall: () => false,
  cancelOutgoing: () => undefined,
});

export function useCalls() {
  return useContext(CallContext);
}

/** Запас поверх серверного таймаута: если сервер молчит, звонящий всё равно выйдет из «Звоним…». */
const OUTGOING_FALLBACK_MS = 50_000;
const NOTICE_MS = 4500;
const VIBRATE_PATTERN = [420, 220, 420];
const VIBRATE_EVERY_MS = 2600;

type IncomingPayload = {
  callId?: string;
  channelName?: string;
  roomId?: string;
  initiator?: { id?: string; name?: string; nickname?: string | null; username?: string; avatarUrl?: string | null };
};

type IdPayload = { callId?: string; channelName?: string };

function peerFromInitiator(i: IncomingPayload["initiator"], fallback: string): CallPeer {
  return {
    id: i?.id ?? "",
    name: i?.name || i?.nickname || i?.username || fallback,
    avatarUrl: i?.avatarUrl ?? null,
  };
}

/**
 * Сигналинг звонков для всего приложения: входящий звонок виден на любой странице, а не только в чате. Слушает все
 * сокеты пользователя (присутствие и сокет страницы чата, см. callSocketRegistry), хранит состояние звонка, играет
 * мелодии и показывает экраны. Agora и сам CallScreen не менялись.
 */
export default function CallProvider({ children }: { children: ReactNode }) {
  const t = useTranslations("calls");
  const { user } = useAuth();
  const presence = usePresenceSocket();

  const [outgoing, setOutgoing] = useState<CallInfo | null>(null);
  const [incoming, setIncoming] = useState<CallInfo | null>(null);
  const [active, setActive] = useState<CallInfo | null>(null);
  const [overlayVisible, setOverlayVisible] = useState(true);
  const [notice, setNotice] = useState<Notice | null>(null);

  const outgoingRef = useRef<CallInfo | null>(null);
  const incomingRef = useRef<CallInfo | null>(null);
  const activeRef = useRef<CallInfo | null>(null);
  const ringtoneOnRef = useRef(true);
  const fallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const vibrateTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  /** Звонок из push: после call-sync принять/отклонить автоматически, если нажали кнопку в уведомлении. */
  const pendingUrlRef = useRef<{ callId: string; action: "accept" | "decline" | null } | null>(null);
  const tRef = useRef(t);

  useEffect(() => {
    tRef.current = t;
  }, [t]);
  useEffect(() => {
    outgoingRef.current = outgoing;
  }, [outgoing]);
  useEffect(() => {
    incomingRef.current = incoming;
  }, [incoming]);
  useEffect(() => {
    activeRef.current = active;
  }, [active]);
  // «Звук звонка» из профиля; по умолчанию включён
  useEffect(() => {
    ringtoneOnRef.current = user?.callRingtone !== false;
  }, [user?.callRingtone]);

  useEffect(() => {
    installCallAudioUnlock();
  }, []);

  // сокет присутствия тоже слушаем (на странице чата вместо него работает сокет самой страницы)
  useEffect(() => {
    if (!presence.socket) return;
    return registerCallSocket(presence.socket);
  }, [presence.socket]);

  const showNotice = useCallback((text: string) => {
    setNotice({ key: `${Date.now()}`, text });
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = setTimeout(() => setNotice(null), NOTICE_MS);
  }, []);

  const stopVibration = useCallback(() => {
    if (vibrateTimerRef.current) clearInterval(vibrateTimerRef.current);
    vibrateTimerRef.current = null;
    try {
      navigator.vibrate?.(0);
    } catch {
      // вибрация поддерживается не везде
    }
  }, []);

  const startVibration = useCallback(() => {
    if (vibrateTimerRef.current) return;
    const buzz = () => {
      try {
        if (document.visibilityState === "visible") navigator.vibrate?.(VIBRATE_PATTERN);
      } catch {
        // iOS не поддерживает
      }
    };
    buzz();
    vibrateTimerRef.current = setInterval(buzz, VIBRATE_EVERY_MS);
  }, []);

  const clearFallback = useCallback(() => {
    if (fallbackTimerRef.current) clearTimeout(fallbackTimerRef.current);
    fallbackTimerRef.current = null;
  }, []);

  const emit = useCallback((event: string, payload: unknown) => {
    const socket = pickCallSocket();
    if (!socket) return false;
    socket.emit(event, payload);
    return true;
  }, []);

  const clearOutgoing = useCallback(() => {
    clearFallback();
    outgoingRef.current = null;
    setOutgoing(null);
    stopCallSound();
  }, [clearFallback]);

  const clearIncoming = useCallback(() => {
    incomingRef.current = null;
    setIncoming(null);
    stopCallSound();
    stopVibration();
  }, [stopVibration]);

  // мелодия и вибрация следуют за состоянием: входящий - рингтон, исходящий - гудок, иначе тишина
  useEffect(() => {
    if (incoming) {
      if (ringtoneOnRef.current) startCallSound("incoming");
      startVibration();
    } else if (outgoing) {
      if (ringtoneOnRef.current) startCallSound("outgoing");
    } else {
      stopCallSound();
      stopVibration();
    }
  }, [incoming, outgoing, startVibration, stopVibration]);

  const accept = useCallback(() => {
    const call = incomingRef.current;
    if (!call) return;
    emit("call-response", { callId: call.callId, initiatorId: call.peer.id, channelName: call.channelName, accepted: true });
    track("call_answered");
    clearIncoming();
    activeRef.current = call;
    setActive(call);
    setOverlayVisible(true);
  }, [clearIncoming, emit]);

  const decline = useCallback(() => {
    const call = incomingRef.current;
    if (!call) return;
    emit("call-response", { callId: call.callId, initiatorId: call.peer.id, channelName: call.channelName, accepted: false });
    track("call_declined");
    clearIncoming();
  }, [clearIncoming, emit]);

  const matches = (call: CallInfo | null, p: IdPayload | undefined) =>
    Boolean(call && p && ((p.callId && call.callId && p.callId === call.callId) || (!p.callId && p.channelName === call.channelName)));

  // ---------- слушатели событий на каждом зарегистрированном сокете ----------
  useEffect(() => {
    const detachers = new Map<Socket, () => void>();

    const attach = (socket: Socket) => {
      const onIncoming = (p: IncomingPayload) => {
        if (!p?.channelName) return;
        const cur = incomingRef.current;
        if (cur && ((p.callId && cur.callId === p.callId) || cur.channelName === p.channelName)) return; // дубль с другого сокета
        if (activeRef.current) return; // уже в разговоре; сервер такого не допускает, это защита
        const call: CallInfo = {
          callId: p.callId,
          channelName: p.channelName,
          peer: peerFromInitiator(p.initiator, tRef.current("unknownCaller")),
          roomId: p.roomId,
        };
        incomingRef.current = call;
        setIncoming(call);
        const pending = pendingUrlRef.current;
        if (pending && pending.callId === p.callId) {
          pendingUrlRef.current = null;
          if (pending.action === "accept") queueMicrotask(accept);
          else if (pending.action === "decline") queueMicrotask(decline);
        }
      };
      const onSent = (p: IdPayload) => {
        const cur = outgoingRef.current;
        if (!cur || cur.channelName !== p?.channelName || !p.callId || cur.callId) return;
        const next = { ...cur, callId: p.callId };
        outgoingRef.current = next;
        setOutgoing(next);
      };
      const onAccepted = (p: IdPayload) => {
        const cur = outgoingRef.current;
        if (!matches(cur, p) || !cur) return;
        clearOutgoing();
        activeRef.current = cur;
        setActive(cur);
        setOverlayVisible(true);
      };
      const onDeclined = (p: IdPayload) => {
        if (!matches(outgoingRef.current, p)) return;
        clearOutgoing();
        showNotice(tRef.current("declined"));
      };
      const onCancelled = (p: IdPayload) => {
        if (matches(incomingRef.current, p)) {
          clearIncoming();
          showNotice(tRef.current("cancelled"));
        } else if (matches(outgoingRef.current, p)) {
          clearOutgoing();
        }
      };
      const onMissed = (p: IdPayload) => {
        if (matches(incomingRef.current, p) || matches(outgoingRef.current, p)) {
          track("call_missed");
        }
        if (matches(incomingRef.current, p)) {
          clearIncoming();
          showNotice(tRef.current("missed"));
        } else if (matches(outgoingRef.current, p)) {
          clearOutgoing();
          showNotice(tRef.current("noAnswer"));
        }
      };
      const onBusy = (p: IdPayload) => {
        if (outgoingRef.current && (!p?.channelName || p.channelName === outgoingRef.current.channelName)) {
          clearOutgoing();
          showNotice(tRef.current("busy"));
        }
      };
      const onUnavailable = (p: IdPayload) => {
        if (outgoingRef.current && (!p?.channelName || p.channelName === outgoingRef.current.channelName)) {
          clearOutgoing();
          showNotice(tRef.current("unavailable"));
        }
      };
      const onHandled = (p: IdPayload) => {
        if (matches(incomingRef.current, p)) clearIncoming();
      };
      const onState = (p: { callId?: string; ended?: boolean }) => {
        if (!p?.callId || !p.ended) return;
        if (incomingRef.current?.callId === p.callId) {
          clearIncoming();
          return;
        }
        if (pendingUrlRef.current?.callId === p.callId) {
          pendingUrlRef.current = null;
          showNotice(tRef.current("ended"));
        }
      };
      const onError = (p: { error?: string; code?: string }) => {
        if (!outgoingRef.current) return;
        clearOutgoing();
        const code = p?.code;
        const map: Record<string, string> = {
          cooldown: "cooldown",
          "rate-limited": "rateLimited",
          "caller-busy": "alreadyInCall",
          "callee-busy": "busy",
          "not-participant": "notParticipant",
          unavailable: "unavailable",
        };
        showNotice(code && map[code] ? tRef.current(map[code]) : p?.error?.trim() || tRef.current("failed"));
      };
      // сокет (пере)подключился: узнаём, не звонит ли нам кто-то прямо сейчас (приложение открыли по push)
      const onConnect = () => {
        socket.emit("call-sync", pendingUrlRef.current ? { callId: pendingUrlRef.current.callId } : {});
      };

      socket.on("incoming-call", onIncoming);
      socket.on("call-user-sent", onSent);
      socket.on("call-accepted", onAccepted);
      socket.on("call-declined", onDeclined);
      socket.on("call-cancelled", onCancelled);
      socket.on("call-missed", onMissed);
      socket.on("call-busy", onBusy);
      socket.on("call-unavailable", onUnavailable);
      socket.on("call-handled", onHandled);
      socket.on("call-state", onState);
      socket.on("call-error", onError);
      socket.on("connect", onConnect);
      if (socket.connected) onConnect();
      return () => {
        socket.off("incoming-call", onIncoming);
        socket.off("call-user-sent", onSent);
        socket.off("call-accepted", onAccepted);
        socket.off("call-declined", onDeclined);
        socket.off("call-cancelled", onCancelled);
        socket.off("call-missed", onMissed);
        socket.off("call-busy", onBusy);
        socket.off("call-unavailable", onUnavailable);
        socket.off("call-handled", onHandled);
        socket.off("call-state", onState);
        socket.off("call-error", onError);
        socket.off("connect", onConnect);
      };
    };

    const unsubscribe = subscribeCallSockets((sockets) => {
      for (const [socket, detach] of detachers) {
        if (!sockets.has(socket)) {
          detach();
          detachers.delete(socket);
        }
      }
      for (const socket of sockets) if (!detachers.has(socket)) detachers.set(socket, attach(socket));
    });
    return () => {
      unsubscribe();
      for (const detach of detachers.values()) detach();
      detachers.clear();
    };
  }, [accept, clearIncoming, clearOutgoing, decline, showNotice]);

  // ---------- открытие по push: ?call=<id>[&callAction=accept|decline] и сообщение от service worker ----------
  const handlePushCall = useCallback((callId: string, action: "accept" | "decline" | null) => {
    pendingUrlRef.current = { callId, action };
    const socket = pickCallSocket();
    if (socket) socket.emit("call-sync", { callId });
  }, []);

  useEffect(() => {
    try {
      const url = new URL(window.location.href);
      const callId = url.searchParams.get("call");
      if (!callId) return;
      const raw = url.searchParams.get("callAction");
      handlePushCall(callId, raw === "accept" || raw === "decline" ? raw : null);
      url.searchParams.delete("call");
      url.searchParams.delete("callAction");
      window.history.replaceState(window.history.state, "", url.toString());
    } catch {
      // некорректный URL: звонок просто не подхватываем
    }
  }, [handlePushCall]);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; callId?: string; action?: string } | null;
      if (data?.type !== "CALL_ACTION" || !data.callId) return;
      handlePushCall(data.callId, data.action === "accept" || data.action === "decline" ? data.action : null);
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, [handlePushCall]);

  // ---------- действия ----------
  const startCall = useCallback<CallContextValue["startCall"]>(
    ({ targetUserId, peer, roomId }) => {
      const me = user?.id;
      if (!me || outgoingRef.current || incomingRef.current || activeRef.current) return false;
      // имя канала прежнее (dm-<8>-<8>): CallScreen и Agora как раньше
      const channelName = `dm-${[me.slice(0, 8), targetUserId.slice(0, 8)].sort().join("-")}`;
      if (!emit("call-user", { targetUserId, channelName, v: 2 })) return false;
      track("call_started");
      const call: CallInfo = { channelName, peer, roomId };
      outgoingRef.current = call;
      setOutgoing(call);
      clearFallback();
      fallbackTimerRef.current = setTimeout(() => {
        if (!outgoingRef.current) return;
        clearOutgoing();
        showNotice(tRef.current("noAnswer"));
      }, OUTGOING_FALLBACK_MS);
      return true;
    },
    [clearFallback, clearOutgoing, emit, showNotice, user?.id],
  );

  const cancelOutgoing = useCallback(() => {
    const call = outgoingRef.current;
    if (!call) return;
    emit("call-cancel", { callId: call.callId });
    clearOutgoing();
  }, [clearOutgoing, emit]);

  const handleCallEnded = useCallback((durationSeconds: number) => {
    // как раньше: итог разговора пишется в личный чат (теперь по roomId звонка, а не по открытой странице)
    const call = activeRef.current;
    track("call_ended", { duration_s: Math.round(durationSeconds) });
    const socket = pickCallSocket();
    if (!call?.roomId || !socket) return;
    const minutes = Math.floor(durationSeconds / 60);
    const content = minutes < 1 ? tRef.current("endedShort") : tRef.current("endedMinutes", { minutes });
    socket.emit("sendMessage", { roomId: call.roomId, content });
  }, []);

  const closeActive = useCallback(() => {
    const call = activeRef.current;
    if (call) emit("call-end", { callId: call.callId });
    activeRef.current = null;
    setActive(null);
    setOverlayVisible(true);
  }, [emit]);

  useEffect(
    () => () => {
      clearFallback();
      if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
      stopCallSound();
      stopVibration();
    },
    [clearFallback, stopVibration],
  );

  const value = useMemo<CallContextValue>(
    () => ({ outgoing, incoming, active, startCall, cancelOutgoing }),
    [outgoing, incoming, active, startCall, cancelOutgoing],
  );

  return (
    <CallContext.Provider value={value}>
      {children}
      <IncomingCallModal open={Boolean(incoming)} callerName={incoming?.peer.name ?? ""} onAccept={accept} onDecline={decline} />
      {outgoing ? (
        <div className={styles.calling} role="status" aria-live="polite">
          <Phone size={15} strokeWidth={2.2} aria-hidden />
          <span>{t("calling", { name: outgoing.peer.name })}</span>
          <button type="button" className={styles.callingCancel} onClick={cancelOutgoing} aria-label={t("cancel")}>
            <PhoneOff size={15} strokeWidth={2.2} aria-hidden />
          </button>
        </div>
      ) : null}
      {notice ? (
        <div key={notice.key} className={styles.notice} role="status" aria-live="polite">
          {notice.text}
        </div>
      ) : null}
      {active && !overlayVisible ? (
        <button type="button" className={styles.returnButton} onClick={() => setOverlayVisible(true)} aria-label={t("returnToCall")} title={t("returnToCall")}>
          <Phone size={15} strokeWidth={2.25} aria-hidden />
          <span>{t("returnToCall")}</span>
        </button>
      ) : null}
      <CallScreen
        isOpen={Boolean(active?.channelName)}
        isVisible={overlayVisible}
        channelName={active?.channelName ?? null}
        peerName={active?.peer.name ?? ""}
        peerAvatarUrl={active?.peer.avatarUrl ?? null}
        onMinimize={() => setOverlayVisible(false)}
        onClose={closeActive}
        onCallEnded={handleCallEnded}
      />
    </CallContext.Provider>
  );
}
