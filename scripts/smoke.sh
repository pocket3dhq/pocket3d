#!/usr/bin/env bash
# End-to-end check of a running pocket3d: accounts, API keys, upload
# validation, publish, the share page (with its link-preview tags), file
# serving, and what agents use (llms.txt, skill.md, OAuth discovery, the MCP
# server, upload links, publish from URL, list/rename/delete, versions and
# drafts).
#
#   scripts/smoke.sh <base-url> [api-key]
#   scripts/smoke.sh http://localhost:4200                # pnpm dev
#   scripts/smoke.sh http://localhost:4007                # docker compose
#   scripts/smoke.sh https://pocket3d.co   "$API_KEY"     # production
#
# Without an API key it signs up a throwaway account (smoke-<random>@example.com),
# creates a key, runs every check, then revokes the key and deletes the
# account. That needs open registration and no email activation; otherwise
# pass a key (create one at <base-url>/dashboard/keys).
#
# Publishes one tiny test model (a triangle) each run. Needs bash, curl, node.
#
# SMOKE_CURL_ARGS adds curl options to every request, e.g. to test a server
# before DNS points at it:
#   SMOKE_CURL_ARGS="--resolve your-domain.com:443:<server-ip> -k" scripts/smoke.sh https://your-domain.com "$KEY"
set -uo pipefail
read -r -a extra <<< "${SMOKE_CURL_ARGS:-}"
curl() { command curl ${extra[@]+"${extra[@]}"} "$@"; }

base="${1:?usage: scripts/smoke.sh <base-url> [api-key]}"
base="${base%/}"
key="${2:-}"
api="$base/api"

tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
failures=0
pass() { printf '  \033[32m✓\033[0m %s\n' "$1"; }
fail() { printf '  \033[31m✗\033[0m %s\n' "$1"; failures=$((failures + 1)); }
expect() { # name expected actual
  if [ "$2" = "$3" ]; then pass "$1"; else fail "$1 (expected $2, got $3)"; fi
}

