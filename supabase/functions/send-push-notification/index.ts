import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-webhook-secret"
};

const ASSIGNMENT_TYPES = new Set([
  "discipleship_assignment_posted",
  "discipleship_assignment_due",
  "discipleship_assignment_feedback",
  "discipleship_assignment_approved",
  "discipleship_assignment_revision"
]);

const MEETING_TYPES = new Set([
  "virtual_meeting_scheduled",
  "virtual_meeting_reminder",
  "virtual_meeting_starting"
]);

const EVENT_TYPES = new Set(["event_created", "event_reminder"]);

const DISCIPLESHIP_TYPES = new Set([
  "discipleship_class_created",
  "discipleship_class_reminder",
  "discipleship_class_starting",
  "discipleship_lesson_added",
  "discipleship_enrollment_approved"
]);

function getCategory(notificationType: string) {
  if (EVENT_TYPES.has(notificationType)) return "events";
  if (MEETING_TYPES.has(notificationType)) return "meetings";
  if (ASSIGNMENT_TYPES.has(notificationType)) return "assignments";
  if (DISCIPLESHIP_TYPES.has(notificationType)) return "discipleship";
  if (notificationType === "prayer_reminder") return "prayer";
  if (notificationType === "new_message") return "messages";
  if (notificationType === "announcement_posted") return "announcements";
  if (notificationType === "task_assigned") return "tasks";
  if (notificationType === "event_reminder") return "attendance";
  return "events";
}

function getSection(record: Record<string, unknown>) {
  const entityTable = String(record.entity_table || "");
  const notificationType = String(record.notification_type || "");

  if (entityTable === "virtual_meetings" || MEETING_TYPES.has(notificationType)) return "meetings";
  if (entityTable === "messages") return "messages";
  if (entityTable === "tasks") return "tasks";
  if (entityTable === "prayer_points") return "prayer";
  if (entityTable === "announcements") return "events";
  if (entityTable === "discipleship_classes" || entityTable === "discipleship_lessons") {
    return "discipleship";
  }
  if (entityTable === "events") return "events";
  return "events";
}

function getDiscipleshipTab(notificationType: string) {
  if (ASSIGNMENT_TYPES.has(notificationType)) return "assignments";
  if (notificationType === "discipleship_lesson_added") return "lessons";
  if (
    notificationType === "discipleship_class_starting" ||
    notificationType === "discipleship_class_reminder"
  ) {
    return "sessions";
  }
  return null;
}

function isQuietHours(preferences: Record<string, unknown>) {
  if (!preferences?.quiet_hours_enabled) {
    return false;
  }

  const start = String(preferences.quiet_hours_start || "22:00:00").slice(0, 5);
  const end = String(preferences.quiet_hours_end || "07:00:00").slice(0, 5);
  const timezone = String(preferences.timezone || "UTC");

  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });

  const nowParts = formatter.formatToParts(new Date());
  const hour = nowParts.find((part) => part.type === "hour")?.value || "00";
  const minute = nowParts.find((part) => part.type === "minute")?.value || "00";
  const current = `${hour}:${minute}`;

  if (start <= end) {
    return current >= start && current < end;
  }

  return current >= start || current < end;
}

function shouldSend(preferences: Record<string, unknown> | null, notificationType: string) {
  if (!preferences?.push_enabled) {
    return false;
  }

  if (isQuietHours(preferences)) {
    return false;
  }

  const category = getCategory(notificationType);
  const key = `${category}_enabled`;
  return preferences[key] !== false;
}

function buildLaunchUrl(record: Record<string, unknown>) {
  const params = new URLSearchParams();
  const section = getSection(record);
  const discipleshipTab = getDiscipleshipTab(String(record.notification_type || ""));
  const siteUrl = Deno.env.get("SITE_URL") || "";
  const basePath = siteUrl ? siteUrl.replace(/\/$/, "") : "";

  if (section) params.set("section", section);
  if (record.entity_id) params.set("entityId", String(record.entity_id));
  if (record.entity_table) params.set("entityTable", String(record.entity_table));
  if (record.notification_type) params.set("notificationType", String(record.notification_type));
  if (record.id) params.set("notificationId", String(record.id));
  if (discipleshipTab) params.set("discipleshipTab", discipleshipTab);

  const query = params.toString();
  if (!query) {
    return basePath || "/";
  }

  return `${basePath}/?${query}`;
}

