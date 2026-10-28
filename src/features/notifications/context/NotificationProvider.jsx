import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDataScope } from "../../auth/context/dataScopeContextValue.js";
import { useProgression } from "../../progression/context/progressionContextValue.js";
import { useOptionalSync } from "../../sync/context/syncContextValue.js";
import { progressionNotificationInput, sortNotificationsNewestFirst, stableNotificationId } from "../data/notificationModel.js";
import { notificationRepository } from "../data/notificationRepository.js";
import { NotificationContext } from "./notificationContextValue.js";

const emptyState = { scopeKey: null, notifications: [], loading: true, error: "" };

function upsertNotification(notifications, notification) {
  return sortNotificationsNewestFirst([
    notification,
    ...notifications.filter((item) => item.id !== notification.id),
  ]);
}

export function NotificationProvider({ children }) {
  const scope = useDataScope();
  const progression = useProgression();
  const sync = useOptionalSync();
  const [state, setState] = useState(emptyState);
  const seenProgressionRef = useRef({ scopeKey: null, ids: new Set() });

  const publishNotification = useCallback(async (input) => {
    if (scope.status !== "ready") return null;
    const notification = await notificationRepository.create(input, { scopeKey: scope.scopeKey, ownerId: scope.ownerId });
    setState((previous) => previous.scopeKey === scope.scopeKey
      ? { ...previous, notifications: upsertNotification(previous.notifications, notification) }
      : previous);
    return notification;
  }, [scope.ownerId, scope.scopeKey, scope.status]);

  const refresh = useCallback(async () => {
    if (scope.status !== "ready") return [];
    try {
      const notifications = await notificationRepository.list({ scopeKey: scope.scopeKey, ownerId: scope.ownerId });
      setState((previous) => previous.scopeKey === scope.scopeKey
        ? { ...previous, notifications, loading: false, error: "" }
        : previous);
      return notifications;
    } catch (error) {
      setState((previous) => previous.scopeKey === scope.scopeKey
        ? { ...previous, loading: false, error: error?.message || "Oznámení se nepodařilo načíst." }
        : previous);
      return [];
    }
  }, [scope.ownerId, scope.scopeKey, scope.status]);

  useEffect(() => {
    let active = true;
    Promise.resolve().then(() => {
      if (!active) return;
      setState({ scopeKey: scope.scopeKey, notifications: [], loading: scope.status === "ready", error: "" });
      if (scope.status === "ready") void refresh();
    });
    return () => { active = false; };
  }, [refresh, scope.scopeKey, scope.status]);

  useEffect(() => {
    if (scope.status !== "ready" || progression.loading) return;
    const currentEvents = progression.events ?? [];
    const tracker = seenProgressionRef.current;
    if (tracker.scopeKey !== scope.scopeKey) {
      seenProgressionRef.current = { scopeKey: scope.scopeKey, ids: new Set(currentEvents.map((event) => event.id)) };
      return;
    }
    const newlySeen = currentEvents.filter((event) => event.id && !tracker.ids.has(event.id));
    for (const event of newlySeen) tracker.ids.add(event.id);
    for (const event of newlySeen) {
      const input = progressionNotificationInput(event, scope.scopeKey);
      if (input) void publishNotification(input).catch(() => {});
    }
  }, [progression.events, progression.loading, publishNotification, scope.scopeKey, scope.status]);

  useEffect(() => {
    if (scope.status !== "ready" || sync?.status !== "error") return;
    const day = new Date().toISOString().slice(0, 10);
    void publishNotification({
      id: stableNotificationId("sync", scope.scopeKey, sync.errorCode || "sync-problem", day),
      type: "sync_problem",
      title: "Synchronizace potřebuje pozornost",
      body: "Některé záznamy se nepodařilo synchronizovat. Místní data zůstávají uložená; zkus synchronizaci zopakovat.",
      createdAt: new Date().toISOString(),
      deepLink: "/profile",
    }).catch(() => {});
  }, [publishNotification, scope.scopeKey, scope.status, sync?.errorCode, sync?.status]);

  const markAsRead = useCallback(async (id) => {
    const notification = await notificationRepository.markRead(id, { scopeKey: scope.scopeKey, ownerId: scope.ownerId });
    setState((previous) => previous.scopeKey === scope.scopeKey
      ? { ...previous, notifications: sortNotificationsNewestFirst(previous.notifications.map((item) => item.id === id ? notification : item)) }
      : previous);
    return notification;
  }, [scope.ownerId, scope.scopeKey]);

  const markAllAsRead = useCallback(async () => {
    const notifications = await notificationRepository.markAllAsRead({ scopeKey: scope.scopeKey, ownerId: scope.ownerId });
    setState((previous) => previous.scopeKey === scope.scopeKey ? { ...previous, notifications } : previous);
    return notifications;
  }, [scope.ownerId, scope.scopeKey]);

  const notifications = useMemo(() => state.scopeKey === scope.scopeKey ? state.notifications : [], [scope.scopeKey, state.notifications, state.scopeKey]);
  const unreadCount = notifications.reduce((count, notification) => count + (notification.readAt ? 0 : 1), 0);
  const value = useMemo(() => ({
    notifications,
    unreadCount,
    loading: state.scopeKey !== scope.scopeKey || state.loading,
    error: state.scopeKey === scope.scopeKey ? state.error : "",
    refresh,
    publishNotification,
    markAsRead,
    markAllAsRead,
  }), [markAllAsRead, markAsRead, notifications, publishNotification, refresh, scope.scopeKey, state.error, state.loading, state.scopeKey, unreadCount]);
  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
}