# A valid binary glTF 2.0 with one triangle, a 1x1 PNG, and a fake .glb
node -e '
const json = Buffer.from(JSON.stringify({
  asset: { version: "2.0" }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }],
  meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
  accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: "VEC3", min: [0, 0, 0], max: [1, 1, 0] }],
  bufferViews: [{ buffer: 0, byteLength: 36 }], buffers: [{ byteLength: 36 }],
}));
const pad = (b, c) => Buffer.concat([b, Buffer.alloc((4 - (b.length % 4)) % 4, c)]);
const j = pad(json, 0x20);
const bin = Buffer.from(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]).buffer);
const chunk = (data, type) => { const h = Buffer.alloc(8); h.writeUInt32LE(data.length, 0); h.writeUInt32LE(type, 4); return Buffer.concat([h, data]); };
const body = Buffer.concat([chunk(j, 0x4e4f534a), chunk(bin, 0x004e4942)]);
const head = Buffer.alloc(12); head.write("glTF", 0, "latin1"); head.writeUInt32LE(2, 4); head.writeUInt32LE(12 + body.length, 8);
require("fs").writeFileSync(process.argv[1] + "/triangle.glb", Buffer.concat([head, body]));
require("fs").writeFileSync(process.argv[1] + "/cover.png", Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64"));
require("fs").writeFileSync(process.argv[1] + "/fake.glb", "not a model");
' "$tmp"

status() { curl -s -o "$tmp/body" -D "$tmp/headers" -w '%{http_code}' "$@"; }
has_header() { tr -d '\r' < "$tmp/headers" | grep -qi "^$1:"; }
field() { node -e 'const b = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")); console.log(b[process.argv[2]] ?? "")' "$tmp/body" "$1" 2>/dev/null; }
jar="$tmp/cookies"
json=(-H 'Content-Type: application/json')

echo "pocket3d smoke test → $base"

echo "pages"
expect "GET /auth/login → 200" 200 "$(status "$base/auth/login")"
expect "GET /auth/register → 200" 200 "$(status "$base/auth/register")"
read -r code location < <(curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' "$base/dashboard")
expect "signed out /dashboard → login" "307 $base/auth/login?next=%2Fdashboard" "$code $location"
if curl -s -o /dev/null -D - "$base/oauth/authorize" | tr -d '\r' | grep -qi "^content-security-policy: frame-ancestors 'none'"; then pass "OAuth consent page can't be framed"; else fail "OAuth consent page can't be framed"; fi

account=""
if [ -z "$key" ]; then
  echo "account"
  account="smoke-$(node -e 'console.log(require("crypto").randomBytes(6).toString("hex"))')@example.com"
  password="smoke-$(node -e 'console.log(require("crypto").randomBytes(12).toString("hex"))')"
  code="$(status -c "$jar" "${json[@]}" -d "{\"email\":\"$account\",\"password\":\"$password\"}" "$api/auth/register")"
  if [ "$code" != 200 ] || [ "$(field login)" != true ]; then
    fail "sign up a throwaway account ($code $(head -c 200 "$tmp/body")): registration closed or email activation on? Pass an API key instead."
    echo; echo "$failures check(s) failed"; exit 1
  fi
  pass "sign up → session cookie"
  expect "GET /user/self with the cookie → 200" 200 "$(status -b "$jar" "$api/user/self")"
  expect "GET /user/self without it → 401" 401 "$(status "$api/user/self")"
  expect "form POST with the cookie → 415 (CSRF)" 415 "$(status -b "$jar" -d 'name=x' "$api/api-keys")"
  expect "create an API key → 201" 201 "$(status -b "$jar" "${json[@]}" -d '{"name":"smoke test"}' "$api/api-keys")"
  key="$(field key)"
  key_id="$(field id)"
fi

echo "auth"
expect "no API key → 401" 401 "$(status -F "file=@$tmp/triangle.glb" "$api/public/v1/assets")"
expect "wrong API key → 401" 401 "$(status -H 'Authorization: wrong' -F "file=@$tmp/triangle.glb" "$api/public/v1/assets")"
expect "GET /public/v1/me with the key → 200" 200 "$(status -H "Authorization: $key" "$api/public/v1/me")"
has_header x-ratelimit-limit-account && pass "  rate-limited per account" || fail "  rate-limited per account"

echo "upload validation"
expect "text renamed to .glb → 400" 400 "$(status -H "Authorization: $key" -F "file=@$tmp/fake.glb" "$api/public/v1/assets")"
expect "glb sent as the cover → 400" 400 "$(status -H "Authorization: $key" -F "file=@$tmp/triangle.glb" -F "cover=@$tmp/triangle.glb" "$api/public/v1/assets")"
expect "no model file → 400" 400 "$(status -H "Authorization: $key" -F 'title=x' "$api/public/v1/assets")"
node -e 'const f=require("fs").openSync(process.argv[1],"w"); const h=Buffer.alloc(12); h.write("glTF",0,"latin1"); h.writeUInt32LE(2,4); require("fs").writeSync(f,h); require("fs").ftruncateSync(f,96*1024*1024);' "$tmp/big.glb"
code="$(status -H "Authorization: $key" -F "file=@$tmp/big.glb" "$api/public/v1/assets")"
case "$code" in 400|413) pass "96 MB model → rejected ($code)";; *) fail "96 MB model → rejected (got $code)";; esac
rm -f "$tmp/big.glb"

