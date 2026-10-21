// Automated YouTube uploader for Marble Formula Championship (@MarbleFormula).
//
// Zero external dependencies (uses Node 20+ built-in fetch, http, fs, crypto).
//
// First-time setup (takes 60 seconds):
//   1. Open: https://console.cloud.google.com/apis/credentials?project=gen-lang-client-0869187042
//   2. Click "+ CREATE CREDENTIALS" -> "OAuth client ID" -> Application type: "Desktop app".
//   3. Download the JSON file and save it as `.youtube-client.json` in this repo root.
//   4. Run:  npm run upload:auth
//      (Select your @MarbleFormula YouTube channel in the browser window that opens.)
//
// Usage:
//   npm run upload -- --season 3                         # upload all rounds of season 3 (video + short + thumb)
//   npm run upload -- --season 3 --round r1-monaco       # upload one round (4K video + Short + thumb)
//   npm run upload -- --season 3 --only video            # only full-length 16:9 videos (or --only short)
//   npm run upload -- --file out/gp/r5-monza.mp4 --round r5-monza   # upload a single render from out/gp/
//   npm run upload -- --season 3 --privacy unlisted      # public (default) | unlisted | private
//   npm run upload -- --season 3 --dry-run               # preview titles, descriptions, files without uploading

import { execFile } from "node:child_process";
import { closeSync, existsSync, openSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { CIRCUITS } from "../src/gp/circuits/index.js";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const CLIENT_FILE = `${ROOT}.youtube-client.json`;
const TOKEN_FILE = `${ROOT}.youtube-token.json`;
const REDIRECT_PORT = 8899;
const REDIRECT_URI = `http://127.0.0.1:${REDIRECT_PORT}/oauth2callback`;
const SCOPES = [
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtube",
].join(" ");
const CHUNK_SIZE = 16 * 1024 * 1024; // 16 MB chunks (must be multiple of 256 KB)

function parseArgs(argv) {
  const o = {
    season: 3,
    round: null,
    only: null, // "video" | "short" | null (both)
    file: null,
    privacy: "public",
    publishAt: null,
    dryRun: false,
    force: false,
    authOnly: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--season") o.season = Number(argv[++i]);
    else if (a === "--round") o.round = argv[++i];
    else if (a === "--only") o.only = argv[++i];
    else if (a === "--file") o.file = argv[++i];
    else if (a === "--privacy") o.privacy = argv[++i];
    else if (a === "--publish-at") o.publishAt = argv[++i];
    else if (a === "--dry-run") o.dryRun = true;
    else if (a === "--force") o.force = true;
    else if (a === "--auth") o.authOnly = true;
    else throw new Error(`Unknown option: ${a}`);
  }
  if (!["public", "unlisted", "private"].includes(o.privacy)) {
    throw new Error(`--privacy must be public, unlisted, or private (got ${o.privacy})`);
  }
  return o;
}

function loadClient() {
  if (process.env.YOUTUBE_CLIENT_ID && process.env.YOUTUBE_CLIENT_SECRET) {
    return { clientId: process.env.YOUTUBE_CLIENT_ID, clientSecret: process.env.YOUTUBE_CLIENT_SECRET };
  }
  if (!existsSync(CLIENT_FILE)) {
    console.error(`\nMissing ${CLIENT_FILE.replace(ROOT, "")}!`);
    console.error(`To set up YouTube OAuth in 60 seconds:`);
    console.error(`  1. Open: https://console.cloud.google.com/apis/credentials?project=gen-lang-client-0869187042`);
    console.error(`  2. Click "+ CREATE CREDENTIALS" -> "OAuth client ID" -> Application type: "Desktop app"`);
    console.error(`  3. Download the JSON file and save it as:`);
    console.error(`       ${CLIENT_FILE}`);
    console.error(`  4. Run:  npm run upload:auth\n`);
    process.exit(1);
  }
  const raw = JSON.parse(readFileSync(CLIENT_FILE, "utf8"));
  const cfg = raw.installed ?? raw.web ?? raw;
  if (!cfg.client_id || !cfg.client_secret) {
    throw new Error(`.youtube-client.json is missing client_id or client_secret`);
  }
  return { clientId: cfg.client_id, clientSecret: cfg.client_secret };
}

async function authorizeInteractive({ clientId, clientSecret }) {
  const authUrl =
    `https://accounts.google.com/o/oauth2/v2/auth` +
    `?client_id=${encodeURIComponent(clientId)}` +
    `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
    `&response_type=code` +
    `&scope=${encodeURIComponent(SCOPES)}` +
    `&access_type=offline` +
    `&login_hint=${encodeURIComponent("marbleformula1@gmail.com")}` +
    `&prompt=consent`;

  console.log(`\nOpening browser to authorize YouTube channel (@MarbleFormula)...`);
  console.log(`If it doesn't open automatically, visit:\n  ${authUrl}\n`);
  execFile("open", [authUrl]);

  const code = await new Promise((resolve, reject) => {
    const srv = createServer((req, res) => {
      const u = new URL(req.url, REDIRECT_URI);
      if (u.pathname !== "/oauth2callback") {
        res.writeHead(404).end();
        return;
      }
      const err = u.searchParams.get("error");
      const c = u.searchParams.get("code");
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(
        err
          ? `<h2>Authorization failed: ${err}</h2>`
          : `<h2 style="font-family:sans-serif">✅ @MarbleFormula authorized! You can close this tab.</h2>`,
      );
      srv.close();
      if (err) reject(new Error(`OAuth error: ${err}`));
      else resolve(c);
    });
    srv.listen(REDIRECT_PORT, "127.0.0.1");
  });

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: REDIRECT_URI,
      grant_type: "authorization_code",
    }),
  });
  const tokens = await tokenRes.json();
  if (!tokenRes.ok || !tokens.access_token) {
    throw new Error(`Token exchange failed: ${JSON.stringify(tokens)}`);
  }
  tokens.obtained_at = Date.now();
  writeFileSync(TOKEN_FILE, JSON.stringify(tokens, null, 2));
  console.log(`Saved refresh token to .youtube-token.json`);
  return tokens.access_token;
}

