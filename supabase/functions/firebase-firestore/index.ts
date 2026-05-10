// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ---------- Service account & token cache ----------

let cachedSA: { client_email: string; private_key: string; project_id: string } | null = null;
function getSA() {
  if (cachedSA) return cachedSA;
  const raw = Deno.env.get("FIREBASE_SERVICE_ACCOUNT_JSON");
  if (!raw) throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON not set");
  const parsed = JSON.parse(raw);
  cachedSA = {
    client_email: parsed.client_email,
    private_key: String(parsed.private_key).replace(/\\n/g, "\n"),
    project_id: parsed.project_id,
  };
  return cachedSA;
}

function getProjectId(): string {
  return Deno.env.get("FIREBASE_PROJECT_ID") || getSA().project_id;
}

let cachedToken: { token: string; exp: number } | null = null;

function b64url(buf: ArrayBuffer | Uint8Array | string): string {
  let bytes: Uint8Array;
  if (typeof buf === "string") bytes = new TextEncoder().encode(buf);
  else if (buf instanceof Uint8Array) bytes = buf;
  else bytes = new Uint8Array(buf);
  let s = btoa(String.fromCharCode(...bytes));
  return s.replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function pemToPkcs8(pem: string): Uint8Array {
  const body = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s+/g, "");
  const bin = atob(body);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function getAccessToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.exp - 60 > now) return cachedToken.token;

  const sa = getSA();
  const header = { alg: "RS256", typ: "JWT" };
  const claims = {
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/datastore",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };
  const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(claims))}`;

  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToPkcs8(sa.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(signingInput));
  const jwt = `${signingInput}.${b64url(sig)}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  if (!res.ok) throw new Error(`token exchange failed: ${res.status} ${await res.text()}`);
  const json = await res.json();
  cachedToken = { token: json.access_token, exp: now + (json.expires_in ?? 3600) };
  return cachedToken.token;
}

// ---------- Firestore value <-> JSON conversion ----------

function toFsValue(v: unknown): any {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === "boolean") return { booleanValue: v };
  if (typeof v === "number") {
    return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  }
  if (typeof v === "string") return { stringValue: v };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toFsValue) } };
  if (typeof v === "object") {
    const fields: Record<string, any> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) fields[k] = toFsValue(val);
    return { mapValue: { fields } };
  }
  return { stringValue: String(v) };
}

function fromFsValue(v: any): any {
  if (!v || typeof v !== "object") return v;
  if ("nullValue" in v) return null;
  if ("booleanValue" in v) return v.booleanValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return Number(v.doubleValue);
  if ("stringValue" in v) return v.stringValue;
  if ("timestampValue" in v) return v.timestampValue;
  if ("arrayValue" in v) return (v.arrayValue.values ?? []).map(fromFsValue);
  if ("mapValue" in v) return fromFsFields(v.mapValue.fields ?? {});
  if ("referenceValue" in v) return v.referenceValue;
  if ("geoPointValue" in v) return v.geoPointValue;
  if ("bytesValue" in v) return v.bytesValue;
  return null;
}

function fromFsFields(fields: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(fields)) out[k] = fromFsValue(v);
  return out;
}

function toFsFields(data: Record<string, unknown>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(data)) out[k] = toFsValue(v);
  return out;
}

function docIdFromName(name: string): string {
  return name.split("/").pop() ?? "";
}

// ---------- Firestore REST helpers ----------

const FS_BASE = "https://firestore.googleapis.com/v1";

function dbRoot(): string {
  return `projects/${getProjectId()}/databases/(default)/documents`;
}

async function fsFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = await getAccessToken();
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  return fetch(`${FS_BASE}/${path}`, { ...init, headers });
}

// ---------- Operations ----------

async function opGet(collection: string, id: string) {
  const res = await fsFetch(`${dbRoot()}/${collection}/${encodeURIComponent(id)}`);
  if (res.status === 404) return { status: 404, body: { error: "not_found" } };
  if (!res.ok) return { status: res.status, body: { error: await res.text() } };
  const json = await res.json();
  return { status: 200, body: { id, data: fromFsFields(json.fields ?? {}) } };
}