echo "publish"
title='Smoke <b>test</b> & "quotes"'
code="$(status -H "Authorization: Bearer $key" -F "title=$title" -F "file=@$tmp/triangle.glb" -F "cover=@$tmp/cover.png" "$api/public/v1/assets")"
expect "valid model + cover → 201" 201 "$code"
read -r id url path cover < <(node -e '
const b = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
console.log([b.id, b.url, b.path, b.coverPath].join(" "));' "$tmp/body" 2>/dev/null || echo "")
if [ -z "${id:-}" ]; then
  fail "publish answer has id/url/path ($(head -c 200 "$tmp/body"))"
  echo; echo "$failures check(s) failed"; exit 1
fi
expect "share link is MAIN_URL/m/<id>" "$base/m/$id" "$url"

echo "read back"
expect "GET /public/assets/<id> → 200" 200 "$(status "$api/public/assets/$id")"
got_title="$(node -e 'console.log(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).title)' "$tmp/body")"
expect "title stored as sent" "$title" "$got_title"
expect "unknown id → 404" 404 "$(status "$api/public/assets/AAAAAAAAAAAA")"
expect "malformed id → 404" 404 "$(status "$api/public/assets/not-an-id")"

echo "share page"
expect "GET /m/<id> → 200" 200 "$(status -A 'Mozilla/5.0' "$url")"
head_html="$(sed -e 's#</head>.*##' "$tmp/body")"
if grep -q "property=\"og:image\" content=\"$cover\"" <<<"$head_html"; then pass "og:image in <head>"; else fail "og:image in <head>"; fi
if grep -q 'name="twitter:card" content="summary_large_image"' <<<"$head_html"; then pass "twitter:card in <head>"; else fail "twitter:card in <head>"; fi
if grep -q 'Smoke &lt;b&gt;test&lt;/b&gt;' <<<"$head_html" && ! grep -q 'Smoke <b>' "$tmp/body"; then pass "title HTML-escaped"; else fail "title HTML-escaped"; fi
expect "unknown model page → 404" 404 "$(status "$base/m/AAAAAAAAAAAA")"

echo "files"
read -r code ctype < <(curl -s -o /dev/null -w '%{http_code} %{content_type}\n' "$path")
expect "model file → 200" 200 "$code"
expect "model served as model/gltf-binary" "model/gltf-binary" "$ctype"
read -r code ctype < <(curl -s -o /dev/null -w '%{http_code} %{content_type}\n' "$cover")
expect "cover served as image/png" "200 image/png" "$code $ctype"

echo "versions"
expect "publish v2 to the same model → 201" 201 "$(status -H "Authorization: $key" -F 'note=smoke v2' -F "file=@$tmp/triangle.glb" "$api/public/v1/assets/$id/versions")"
expect "  same link, v2 live" "$url 2 2" "$(field url) $(field version) $(field live)"
v2_path="$(field path)"
expect "the link shows v2" "2 $v2_path" "$(status "$api/public/assets/$id" >/dev/null; echo "$(field shown) $(field path)")"
expect "?v=1 pins v1" "1 $path" "$(status "$api/public/assets/$id?v=1" >/dev/null; echo "$(field shown) $(field path)")"
expect "GET /m/<id>?v=1 → 200" 200 "$(status -A 'Mozilla/5.0' "$url?v=1")"
if sed -e 's#</head>.*##' "$tmp/body" | grep -q 'property="og:title" content="[^"]* · v1"'; then pass "  og:title names the version"; else fail "  og:title names the version"; fi
expect "upload v3 as a draft → 201" "201 draft" "$(status -H "Authorization: $key" -F 'draft=true' -F "file=@$tmp/triangle.glb" "$api/public/v1/assets/$id/versions") $(field status)"
v3_path="$(field path)"
expect "  the link still shows v2" 2 "$(status "$api/public/assets/$id" >/dev/null; field shown)"
if [ -n "$v3_path" ] && ! grep -qF "$v3_path" "$tmp/body"; then pass "  the draft is not in the public data"; else fail "  the draft is not in the public data"; fi
expect "  ?v=3 shows the live version" "2 true" "$(status "$api/public/assets/$id?v=3" >/dev/null; echo "$(field shown) $(field missing)")"
expect "make the draft live → 409" 409 "$(status -X PUT -H "Authorization: $key" "${json[@]}" -d '{"liveVersion":3}' "$api/public/v1/assets/$id")"
expect "publish the draft → 201" 201 "$(status -X POST -H "Authorization: $key" "${json[@]}" -d '{}' "$api/public/v1/assets/$id/versions/3/publish")"
expect "roll back to v1 → 200" "200 1" "$(status -X PUT -H "Authorization: $key" "${json[@]}" -d '{"liveVersion":"v1"}' "$api/public/v1/assets/$id") $(field version)"
expect "delete the live version → 409" 409 "$(status -X DELETE -H "Authorization: $key" "$api/public/v1/assets/$id/versions/1")"
expect "delete v3 → 200" 200 "$(status -X DELETE -H "Authorization: $key" "$api/public/v1/assets/$id/versions/3")"
expect "  its file is gone → 404" 404 "$(status "$v3_path")"
expect "delete v2 → 200" 200 "$(status -X DELETE -H "Authorization: $key" "$api/public/v1/assets/$id/versions/v2")"
expect "delete the last version → 409" 409 "$(status -X DELETE -H "Authorization: $key" "$api/public/v1/assets/$id/versions/1")"

echo "agents"
expect "GET /llms.txt → 200" 200 "$(status "$base/llms.txt")"
if grep -qF "$base/mcp" "$tmp/body"; then pass "llms.txt points at this instance's MCP server"; else fail "llms.txt points at this instance's MCP server"; fi
expect "GET /skill.md → 200" 200 "$(status "$base/skill.md")"
if sed -n 2p "$tmp/body" | grep -q '^name: pocket3d$'; then pass "skill.md has SKILL.md front matter"; else fail "skill.md has SKILL.md front matter"; fi
expect "OAuth protected resource metadata → 200" 200 "$(status "$base/.well-known/oauth-protected-resource/mcp")"
expect "  resource is MAIN_URL/mcp" "$base/mcp" "$(field resource)"
expect "OAuth authorization server metadata → 200" 200 "$(status "$base/.well-known/oauth-authorization-server")"
expect "  issuer is MAIN_URL" "$base" "$(field issuer)"
www="$(curl -s -o /dev/null -D - -X POST -H 'Content-Type: application/json' -d '{}' "$base/mcp" | tr -d '\r' | grep -i '^www-authenticate:' || true)"
if grep -qF "resource_metadata=\"$base/.well-known/oauth-protected-resource/mcp\"" <<<"$www"; then pass "MCP without auth → 401 pointing at OAuth discovery"; else fail "MCP without auth → 401 pointing at OAuth discovery (got: $www)"; fi

mcp() {
  curl -s -o "$tmp/body" -D "$tmp/headers" -w '%{http_code}' -H "Authorization: Bearer $key" -H 'Content-Type: application/json' \
    -H 'Accept: application/json, text/event-stream' -d "$1" "$base/mcp"
}
# the JSON a tool answered with (the first text content), or its error text
tool_result() { node -e 'const r = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")).result; const t = r.content[0].text; process.stdout.write(r.isError ? "ERROR: " + t : t)' "$tmp/body" 2>/dev/null; }
expect "MCP tools/list with the key → 200" 200 "$(mcp '{"jsonrpc":"2.0","id":1,"method":"tools/list"}')"
has_header x-ratelimit-limit-account && pass "  rate-limited per account" || fail "  rate-limited per account"
tools="$(node -e 'console.log(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).result.tools.map(t => t.name).sort().join(","))' "$tmp/body" 2>/dev/null)"
expect "  the ten tools" "create_upload_link,delete_model,delete_version,list_models,list_versions,publish_draft,publish_from_url,rename_model,set_live_version,whoami" "$tools"
expect "MCP list_versions → 200" 200 "$(mcp '{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"list_versions","arguments":{"model":"'"$id"'"}}}')"
expect "  v1 is live" "1" "$(tool_result | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{console.log(JSON.parse(s).live)}catch{console.log(s.slice(0,200))}})')"

expect "GET /public/v1/assets → 200" 200 "$(status -H "Authorization: $key" "$api/public/v1/assets")"
listed="$(node -e 'console.log(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).assets.some(a => a.id === process.argv[2]))' "$tmp/body" "$id" 2>/dev/null)"
expect "  lists the published model" true "$listed"
expect "rename through the API → 200" 200 "$(status -X PUT -H "Authorization: $key" "${json[@]}" -d '{"title":"Smoke renamed"}' "$api/public/v1/assets/$id")"

expect "MCP create_upload_link → 200" 200 "$(mcp '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"create_upload_link","arguments":{"title":"Smoke upload link"}}}')"
upload_url="$(tool_result | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{console.log(JSON.parse(s).upload_url)}catch{console.log("")}})')"
upload_page="$(tool_result | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{console.log(JSON.parse(s).upload_page)}catch{console.log("")}})')"
if [ -n "$upload_url" ]; then
  expect "upload page → 200" 200 "$(status "$upload_page")"
  grep -q "Upload your 3D model" "$tmp/body" && pass "  shows the upload form" || fail "  shows the upload form"
  page_headers="$(curl -s -o /dev/null -D - "$upload_page" | tr -d '\r')"
  grep -qi "^referrer-policy: no-referrer" <<<"$page_headers" && pass "  no Referer leaves the page" || fail "  no Referer leaves the page"
  grep -qi "^content-security-policy: frame-ancestors 'none'" <<<"$page_headers" && pass "  can't be framed" || fail "  can't be framed"
  expect "check the link (not used up) → 200" 200 "$(status "$upload_url")"
  expect "upload through the link → 201" 201 "$(status -F "file=@$tmp/triangle.glb" "$upload_url")"
  link_id="$(field id)"
  expect "  titled from the link" "Smoke upload link" "$(field title)"
  expect "same link again → 410" 410 "$(status -F "file=@$tmp/triangle.glb" "$upload_url")"
  expect "upload page once used → 200" 200 "$(status "$upload_page")"
  grep -q "work any more" "$tmp/body" && pass "  says the link is used" || fail "  says the link is used"
  [ -n "$link_id" ] && expect "delete it through the API → 200" 200 "$(status -X DELETE -H "Authorization: $key" "$api/public/v1/assets/$link_id")"
else
  fail "create_upload_link returned an upload_url ($(head -c 200 "$tmp/body"))"
fi

# JSON built by node: shell quoting can't be trusted with a URL inside
from_url_call() {
  node -e 'console.log(JSON.stringify({ jsonrpc: "2.0", id: 3, method: "tools/call",
    params: { name: "publish_from_url", arguments: { url: process.argv[1], title: "Smoke from URL" } } }))' "$1"
}

