
import { createClient } from "npm:@supabase/supabase-js@2";

const ALLOWED_ORIGIN = "https://gsagasgasgasgzz.github.io";

const corsHeaders = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
  "Vary": "Origin",
};

function respond(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

Deno.serve(async (req: Request) => {
  // Handle browser preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }

  // Only accept requests from the configured website.
  // Origin checks are not authentication.
  const origin = req.headers.get("Origin");

  if (origin !== ALLOWED_ORIGIN) {
    return respond({ error: "Origin not allowed" }, 403);
  }

  if (req.method !== "POST") {
    return respond({ error: "Method not allowed" }, 405);
  }

  try {
    const raw = await req.text();

    if (raw.length > 4000) {
      return respond({ error: "Request too large" }, 413);
    }

    let body: Record<string, unknown>;

    try {
      const parsed: unknown = JSON.parse(raw);

      if (
        !parsed ||
        typeof parsed !== "object" ||
        Array.isArray(parsed)
      ) {
        return respond({ error: "Invalid JSON body" }, 400);
      }

      body = parsed as Record<string, unknown>;
    } catch {
      return respond({ error: "Invalid JSON" }, 400);
    }

    const action = body.action;

    const validActions = [
      "list",
      "create",
      "update",
      "delete",
      "restore",
    ];

    if (
      typeof action !== "string" ||
      !validActions.includes(action)
    ) {
      return respond({ error: "Invalid action" }, 400);
    }

    const url = Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!url || !key) {
      return respond(
        { error: "Server is not configured" },
        500
      );
    }

    const db = createClient(url, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    // Read registry, trash and recent history
    if (action === "list") {
      const [lettersResult, historyResult] =
        await Promise.all([
          db
            .from("letters")
            .select(
              "id,number_key,number_display,owner,note,version,created_at,updated_at,deleted_at"
            )
            .order("number_key", { ascending: true })
            .limit(3000),

          db
            .from("letter_history")
            .select(
              "id,action,version,snapshot,created_at"
            )
            .order("created_at", { ascending: false })
            .limit(100),
        ]);

      if (lettersResult.error || historyResult.error) {
        console.error(
          "Database read failed",
          lettersResult.error || historyResult.error
        );

        return respond(
          { error: "Database read failed" },
          500
        );
      }

      const records = lettersResult.data || [];
      const history = historyResult.data || [];

      return respond({
        records: records.filter(
          (record) => !record.deleted_at
        ),
        trash: records.filter(
          (record) => Boolean(record.deleted_at)
        ),
        history,
      });
    }

    // Validate new and edited records
    if (action === "create" || action === "update") {
      if (
        typeof body.number !== "string" ||
        !/^\d{1,8}$/.test(body.number) ||
        typeof body.owner !== "string" ||
        !body.owner.trim() ||
        body.owner.length > 100 ||
        typeof body.note !== "string" ||
        body.note.length > 500
      ) {
        return respond(
          { error: "ข้อมูลทะเบียนจดหมายไม่ถูกต้อง" },
          400
        );
      }
    }

    // Validate record ID and version
    if (action !== "create") {
      if (
        typeof body.id !== "string" ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          body.id
        ) ||
        typeof body.expectedVersion !== "number" ||
        !Number.isInteger(body.expectedVersion) ||
        body.expectedVersion < 1
      ) {
        return respond(
          { error: "Invalid record or version" },
          400
        );
      }
    }

    // Mutate registry through PostgreSQL function
    const { data, error } = await db.rpc(
      "registry_mutate",
      {
        p_action: action,
        p_id: action === "create" ? null : body.id,
        p_expected_version:
          action === "create"
            ? null
            : body.expectedVersion,
        p_number:
          typeof body.number === "string"
            ? body.number
            : null,
        p_owner:
          typeof body.owner === "string"
            ? body.owner
            : null,
        p_note:
          typeof body.note === "string"
            ? body.note
            : null,
      }
    );

    if (error) {
      console.error("Registry mutation failed", error);

      return respond(
        { error: error.message },
        409
      );
    }

    return respond(data);
  } catch (error) {
    console.error("Unexpected registry error", error);

    return respond(
      { error: "Internal server error" },
      500
    );
  }
});
