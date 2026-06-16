import { chromium } from "playwright";

const PORT = Number(process.env.LINKEDIN_PROXY_PORT ?? process.env.PORT ?? 3002);
const DEFAULT_TARGET = "https://www.linkedin.com/";
const REQUEST_TIMEOUT_MS = Number(process.env.LINKEDIN_TIMEOUT_MS ?? 45_000);
const DEFAULT_DATAIMPULSE_HOST = "gw.dataimpulse.com";
const DEFAULT_DATAIMPULSE_PORT = "823";

function cleanHeaderValue(value) {
  return value.replace(/[\r\n]/g, "");
}

function normalizeLinkedInUrl(value) {
  const url = new URL(value || DEFAULT_TARGET);
  const hostname = url.hostname.toLowerCase();

  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("Only http and https URLs are supported");
  }

  if (hostname !== "linkedin.com" && !hostname.endsWith(".linkedin.com")) {
    throw new Error("Only linkedin.com URLs are allowed");
  }

  return url.toString();
}

function decodeUrlPart(value) {
  if (!value) return undefined;

  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function getDataImpulseProxy() {
  const rawProxy =
    process.env.DATAIMPULSE_PROXY_URL ??
    process.env.DATAIMPULSE_PROXY_SERVER ??
    process.env.PROXY_URL;

  const proxySource = rawProxy
    ? rawProxy.includes("://")
      ? rawProxy
      : `http://${rawProxy}`
    : `http://${process.env.DATAIMPULSE_PROXY_HOST ?? DEFAULT_DATAIMPULSE_HOST}:${
        process.env.DATAIMPULSE_PROXY_PORT ?? DEFAULT_DATAIMPULSE_PORT
      }`;

  const proxyUrl = new URL(proxySource);

  const username =
    process.env.DATAIMPULSE_PROXY_USERNAME ??
    process.env.DATAIMPULSE_USERNAME ??
    process.env.PROXY_USERNAME ??
    decodeUrlPart(proxyUrl.username);

  const password =
    process.env.DATAIMPULSE_PROXY_PASSWORD ??
    process.env.DATAIMPULSE_PASSWORD ??
    process.env.PROXY_PASSWORD ??
    decodeUrlPart(proxyUrl.password);

  proxyUrl.username = "";
  proxyUrl.password = "";

  const proxy = {
    server: proxyUrl.toString().replace(/\/$/, ""),
  };

  if (username) proxy.username = username;
  if (password) proxy.password = password;

  if (!proxy.username || !proxy.password) {
    throw new Error(
      "Missing DataImpulse credentials. Set DATAIMPULSE_PROXY_USERNAME/DATAIMPULSE_PROXY_PASSWORD or DATAIMPULSE_PROXY_URL.",
    );
  }

  return proxy;
}

function statusForResponse(status) {
  return Number.isInteger(status) && status >= 200 && status <= 599 ? status : 200;
}

async function scrapeLinkedIn(targetUrl) {
  const browser = await chromium.launch({
    headless: process.env.HEADLESS !== "false",
    proxy: getDataImpulseProxy(),
  });

  try {
    const context = await browser.newContext({
      locale: "en-US",
      userAgent:
        process.env.LINKEDIN_USER_AGENT ??
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    });

    const page = await context.newPage();
    const response = await page.goto(targetUrl, {
      waitUntil: "domcontentloaded",
      timeout: REQUEST_TIMEOUT_MS,
    });

    await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});

    return {
      status: response?.status() ?? 200,
      requestedUrl: targetUrl,
      finalUrl: page.url(),
      title: await page.title(),
      html: await page.content(),
    };
  } finally {
    await browser.close();
  }
}

Bun.serve({
  port: PORT,
  idleTimeout: Math.ceil(REQUEST_TIMEOUT_MS / 1000) + 15,
  async fetch(request) {
    const requestUrl = new URL(request.url);

    if (requestUrl.pathname !== "/linkedin") {
      return Response.json({
        message: "Use GET /linkedin?url=https://www.linkedin.com/in/example",
      });
    }

    if (request.method !== "GET") {
      return Response.json({ error: "Method not allowed" }, { status: 405 });
    }

    try {
      const targetUrl = normalizeLinkedInUrl(requestUrl.searchParams.get("url"));
      const result = await scrapeLinkedIn(targetUrl);

      if (requestUrl.searchParams.get("format") === "html") {
        return new Response(result.html, {
          status: statusForResponse(result.status),
          headers: {
            "content-type": "text/html; charset=utf-8",
            "x-linkedin-final-url": cleanHeaderValue(result.finalUrl),
          },
        });
      }

      return Response.json(result, { status: statusForResponse(result.status) });
    } catch (error) {
      return Response.json(
        { error: error instanceof Error ? error.message : "Failed to scrape LinkedIn" },
        { status: 500 },
      );
    }
  },
});

console.log(`LinkedIn proxy listening on http://localhost:${PORT}/linkedin`);