async function getAccessToken() {
  const client = loadClient();
  if (!existsSync(TOKEN_FILE)) return authorizeInteractive(client);
  const saved = JSON.parse(readFileSync(TOKEN_FILE, "utf8"));
  if (saved.access_token && saved.obtained_at && Date.now() - saved.obtained_at < (saved.expires_in - 120) * 1000) {
    return saved.access_token;
  }
  if (!saved.refresh_token) return authorizeInteractive(client);
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: client.clientId,
      client_secret: client.clientSecret,
      refresh_token: saved.refresh_token,
      grant_type: "refresh_token",
    }),
  });
  const refreshed = await res.json();
  if (!res.ok || !refreshed.access_token) {
    console.warn(`Refresh token expired or revoked, re-authorizing...`);
    return authorizeInteractive(client);
  }
  const merged = { ...saved, ...refreshed, obtained_at: Date.now() };
  writeFileSync(TOKEN_FILE, JSON.stringify(merged, null, 2));
  return merged.access_token;
}

async function printChannelInfo(accessToken) {
  const res = await fetch("https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await res.json();
  const ch = data.items?.[0]?.snippet;
  if (ch) {
    console.log(`Connected YouTube Channel: ${ch.title} (${ch.customUrl ?? ""})`);
  }
}

async function uploadVideoResumable({ accessToken, filePath, title, description, tags, privacy, publishAt, categoryId = "20" }) {
  const size = statSync(filePath).size;
  const body = {
    snippet: {
      title,
      description,
      tags,
      categoryId,
      defaultLanguage: "en",
      defaultAudioLanguage: "en",
    },
    status: {
      privacyStatus: publishAt ? "private" : privacy,
      ...(publishAt ? { publishAt } : {}),
      selfDeclaredMadeForKids: false,
    },
  };

  const initRes = await fetch(
    "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Length": String(size),
        "X-Upload-Content-Type": "video/mp4",
      },
      body: JSON.stringify(body),
    },
  );
  if (!initRes.ok) {
    const errText = await initRes.text();
    throw new Error(`Failed to initiate upload (${initRes.status}): ${errText}`);
  }
  const uploadUrl = initRes.headers.get("location");
  if (!uploadUrl) throw new Error("YouTube did not return a resumable upload Location header");

  const fd = openSync(filePath, "r");
  try {
    let offset = 0;
    while (offset < size) {
      const len = Math.min(CHUNK_SIZE, size - offset);
      const buf = Buffer.allocUnsafe(len);
      const { readSync } = await import("node:fs");
      readSync(fd, buf, 0, len, offset);

      const end = offset + len - 1;
      const chunkRes = await fetch(uploadUrl, {
        method: "PUT",
        headers: {
          "Content-Length": String(len),
          "Content-Range": `bytes ${offset}-${end}/${size}`,
          "Content-Type": "video/mp4",
        },
        body: buf,
      });

      if (chunkRes.status === 308) {
        offset += len;
        const pct = ((offset / size) * 100).toFixed(1);
        process.stdout.write(`\r  Uploading ${filePath.replace(ROOT, "")}: ${pct}% (${(offset / 1e6).toFixed(0)}/${(size / 1e6).toFixed(0)} MB)`);
      } else if (chunkRes.ok) {
        process.stdout.write(`\r  Uploading ${filePath.replace(ROOT, "")}: 100.0% (${(size / 1e6).toFixed(0)} MB)\n`);
        const video = await chunkRes.json();
        return video.id;
      } else {
        const errText = await chunkRes.text();
        throw new Error(`Upload failed at byte ${offset} (${chunkRes.status}): ${errText}`);
      }
    }
  } finally {
    closeSync(fd);
  }
}

