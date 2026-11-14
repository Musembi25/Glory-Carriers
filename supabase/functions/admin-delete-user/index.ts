import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};
const allowedBuckets = new Set(["profile-photos", "discipleship-submissions", "bible-study-audio"]);
const userIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unexpected error";
}

serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (request.method !== "POST") {
    return jsonResponse({ error: "Use POST to delete member accounts." }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return jsonResponse({ error: "The secure member-deletion service is not configured." }, 500);
  }

  const authHeader = request.headers.get("Authorization");
  if (!authHeader) {
    return jsonResponse({ error: "Sign in with a Super Admin account before deleting members." }, 401);
  }

  try {
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false }
    });
    const { data: authData, error: authError } = await callerClient.auth.getUser();
    if (authError || !authData.user) {
      return jsonResponse({ error: "Your session could not be verified. Sign in again and retry." }, 401);
    }

    const { data: isSuperAdmin, error: roleError } = await callerClient.rpc("is_super_admin");
    if (roleError || isSuperAdmin !== true) {
      return jsonResponse({ error: "Only an active Super Admin can permanently delete member accounts." }, 403);
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return jsonResponse({ error: "The deletion request was not valid JSON." }, 400);
    }
    const requestBody = body as { userIds?: unknown; retryStorageCleanup?: unknown } | null;
    const retryStorageCleanup = requestBody?.retryStorageCleanup === true;
    const userIds = requestBody?.userIds;
    if (!retryStorageCleanup && (!Array.isArray(userIds) || userIds.length < 1 || userIds.length > 500
      || userIds.some((id) => typeof id !== "string" || !userIdPattern.test(id)))) {
      return jsonResponse({ error: "Select between 1 and 500 valid member accounts." }, 400);
    }

    const uniqueUserIds = retryStorageCleanup ? [] : [...new Set(userIds as string[])];
    const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
    let deletionResult: { deleted_ids?: string[]; already_missing_count?: number } | null = null;
    if (!retryStorageCleanup) {
      const { data, error: deletionError } = await callerClient.rpc("super_admin_delete_members", {
        target_user_ids: uniqueUserIds
      });
      if (deletionError) {
        return jsonResponse({ error: deletionError.message || "The selected member accounts could not be deleted." }, 400);
      }
      deletionResult = data;
    }

    let pendingRows: unknown;
    let pendingError = false;
    try {
      const result = await callerClient.rpc("super_admin_get_pending_storage_deletions");
      pendingRows = result.data;
      pendingError = Boolean(result.error);
    } catch {
      pendingError = true;
    }
    if (pendingError || !Array.isArray(pendingRows)) {
      return jsonResponse({
        success: true,
        deletedIds: deletionResult?.deleted_ids ?? [],
        alreadyMissingCount: deletionResult?.already_missing_count ?? 0,
        storageCleanupPending: true,
        storageCleanupPendingCount: null,
        storageCleanupWarnings: ["Account records were deleted, but queued file cleanup could not be checked."]
      });
    }

    const queueRows = pendingRows as Array<{ queue_id: string; bucket_id: string; object_path: string }>;
    const removedQueueIds = new Set<string>();
    const clearedQueueIds = new Set<string>();
    const cleanupWarnings: string[] = [];

    for (const bucketId of allowedBuckets) {
      const bucketRows = queueRows.filter((row) => row.bucket_id === bucketId);
      for (let offset = 0; offset < bucketRows.length; offset += 100) {
        const batch = bucketRows.slice(offset, offset + 100);
        const paths = batch.map((row) => row.object_path);
        try {
          const { error: storageError } = await serviceClient.storage.from(bucketId).remove(paths);
          if (storageError) {
            cleanupWarnings.push(`Some files in ${bucketId} could not be removed and remain queued.`);
            continue;
          }
          for (const row of batch) removedQueueIds.add(row.queue_id);
        } catch {
          cleanupWarnings.push(`Some files in ${bucketId} could not be removed and remain queued.`);
        }
      }
    }

    const completedIds = [...removedQueueIds];
    for (let offset = 0; offset < completedIds.length; offset += 100) {
      const batchIds = completedIds.slice(offset, offset + 100);
      try {
        const { error: completionError } = await callerClient.rpc("super_admin_complete_storage_deletions", {
          target_queue_ids: batchIds
        });
        if (completionError) {
          cleanupWarnings.push("Some removed files remain in the cleanup queue and will be retried.");
        } else {
          for (const id of batchIds) clearedQueueIds.add(id);
        }
      } catch {
        cleanupWarnings.push("Some removed files remain in the cleanup queue and will be retried.");
      }
    }

    const pendingCount = Math.max(0, queueRows.length - clearedQueueIds.size);
    return jsonResponse({
      success: true,
      deletedIds: deletionResult?.deleted_ids ?? [],
      alreadyMissingCount: deletionResult?.already_missing_count ?? 0,
      storageCleanupPending: pendingCount > 0 || cleanupWarnings.length > 0,
      storageCleanupPendingCount: pendingCount,
      storageCleanupWarnings: [...new Set(cleanupWarnings)]
    });
  } catch (error) {
    return jsonResponse({ error: getErrorMessage(error) }, 500);
  }
});
