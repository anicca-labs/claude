"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runSql = runSql;
exports.getDatabaseClient = getDatabaseClient;
const supabase_js_1 = require("@supabase/supabase-js");
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