async function uploadThumbnail({ accessToken, videoId, thumbPath }) {
  const bytes = readFileSync(thumbPath);
  const res = await fetch(
    `https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${encodeURIComponent(videoId)}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "image/jpeg",
        "Content-Length": String(bytes.length),
      },
      body: bytes,
    },
  );
  if (!res.ok) {
    console.warn(`  ⚠️ Thumbnail upload warning (${res.status}): ${await res.text()}`);
  } else {
    console.log(`  ✓ Custom thumbnail set (${thumbPath.replace(ROOT, "")})`);
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.authOnly) {
    const client = loadClient();
    const token = await authorizeInteractive(client);
    await printChannelInfo(token);
    return;
  }

  // Build upload queue
  const jobs = [];
  if (opts.file) {
    const roundId = opts.round ?? "r5-monza";
    const metaPath = existsSync(`${ROOT}out/factory/s${opts.season}/${roundId}/youtube.json`)
      ? `${ROOT}out/factory/s${opts.season}/${roundId}/youtube.json`
      : `${ROOT}out/${roundId}-youtube.json`;
    if (!existsSync(metaPath)) throw new Error(`Missing metadata file ${metaPath}; run: npm run factory -- --season ${opts.season} --only metadata`);
    const meta = JSON.parse(readFileSync(metaPath, "utf8"));
    const thumbCandidates = [
      `${ROOT}out/gp/${roundId}-thumb.jpg`,
      `${ROOT}out/factory/s${opts.season}/${roundId}/thumb.jpg`,
    ];
    jobs.push({
      label: `${roundId} (single file)`,
      filePath: opts.file.startsWith("/") ? opts.file : `${ROOT}${opts.file}`,
      thumbPath: thumbCandidates.find((p) => existsSync(p)) ?? null,
      title: meta.title,
      description: meta.description,
      tags: meta.tags,
      recordFile: `${ROOT}out/gp/${roundId}-uploaded.json`,
      recordKey: "video",
    });
  } else {
    const rounds = opts.round ? CIRCUITS.filter((c) => c.id === opts.round) : CIRCUITS;
    for (const c of rounds) {
      const dir = `${ROOT}out/factory/s${opts.season}/${c.id}/`;
      const metaPath = `${dir}youtube.json`;
      if (!existsSync(metaPath)) continue;
      const meta = JSON.parse(readFileSync(metaPath, "utf8"));
      const recordFile = `${dir}uploaded.json`;
      const uploaded = existsSync(recordFile) ? JSON.parse(readFileSync(recordFile, "utf8")) : {};

      if ((!opts.only || opts.only === "video") && existsSync(`${dir}video.mp4`)) {
        if (!uploaded.video || opts.force) {
          const thumbCandidates = [`${dir}thumb.jpg`, `${ROOT}out/gp/${c.id}-thumb.jpg`];
          jobs.push({
            label: `Season ${opts.season} · ${c.id} (4K Full Race)`,
            filePath: `${dir}video.mp4`,
            thumbPath: thumbCandidates.find((p) => existsSync(p)) ?? null,
            title: meta.title,
            description: meta.description,
            tags: meta.tags,
            recordFile,
            recordKey: "video",
          });
        } else {
          console.log(`Skipping ${c.id} video (already uploaded: https://youtu.be/${uploaded.video.id})`);
        }
      }

      if ((!opts.only || opts.only === "short") && existsSync(`${dir}short.mp4`)) {
        if (!uploaded.short || opts.force) {
          jobs.push({
            label: `Season ${opts.season} · ${c.id} (Vertical Short)`,
            filePath: `${dir}short.mp4`,
            thumbPath: null,
            title: meta.short.title,
            description: meta.short.description,
            tags: [...(meta.tags ?? []).slice(0, 8), "shorts"],
            recordFile,
            recordKey: "short",
          });
        } else {
          console.log(`Skipping ${c.id} short (already uploaded: https://youtube.com/shorts/${uploaded.short.id})`);
        }
      }
    }
  }

  if (!jobs.length) {
    console.log("Nothing to upload (all matching videos are already uploaded or not rendered yet).");
    return;
  }

  console.log(`\nQueued ${jobs.length} upload(s) [privacy: ${opts.privacy}]:`);
  for (const j of jobs) {
    console.log(`  • ${j.label}`);
    console.log(`    File:  ${j.filePath.replace(ROOT, "")} (${(statSync(j.filePath).size / 1e6).toFixed(1)} MB)`);
    console.log(`    Title: ${j.title}`);
    if (j.thumbPath) console.log(`    Thumb: ${j.thumbPath.replace(ROOT, "")}`);
  }

  if (opts.dryRun) {
    console.log(`\n--dry-run specified: no files were uploaded.`);
    return;
  }

  const accessToken = await getAccessToken();
  await printChannelInfo(accessToken);

  for (const j of jobs) {
    console.log(`\n▶ Uploading ${j.label}...`);
    const videoId = await uploadVideoResumable({
      accessToken,
      filePath: j.filePath,
      title: j.title,
      description: j.description,
      tags: j.tags,
      privacy: opts.privacy,
      publishAt: opts.publishAt,
    });
    const url = j.recordKey === "short" ? `https://youtube.com/shorts/${videoId}` : `https://youtu.be/${videoId}`;
    console.log(`  ✓ Uploaded: ${url}`);

    if (j.thumbPath && existsSync(j.thumbPath)) {
      await uploadThumbnail({ accessToken, videoId, thumbPath: j.thumbPath });
    }

    const prev = existsSync(j.recordFile) ? JSON.parse(readFileSync(j.recordFile, "utf8")) : {};
    prev[j.recordKey] = { id: videoId, url, title: j.title, at: new Date().toISOString() };
    writeFileSync(j.recordFile, JSON.stringify(prev, null, 2));
  }
}

main().catch((e) => {
  console.error(`\nUpload error: ${e.message}`);
  process.exit(1);
});