async function sendWithRetry(
  subscription: { endpoint: string; p256dh: string; auth: string },
  payload: string,
  attempts = 3
) {
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await webpush.sendNotification(
        {
          endpoint: subscription.endpoint,
          keys: {
            p256dh: subscription.p256dh,
            auth: subscription.auth
          }
        },
        payload,
        { TTL: 60 * 60 * 24, urgency: "high" }
      );
      return { ok: true };
    } catch (error) {
      lastError = error;
      const statusCode = (error as { statusCode?: number })?.statusCode;
      if (statusCode === 404 || statusCode === 410) {
        return { ok: false, stale: true, error };
      }
      await new Promise((resolve) => setTimeout(resolve, attempt * 250));
    }
  }

  return { ok: false, stale: false, error: lastError };
}

serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY");
    const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY");
    const vapidSubject = Deno.env.get("VAPID_SUBJECT") || "mailto:admin@glorycarriers.app";
    const webhookSecret = Deno.env.get("PUSH_WEBHOOK_SECRET");

    if (!supabaseUrl || !serviceRoleKey || !vapidPublicKey || !vapidPrivateKey) {
      throw new Error("Missing push notification environment variables.");
    }

    if (webhookSecret) {
      const incomingSecret = request.headers.get("x-webhook-secret");
      if (incomingSecret !== webhookSecret) {
        return new Response(JSON.stringify({ error: "Invalid webhook secret." }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
    }

    webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

    const body = await request.json();
    const record = body.record || body.notification || body;

    if (!record?.user_id || !record?.title) {
      throw new Error("Notification record with user_id and title is required.");
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: preferences } = await adminClient
      .from("notification_preferences")
      .select("*")
      .eq("user_id", record.user_id)
      .maybeSingle();

    if (!shouldSend(preferences, String(record.notification_type || ""))) {
      return new Response(JSON.stringify({ skipped: true, reason: "preferences" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const { data: subscriptions, error: subscriptionsError } = await adminClient
      .from("push_subscriptions")
      .select("*")
      .eq("user_id", record.user_id);

    if (subscriptionsError) {
      throw subscriptionsError;
    }

    if (!subscriptions?.length) {
      return new Response(JSON.stringify({ sent: 0, reason: "no-subscriptions" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const payload = JSON.stringify({
      title: record.title,
      body: record.body || "",
      icon: "/icons/icon-192.png",
      tag: record.id,
      data: {
        notificationId: record.id,
        entityTable: record.entity_table,
        entityId: record.entity_id,
        notificationType: record.notification_type,
        section: getSection(record),
        discipleshipTab: getDiscipleshipTab(String(record.notification_type || "")),
        url: buildLaunchUrl(record)
      }
    });

    let sent = 0;
    const staleEndpoints: string[] = [];

    for (const subscription of subscriptions) {
      const result = await sendWithRetry(subscription, payload);

      if (result.ok) {
        sent += 1;
        await adminClient
          .from("push_subscriptions")
          .update({ last_active_at: new Date().toISOString() })
          .eq("id", subscription.id);
        continue;
      }

      if (result.stale) {
        staleEndpoints.push(subscription.endpoint);
      }
    }

    if (staleEndpoints.length) {
      await adminClient
        .from("push_subscriptions")
        .delete()
        .eq("user_id", record.user_id)
        .in("endpoint", staleEndpoints);
    }

    return new Response(JSON.stringify({ sent, stale: staleEndpoints.length }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unexpected push error"
      }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      }
    );
  }
});
