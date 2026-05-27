"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadProjectEnv = loadProjectEnv;
exports.runSql = runSql;
exports.getDatabaseClient = getDatabaseClient;
const supabase_js_1 = require("@supabase/supabase-js");
const fs_1 = require("fs");
const path_1 = require("path");
function loadProjectEnv(projectRoot) {
    if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY)
        return;
    const envPath = (0, path_1.join)(projectRoot, ".env");
    let raw;
    try {
        raw = (0, fs_1.readFileSync)(envPath, "utf-8");
    }
    catch {
        return;
    }
    for (const line of raw.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#"))
            continue;
        const eq = trimmed.indexOf("=");
        if (eq === -1)
            continue;
        const key = trimmed.slice(0, eq).trim();
        const val = trimmed.slice(eq + 1).trim();
        if (key && !(key in process.env)) {
            process.env[key] = val;
        }
    }
}
function getSupabaseCredentials() {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
        throw new Error("Missing required env vars: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
    }
    return { url, key };
}
async function runSql(query) {
    const { url, key } = getSupabaseCredentials();
    const response = await fetch(`${url}/rest/v1/rpc/run_sql`, {
        method: "POST",
        headers: {
            apikey: key,
            Authorization: `Bearer ${key}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ query }),
    });
    if (!response.ok) {
        const err = await response.text();
        throw new Error(`run_sql failed: ${err}`);
    }
    return response.json();
}
function getDatabaseClient() {
    const { url, key } = getSupabaseCredentials();
    return (0, supabase_js_1.createClient)(url, key);
}
