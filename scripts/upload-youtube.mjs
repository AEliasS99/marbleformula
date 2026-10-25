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
import { setDefaultResultOrder } from "node:dns";
import { closeSync, copyFileSync, existsSync, openSync, readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { setDefaultAutoSelectFamily } from "node:net";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { CIRCUITS } from "../src/gp/circuits/index.js";

setDefaultResultOrder("ipv4first");
setDefaultAutoSelectFamily(false);

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const VIDEO_CLOUD_DIR = process.env.VIDEO_OUT || `${homedir()}/GoogleCloud`;
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
    channelOnly: false,
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
    else if (a === "--channel") o.channelOnly = true;
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
  if (!existsSync(CLIENT_FILE) && existsSync(`${VIDEO_CLOUD_DIR}/youtube-auth/youtube-client.json`)) {
    copyFileSync(`${VIDEO_CLOUD_DIR}/youtube-auth/youtube-client.json`, CLIENT_FILE);
  }
  if (!existsSync(TOKEN_FILE) && existsSync(`${VIDEO_CLOUD_DIR}/youtube-auth/youtube-token.json`)) {
    copyFileSync(`${VIDEO_CLOUD_DIR}/youtube-auth/youtube-token.json`, TOKEN_FILE);
  }
  if (!existsSync(CLIENT_FILE)) {
    // Auto-import from ~/Downloads/client_secret*.json if the user just downloaded it!
    const dl = `${homedir()}/Downloads`;
    if (existsSync(dl)) {
      const matches = readdirSync(dl)
        .filter((f) => f.startsWith("client_secret") && f.endsWith(".json"))
        .map((f) => ({ path: `${dl}/${f}`, mtime: statSync(`${dl}/${f}`).mtimeMs }))
        .sort((a, b) => b.mtime - a.mtime);
      if (matches.length > 0) {
        copyFileSync(matches[0].path, CLIENT_FILE);
        console.log(`✓ Automatically imported ${matches[0].path} -> .youtube-client.json`);
      }
    }
  }
  if (!existsSync(CLIENT_FILE)) {
    console.error(`\nMissing ${CLIENT_FILE.replace(ROOT, "")}!`);
    console.error(`To set up YouTube OAuth in 60 seconds:`);
    console.error(`  1. Open: https://console.cloud.google.com/auth/clients?project=gen-lang-client-0869187042`);
    console.error(`  2. Click "+ Create Client" -> Application type: "Desktop app" -> Create`);
    console.error(`  3. Click "Download JSON" (it will go to ~/Downloads, and this script will auto-detect it!)`);
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

  console.log(`\nOpening Google Chrome to authorize YouTube channel (@MarbleFormula)...`);
  console.log(`If it doesn't open automatically, visit:\n  ${authUrl}\n`);
  execFile("open", ["-a", "Google Chrome", authUrl]);

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

  const sessionFile = `${filePath}.session.json`;
  let uploadUrl = null;
  let offset = 0;

  if (existsSync(sessionFile)) {
    try {
      const savedSession = JSON.parse(readFileSync(sessionFile, "utf8"));
      if (savedSession.uploadUrl && savedSession.size === size) {
        const probeRes = await fetch(savedSession.uploadUrl, {
          method: "PUT",
          headers: {
            "Content-Length": "0",
            "Content-Range": `bytes */${size}`,
          },
        });
        if (probeRes.status === 308) {
          const range = probeRes.headers.get("range");
          offset = range ? Number(range.split("-")[1]) + 1 : 0;
          uploadUrl = savedSession.uploadUrl;
          console.log(`  ↻ Resuming previous upload session at ${((offset / size) * 100).toFixed(1)}% (${(offset / 1e6).toFixed(0)} MB)...`);
        }
      }
    } catch {
      uploadUrl = null;
      offset = 0;
    }
  }

  if (!uploadUrl) {
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
    uploadUrl = initRes.headers.get("location");
    if (!uploadUrl) throw new Error("YouTube did not return a resumable upload Location header");
    writeFileSync(sessionFile, JSON.stringify({ uploadUrl, size, createdAt: Date.now() }, null, 2));
  }

  const fd = openSync(filePath, "r");
  try {
    const { readSync } = await import("node:fs");
    while (offset < size) {
      const len = Math.min(CHUNK_SIZE, size - offset);
      const buf = Buffer.allocUnsafe(len);
      readSync(fd, buf, 0, len, offset);

      const end = offset + len - 1;
      let chunkRes = null;
      for (let attempt = 1; attempt <= 8; attempt++) {
        try {
          chunkRes = await fetch(uploadUrl, {
            method: "PUT",
            headers: {
              "Content-Length": String(len),
              "Content-Range": `bytes ${offset}-${end}/${size}`,
              "Content-Type": "video/mp4",
            },
            body: buf,
          });
          if (chunkRes.status >= 500 && attempt < 8) {
            await new Promise((r) => setTimeout(r, 2000 * attempt));
            continue;
          }
          break;
        } catch (err) {
          if (attempt === 8) throw err;
          process.stdout.write(`\n  ⚠️ Network hiccup at ${(offset / 1e6).toFixed(0)} MB (attempt ${attempt}/8), querying server offset & retrying...\n`);
          await new Promise((r) => setTimeout(r, 2500 * attempt));
          try {
            const probe = await fetch(uploadUrl, {
              method: "PUT",
              headers: { "Content-Length": "0", "Content-Range": `bytes */${size}` },
            });
            if (probe.status === 308) {
              const range = probe.headers.get("range");
              if (range) {
                const serverNext = Number(range.split("-")[1]) + 1;
                if (serverNext > offset) {
                  offset = serverNext;
                  chunkRes = { status: 308, resumed: true };
                  break;
                }
              }
            } else if (probe.ok) {
              chunkRes = probe;
              break;
            }
          } catch {
            // ignore probe error, retry PUT
          }
        }
      }

      if (chunkRes.resumed) {
        const pct = ((offset / size) * 100).toFixed(1);
        process.stdout.write(`\r  Uploading ${filePath.replace(ROOT, "")}: ${pct}% (${(offset / 1e6).toFixed(0)}/${(size / 1e6).toFixed(0)} MB)`);
      } else if (chunkRes.status === 308) {
        offset += len;
        const pct = ((offset / size) * 100).toFixed(1);
        process.stdout.write(`\r  Uploading ${filePath.replace(ROOT, "")}: ${pct}% (${(offset / 1e6).toFixed(0)}/${(size / 1e6).toFixed(0)} MB)`);
      } else if (chunkRes.ok) {
        process.stdout.write(`\r  Uploading ${filePath.replace(ROOT, "")}: 100.0% (${(size / 1e6).toFixed(0)} MB)\n`);
        try { unlinkSync(sessionFile); } catch {}
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

async function uploadThumbnail({ videoId, thumbPath }) {
  const freshToken = await getAccessToken();
  const bytes = readFileSync(thumbPath);
  const res = await fetch(
    `https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${encodeURIComponent(videoId)}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${freshToken}`,
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

async function updateChannelBranding(accessToken) {
  const chRes = await fetch("https://www.googleapis.com/youtube/v3/channels?part=id,snippet,brandingSettings&mine=true", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const chData = await chRes.json();
  const item = chData.items?.[0];
  if (!item) throw new Error(`Could not fetch channel: ${JSON.stringify(chData)}`);

  let bannerExternalUrl = item.brandingSettings?.image?.bannerExternalUrl;
  const bannerPath = `${ROOT}out/gp/channel-banner.jpg`;
  if (existsSync(bannerPath)) {
    console.log(`Uploading channel banner (${bannerPath.replace(ROOT, "")})...`);
    const bytes = readFileSync(bannerPath);
    const bRes = await fetch("https://www.googleapis.com/upload/youtube/v3/channelBanners/insert", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "image/jpeg",
        "Content-Length": String(bytes.length),
      },
      body: bytes,
    });
    const bJson = await bRes.json();
    if (bRes.ok && bJson.url) {
      bannerExternalUrl = bJson.url;
      console.log(`  ✓ Uploaded channel banner image`);
    } else {
      console.warn(`  ⚠️ Banner upload response (${bRes.status}): ${JSON.stringify(bJson)}`);
    }
  }

  const description = [
    "Welcome to Marble Formula (@MarbleFormula) — 4K 60fps 3D Marble Racing, Checkpoint Elimination Tournaments (\"Don't Be Last!\"), and the Marble Formula Championship 🏁",
    "",
    "• CHECKPOINT ELIMINATION RACES: 10 glowing neon & obsidian marbles battle down multi-stage tracks with Plinko pegboards, splitters, and Catch-and-Release Checkpoint Gates. Survive the Qualifiers to reach the Grand Final!",
    "• MARBLE FORMULA CHAMPIONSHIP: 20 country marbles across 10 constructor teams racing on high-banked Formula 1 circuits (Monaco, Silverstone, Spa, Suzuka, Monza) packed with brutal machines: The Vortex, The Hammer, The Whirlwind, The Turntable, and Red Disqualification Zones.",
    "",
    "100% real Rapier 3D physics simulation in 4K 60fps with tactile ASMR glass-on-glass sound synthesis. Pick your marble color or country in the comments!",
    "",
    "🌐 Official Website: https://marbleformula.com",
  ].join("\n");

  const keywords = `"Marble Races" Marbles "Marble Racing" "Marble Run" "Elimination Race" "3D Marble Race" ASMR Sensory "Marble Formula" "Dont Be Last" "MFC 2027" "country marbles" satisfying`;

  const body = {
    id: item.id,
    brandingSettings: {
      channel: {
        ...(item.brandingSettings?.channel ?? {}),
        description,
        keywords,
        defaultLanguage: "en",
      },
      ...(bannerExternalUrl ? { image: { bannerExternalUrl } } : {}),
    },
  };

  const upRes = await fetch("https://www.googleapis.com/youtube/v3/channels?part=brandingSettings", {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json; charset=UTF-8",
    },
    body: JSON.stringify(body),
  });
  const upJson = await upRes.json();
  if (!upRes.ok) {
    throw new Error(`Channel metadata update failed (${upRes.status}): ${JSON.stringify(upJson)}`);
  }
  console.log(`✓ Updated @MarbleFormula channel description, keywords, and banner!`);
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.authOnly) {
    const client = loadClient();
    const token = await authorizeInteractive(client);
    await printChannelInfo(token);
    return;
  }
  if (opts.channelOnly) {
    const token = await getAccessToken();
    await printChannelInfo(token);
    await updateChannelBranding(token);
    return;
  }

  // Build upload queue
  const jobs = [];
  if (opts.file) {
    const roundId = opts.round ?? "r5-monza";
    const metaCandidates = [
      `${ROOT}out/gp/${roundId}-youtube.json`,
      `${ROOT}out/factory/s${opts.season}/${roundId}/youtube.json`,
      `${ROOT}out/${roundId}-youtube.json`,
    ];
    const metaPath = metaCandidates.find((p) => existsSync(p));
    if (!metaPath) throw new Error(`Missing metadata file for ${roundId}`);
    const meta = JSON.parse(readFileSync(metaPath, "utf8"));
    const thumbCandidates = [
      `${ROOT}out/gp/${roundId}-thumb.jpg`,
      `${ROOT}out/${roundId}-thumb.jpg`,
      `${ROOT}out/factory/s${opts.season}/${roundId}/thumb.jpg`,
    ];
    const fileCandidates = opts.file.startsWith("/")
      ? [opts.file]
      : [
          `${VIDEO_CLOUD_DIR}/${opts.file.replace(/^out\/(gp\/)?/, "")}`,
          `${VIDEO_CLOUD_DIR}/${opts.file}`,
          `${VIDEO_CLOUD_DIR}/marmot/races/${opts.file}`,
        ];
    const resolvedFile = fileCandidates.find((p) => existsSync(p)) ?? fileCandidates[0];
    jobs.push({
      label: `${roundId} (single file)`,
      filePath: resolvedFile,
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
      const cloudVideoDir = `${VIDEO_CLOUD_DIR}/factory/s${opts.season}/${c.id}/`;
      const metaPath = `${dir}youtube.json`;
      if (!existsSync(metaPath)) continue;
      const meta = JSON.parse(readFileSync(metaPath, "utf8"));
      const recordFile = `${dir}uploaded.json`;
      const uploaded = existsSync(recordFile) ? JSON.parse(readFileSync(recordFile, "utf8")) : {};

      const videoFile = [`${cloudVideoDir}video.mp4`, `${VIDEO_CLOUD_DIR}/s${opts.season}-${c.id}.mp4`].find((p) => existsSync(p));
      if ((!opts.only || opts.only === "video") && videoFile) {
        if (!uploaded.video || opts.force) {
          const thumbCandidates = [`${dir}thumb.jpg`, `${ROOT}out/gp/${c.id}-thumb.jpg`];
          jobs.push({
            label: `Season ${opts.season} · ${c.id} (4K Full Race)`,
            filePath: videoFile,
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

      const shortFile = [`${cloudVideoDir}short.mp4`, `${VIDEO_CLOUD_DIR}/s${opts.season}-${c.id}-short.mp4`].find((p) => existsSync(p));
      if ((!opts.only || opts.only === "short") && shortFile) {
        if (!uploaded.short || opts.force) {
          jobs.push({
            label: `Season ${opts.season} · ${c.id} (Vertical Short)`,
            filePath: shortFile,
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
  console.error(`\nUpload error: ${e.message}`, e.cause ?? "");
  process.exit(1);
});