# The server downloads from the URL, and only public addresses are allowed:
# a local instance's own files are on localhost, so this only runs on a
# public one (where the published model's file URL is public)
case "$base" in
  http://localhost*|http://127.*|http://10.*|http://192.168.*)
    echo "  - publish_from_url skipped (local instance: its files aren't on a public address)"
    mcp "$(from_url_call "$path")" >/dev/null
    refused="$(tool_result)"
    case "$refused" in ERROR:*) pass "MCP publish_from_url refuses a local URL";; *) fail "MCP publish_from_url refuses a local URL (got: ${refused:0:200})";; esac
    ;;
  *)
    expect "MCP publish_from_url → 200" 200 "$(mcp "$(from_url_call "$path")")"
    from_url_id="$(tool_result | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{console.log(JSON.parse(s).id)}catch{console.log("")}})')"
    if [ -n "$from_url_id" ]; then
      pass "  published from the model's own file URL"
      expect "delete it through the API → 200" 200 "$(status -X DELETE -H "Authorization: $key" "$api/public/v1/assets/$from_url_id")"
    else
      fail "  publish_from_url answered: $(tool_result | head -c 200)"
    fi
    ;;
esac

if [ -n "$account" ]; then
  echo "clean up"
  expect "the model is in the account's library" "$id" "$(status -b "$jar" "$api/assets" >/dev/null; node -e 'console.log(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).assets[0]?.id)' "$tmp/body")"
  expect "revoke the key → 200" 200 "$(status -b "$jar" -X DELETE "$api/api-keys/$key_id")"
  expect "revoked key → 401" 401 "$(status -H "Authorization: $key" "$api/public/v1/me")"
  expect "delete the account → 200" 200 "$(status -b "$jar" -X DELETE "${json[@]}" -d "{\"password\":\"$password\"}" "$api/user/self")"
  expect "its model is gone → 404" 404 "$(status "$api/public/assets/$id")"
  url="(deleted with the throwaway account)"
fi

echo
if [ "$failures" -eq 0 ]; then
  echo "All checks passed. Test model: $url"
else
  echo "$failures check(s) failed."
  exit 1
fi
