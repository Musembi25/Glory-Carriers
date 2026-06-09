import { supabase } from "./supabase.js";

const INTERACTIONS_KEY = "glory-carriers-meaningful-interactions";
const PROMPT_DISMISSED_KEY = "glory-carriers-push-prompt-dismissed";
const PROMPT_READY_THRESHOLD = 2;

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let index = 0; index < rawData.length; index += 1) {
    outputArray[index] = rawData.charCodeAt(index);
  }

  return outputArray;
}

export function getBrowserNotificationPermission() {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "unsupported";
  }

  return window.Notification.permission;
}

export function isPushSupported() {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export function detectPushPlatform() {
  if (typeof navigator === "undefined") {
    return "unknown";
  }

  const userAgent = navigator.userAgent || "";

  if (/iPad|Tablet/i.test(userAgent)) {
    return "tablet";
  }

  if (/iPhone|iPod/i.test(userAgent)) {
    return "ios";
  }

  if (/Android/i.test(userAgent)) {
    return "android";
  }

  if (/Windows|Macintosh|Linux/i.test(userAgent) && !/Mobile/i.test(userAgent)) {
    return "desktop";
  }

  return "web";
}

export function getMeaningfulInteractionCount() {
  return Number(window.localStorage.getItem(INTERACTIONS_KEY) || 0);
}

export function recordMeaningfulInteraction() {
  const nextCount = getMeaningfulInteractionCount() + 1;
  window.localStorage.setItem(INTERACTIONS_KEY, String(nextCount));
  return nextCount;
}

export function shouldShowPushPermissionPrompt() {
  if (!isPushSupported()) {
    return false;
  }

  if (getBrowserNotificationPermission() !== "default") {
    return false;
  }

  if (window.localStorage.getItem(PROMPT_DISMISSED_KEY) === "true") {
    return false;
  }

  return getMeaningfulInteractionCount() >= PROMPT_READY_THRESHOLD;
}

export function dismissPushPermissionPrompt() {
  window.localStorage.setItem(PROMPT_DISMISSED_KEY, "true");
}

export async function getServiceWorkerRegistration() {
  if (!("serviceWorker" in navigator)) {
    return null;
  }

  return navigator.serviceWorker.ready;
}

export async function subscribeToPushNotifications(userId) {
  if (!supabase || !userId || !isPushSupported()) {
    return { ok: false, reason: "unsupported" };
  }

  const vapidPublicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;

  if (!vapidPublicKey) {
    return { ok: false, reason: "missing-vapid-key" };
  }

  const permission = await window.Notification.requestPermission();

  if (permission !== "granted") {
    return { ok: false, reason: permission };
  }

  const registration = await getServiceWorkerRegistration();

  if (!registration?.pushManager) {
    return { ok: false, reason: "no-push-manager" };
  }

  let subscription = await registration.pushManager.getSubscription();

  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey)
    });
  }

  const json = subscription.toJSON();
  const platform = detectPushPlatform();
  const deviceLabel =
    platform === "ios"
      ? "iPhone"
      : platform === "android"
        ? "Android"
        : platform === "desktop"
          ? "Desktop"
          : platform === "tablet"
            ? "Tablet"
            : "Browser";

  const { error } = await supabase.from("push_subscriptions").upsert(
    [
      {
        user_id: userId,
        endpoint: subscription.endpoint,
        p256dh: json.keys?.p256dh,
        auth: json.keys?.auth,
        platform,
        user_agent: navigator.userAgent?.slice(0, 500) || "",
        device_label: deviceLabel,
        last_active_at: new Date().toISOString()
      }
    ],
    { onConflict: "user_id,endpoint" }
  );

  if (error) {
    throw error;
  }

  await supabase.rpc("ensure_notification_preferences");

  return { ok: true, permission, subscription };
}

export async function refreshPushSubscriptionActivity(userId) {
  if (!supabase || !userId || !isPushSupported()) {
    return;
  }

  const registration = await getServiceWorkerRegistration();
  const subscription = await registration?.pushManager?.getSubscription();

  if (!subscription) {
    return;
  }

  await supabase
    .from("push_subscriptions")
    .update({ last_active_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("endpoint", subscription.endpoint);
}

export async function unsubscribeFromPushNotifications(userId) {
  if (!supabase || !userId) {
    return;
  }

  const registration = await getServiceWorkerRegistration();
  const subscription = await registration?.pushManager?.getSubscription();

  if (subscription) {
    await supabase
      .from("push_subscriptions")
      .delete()
      .eq("user_id", userId)
      .eq("endpoint", subscription.endpoint);

    await subscription.unsubscribe();
  }
}

export function listenForNotificationClicks(callback) {
  if (!("serviceWorker" in navigator)) {
    return () => {};
  }

  function handleMessage(event) {
    if (event.data?.type === "NOTIFICATION_CLICK") {
      callback(event.data.payload ?? {});
    }
  }

  navigator.serviceWorker.addEventListener("message", handleMessage);
  return () => navigator.serviceWorker.removeEventListener("message", handleMessage);
}