async function opList(collection: string, pageSize?: number, pageToken?: string) {
  const qs = new URLSearchParams();
  if (pageSize) qs.set("pageSize", String(pageSize));
  if (pageToken) qs.set("pageToken", pageToken);
  const url = `${dbRoot()}/${collection}${qs.toString() ? `?${qs}` : ""}`;
  const res = await fsFetch(url);
  if (!res.ok) return { status: res.status, body: { error: await res.text() } };
  const json = await res.json();
  const documents = (json.documents ?? []).map((d: any) => ({
    id: docIdFromName(d.name),
    data: fromFsFields(d.fields ?? {}),
  }));
  return { status: 200, body: { documents, nextPageToken: json.nextPageToken } };
}

async function opCreate(collection: string, id: string | undefined, data: Record<string, unknown>) {
  const body = JSON.stringify({ fields: toFsFields(data ?? {}) });
  let url: string;
  if (id) {
    // PATCH with currentDocument.exists=false to create with chosen id
    url = `${dbRoot()}/${collection}/${encodeURIComponent(id)}?currentDocument.exists=false`;
    const res = await fsFetch(url, { method: "PATCH", body });
    if (!res.ok) return { status: res.status, body: { error: await res.text() } };
    const json = await res.json();
    return { status: 200, body: { id, data: fromFsFields(json.fields ?? {}) } };
  } else {
    url = `${dbRoot()}/${collection}`;
    const res = await fsFetch(url, { method: "POST", body });
    if (!res.ok) return { status: res.status, body: { error: await res.text() } };
    const json = await res.json();
    return { status: 200, body: { id: docIdFromName(json.name), data: fromFsFields(json.fields ?? {}) } };
  }
}

async function opUpdate(collection: string, id: string, data: Record<string, unknown>, merge: boolean) {
  const qs = new URLSearchParams();
  if (merge) {
    for (const k of Object.keys(data ?? {})) qs.append("updateMask.fieldPaths", k);
  }
  const url = `${dbRoot()}/${collection}/${encodeURIComponent(id)}${qs.toString() ? `?${qs}` : ""}`;
  const res = await fsFetch(url, {
    method: "PATCH",
    body: JSON.stringify({ fields: toFsFields(data ?? {}) }),
  });
  if (!res.ok) return { status: res.status, body: { error: await res.text() } };
  const json = await res.json();
  return { status: 200, body: { id, data: fromFsFields(json.fields ?? {}) } };
}

async function opDelete(collection: string, id: string) {
  const res = await fsFetch(`${dbRoot()}/${collection}/${encodeURIComponent(id)}`, { method: "DELETE" });
  if (!res.ok && res.status !== 404) return { status: res.status, body: { error: await res.text() } };
  return { status: 200, body: { ok: true } };
}

// ---------- Handler ----------

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "method_not_allowed" }), {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const payload = await req.json();
    const { op, collection, id, data, merge = true, pageSize, pageToken } = payload ?? {};

    if (!op || !collection) {
      return new Response(JSON.stringify({ error: "missing_op_or_collection" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let result: { status: number; body: unknown };
    switch (op) {
      case "get":
        if (!id) throw new Error("id required for get");
        result = await opGet(collection, id);
        break;
      case "list":
        result = await opList(collection, pageSize, pageToken);
        break;
      case "create":
        result = await opCreate(collection, id, data ?? {});
        break;
      case "update":
        if (!id) throw new Error("id required for update");
        result = await opUpdate(collection, id, data ?? {}, !!merge);
        break;
      case "delete":
        if (!id) throw new Error("id required for delete");
        result = await opDelete(collection, id);
        break;
      default:
        return new Response(JSON.stringify({ error: `unknown_op: ${op}` }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }

    return new Response(JSON.stringify(result.body), {
      status: result.status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("firebase-firestore error", e);
    return new Response(JSON.stringify({ error: String(e?.message ?? e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
