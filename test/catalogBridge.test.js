// -----------------------------------------------------------------------------
//
// File: test/catalogBridge.test.js
// Disclaimer: "PlayFab Catalog Service Bedrock" by SpindexGFX is an independent project.
// It is not affiliated with, endorsed by, sponsored by, or otherwise connected to Mojang AB,
// Microsoft Corporation, or any of their subsidiaries or affiliates.
// No partnership, approval, or official relationship with Mojang AB or Microsoft is implied.
//
// All names, logos, brands, trademarks, service marks, and registered trademarks are the
// property of their respective owners and are used strictly for identification/reference only.
// This project does not claim ownership of third-party IP and provides no license to use it.
//
// -----------------------------------------------------------------------------

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const http = require("node:http");
const {once} = require("node:events");
const express = require("express");

const {getCatalogBridgeConfig} = require("../src/config/catalogBridge");
const {createCatalogBridgeRouter} = require("../src/routes/catalogBridge");
const {CatalogHandshakeStore, buildProxyRequest, executeProxyPayload, executeSecurePayload, validateCatalogUrl, _internals} = require("../src/services/catalogBridgeService");

function withEnv(values, fn) {
    const previous = {};
    for (const key of Object.keys(values)) {
        previous[key] = process.env[key];
        if (values[key] === undefined) delete process.env[key]; else process.env[key] = values[key];
    }
    return Promise.resolve()
        .then(fn)
        .finally(() => {
            for (const key of Object.keys(values)) {
                if (typeof previous[key] === "undefined") delete process.env[key]; else process.env[key] = previous[key];
            }
        });
}

async function withServer(handler, fn) {
    const server = http.createServer(handler);
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const {port} = server.address();
    try {
        return await fn(`http://127.0.0.1:${port}`);
    } finally {
        server.close();
        await once(server, "close");
    }
}

function encryptForHandshake(handshake, payload, client) {
    const key = _internals.deriveSecureKey(client.getPrivateKey(), handshake.publicKey, handshake.keyId);
    return {
        keyId: handshake.keyId,
        clientPublicKey: client.getPublicKey().toString("base64"),
        ..._internals.encryptSecurePayload(payload, key)
    };
}

function decryptSecureResponse(encrypted, handshake, client) {
    return _internals.decryptSecurePayload({
        keyId: handshake.keyId,
        clientPublicKey: handshake.publicKey,
        iv: encrypted.iv,
        tag: encrypted.tag,
        data: encrypted.data
    }, {privateKey: client.getPrivateKey()});
}

test("catalog bridge disabled does not create routes", () => withEnv({CATALOG_BRIDGE_ENABLED: "false"}, () => {
    assert.equal(createCatalogBridgeRouter(), null);
}));

test("catalog bridge handshake creates keyId, publicKey, and csrfToken", () => withEnv({
    CATALOG_BRIDGE_ENABLED: "true"
}, () => {
    const cfg = getCatalogBridgeConfig();
    const store = new CatalogHandshakeStore(cfg);
    const handshake = store.create();
    assert.ok(handshake.keyId);
    assert.ok(handshake.publicKey);
    assert.ok(handshake.csrfToken);
}));

test("catalog bridge csrf endpoint returns token and sets cookie", () => withEnv({
    CATALOG_BRIDGE_ENABLED: "true",
    CATALOG_BRIDGE_CSRF_ENABLED: "true"
}, () => {
    const app = express();
    app.use(createCatalogBridgeRouter());
    return withServer(app, async (origin) => {
        const res = await fetch(`${origin}/api/security/csrf`);
        const body = await res.json();
        assert.equal(res.status, 200);
        assert.equal(body.ok, true);
        assert.ok(body.csrfToken);
        assert.match(res.headers.get("set-cookie") || "", /catalog_bridge_csrf=/);
    });
}));

test("catalog bridge only allows relative /catalog targets", () => {
    assert.equal(validateCatalogUrl("/catalog/items?x=1"), "/catalog/items?x=1");
    assert.throws(() => validateCatalogUrl("https://example.test/catalog/items"), /Only relative/);
    assert.throws(() => validateCatalogUrl("/other/items"), /Only relative/);
});

test("catalog bridge blocks /catalog/login", () => {
    assert.throws(() => validateCatalogUrl("/catalog/login"), /cannot be proxied/);
    assert.throws(() => validateCatalogUrl("/catalog/login/"), /cannot be proxied/);
});

test("catalog bridge proxy strips client authorization and injects configured bearer token", () => withEnv({
    CATALOG_UPSTREAM_ORIGIN: "https://upstream.invalid",
    CATALOG_BEARER_TOKEN: "server-token"
}, () => {
    const cfg = {...getCatalogBridgeConfig(), proxyEnabled: true};
    const request = buildProxyRequest({
        url: "/catalog/items",
        method: "GET",
        headers: {Authorization: "Bearer client-token", "X-Test": "ok"}
    }, cfg);
    assert.equal(request.headers.Authorization, "Bearer server-token");
    assert.equal(request.headers["X-Test"], "ok");
}));

test("catalog bridge maps axios timeouts to a retryable 504 response", () => {
    const cause = new Error("timeout of 60000ms exceeded");
    cause.code = "ECONNABORTED";
    const err = _internals.normalizeCatalogUpstreamError(cause, 60000);

    assert.equal(err.status, 504);
    assert.equal(err.code, "CATALOG_UPSTREAM_TIMEOUT");
    assert.match(err.publicMessage, /timed out/i);
    assert.equal(err.cause, cause);
});

test("catalog bridge maps other transport failures to 502", () => {
    const err = _internals.normalizeCatalogUpstreamError(Object.assign(new Error("socket closed"), {code: "ECONNRESET"}), 60000);

    assert.equal(err.status, 502);
    assert.equal(err.code, "CATALOG_UPSTREAM_UNAVAILABLE");
});

test("catalog bridge extends only unpaginated full-list GET requests", () => withEnv({
    CATALOG_BRIDGE_UPSTREAM_TIMEOUT_MS: undefined,
    CATALOG_BRIDGE_FULL_SCAN_TIMEOUT_MS: undefined
}, () => {
    const cfg = {...getCatalogBridgeConfig(), proxyEnabled: true,
        upstreamOrigin: "https://example.test", bearerToken: "server-token"};
    assert.equal(cfg.fullScanTimeoutMs, 300000);
    const paths = ["/catalog/marketplace/all/prod", "/catalog/marketplace/free/prod",
        "/catalog/marketplace/tag/prod/3PServerContent"];
    for (const url of paths) {
        assert.equal(buildProxyRequest({url}, cfg).timeout, 300000);
        assert.equal(buildProxyRequest({url: `${url}/?refs=false`}, cfg).timeout, 300000);
        assert.equal(buildProxyRequest({url, method: "POST"}, cfg).timeout, 60000);
        for (const query of ["page=1", "pageSize=24", "skip=0", "limit=24", "page="]) {
            assert.equal(buildProxyRequest({url: `${url}?${query}`}, cfg).timeout, 60000);
        }
    }
    assert.equal(buildProxyRequest({url: "/catalog/marketplace/latest/prod"}, cfg).timeout, 60000);
    assert.equal(buildProxyRequest({url: paths[0]}, {...cfg, fullScanTimeoutMs: 180000}).timeout, 180000);
    assert.equal(buildProxyRequest({url: paths[0]}, {...cfg, requestTimeoutMs: 400000}).timeout, 400000);
}));

test("slow full scans return complete responses through plain and secure bridges", () => withServer((_req, res) => {
    setTimeout(() => {
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify([{Id: "first"}, {Id: "last"}]));
    }, 200);
}, async origin => {
    const cfg = {...getCatalogBridgeConfig(), proxyEnabled: true, secureEnabled: true,
        upstreamOrigin: origin, bearerToken: "server-token", requestTimeoutMs: 50, fullScanTimeoutMs: 1000};
    const payload = {url: "/catalog/marketplace/all/prod", method: "GET"};
    const plain = await executeProxyPayload(payload, cfg);
    assert.equal(plain.status, 200);
    assert.deepEqual(plain.body, [{Id: "first"}, {Id: "last"}]);
    const store = new CatalogHandshakeStore(cfg);
    try {
        const handshake = store.create();
        const client = crypto.createECDH("prime256v1");
        client.generateKeys();
        const encrypted = encryptForHandshake(handshake, {...payload, csrfToken: handshake.csrfToken}, client);
        const result = await executeSecurePayload(encrypted, {...cfg, proxyEnabled: false}, store);
        assert.deepEqual(decryptSecureResponse(result, handshake, client), plain);
    } finally {
        clearInterval(store.timer);
    }
}));

test("stalled full scans still stop at their selected budget and report it", () => withServer((_req, _res) => {}, async origin => {
    const cfg = {...getCatalogBridgeConfig(), proxyEnabled: true,
        upstreamOrigin: origin, bearerToken: "server-token", requestTimeoutMs: 20, fullScanTimeoutMs: 100};
    await assert.rejects(executeProxyPayload({url: "/catalog/marketplace/free/prod"}, cfg), error => {
        assert.equal(error.status, 504);
        assert.match(error.message, /timed out after 100ms/);
        assert.match(error.message, /attempts=1/);
        return true;
    });
}));

test("catalog bridge transport diagnostics identify the endpoint without leaking credentials or query values", () => {
    const cause = Object.assign(new Error("timeout"), {code: "ECONNABORTED"});
    const err = _internals.normalizeCatalogUpstreamError(cause, 60000, {
        url: "https://user:secret@example.test/catalog/prod/search?token=private#hidden",
        method: "POST",
        headers: {Authorization: "Bearer confidential"},
        data: {secret: "sensitive-body"}
    });
    assert.match(err.message, /upstream=https:\/\/example.test/);
    assert.match(err.message, /method=POST/);
    assert.match(err.message, /path="\/catalog\/prod\/search"/);
    assert.doesNotMatch(err.message, /user|secret|token|private|hidden|confidential|sensitive-body/);
    assert.doesNotMatch(err.publicMessage, /example.test|\/catalog\//);
});

test("catalog bridge aborts a stalled upstream with 504 without replaying the request", async () => {
    let requests = 0;
    await withServer((_req, _res) => { requests++; }, async (origin) => {
        const cfg = {...getCatalogBridgeConfig(), proxyEnabled: true,
            upstreamOrigin: origin, bearerToken: "server-token", requestTimeoutMs: 100};
        await assert.rejects(executeProxyPayload({url: "/catalog/stalled", method: "GET"}, cfg), error => {
            assert.equal(error.status, 504);
            assert.equal(error.code, "CATALOG_UPSTREAM_TIMEOUT");
            assert.match(error.message, /attempts=1, method=GET, path="\/catalog\/stalled"/);
            return true;
        });
        assert.equal(requests, 1);
    });
});

test("catalog bridge plain proxy forwards allowed catalog requests", () => withServer((req, res) => {
    assert.equal(req.url, "/catalog/items?take=1");
    assert.equal(req.headers.authorization, "Bearer server-token");
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ok: true}));
}, (origin) => withEnv({
    CATALOG_UPSTREAM_ORIGIN: origin,
    CATALOG_BEARER_TOKEN: "server-token"
}, async () => {
    const cfg = {...getCatalogBridgeConfig(), proxyEnabled: true};
    const result = await executeProxyPayload({url: "/catalog/items?take=1", method: "GET"}, cfg);
    assert.equal(result.status, 200);
    assert.equal(result.body.ok, true);
    assert.match(result.contentType, /application\/json/);
})));

test("catalog bridge secure proxy performs encrypted roundtrip", () => withServer((_req, res) => {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({secure: true}));
}, (origin) => withEnv({
    CATALOG_BRIDGE_CSRF_ENABLED: "true",
    CATALOG_UPSTREAM_ORIGIN: origin,
    CATALOG_BEARER_TOKEN: "server-token"
}, async () => {
    const cfg = {...getCatalogBridgeConfig(), secureEnabled: true, proxyEnabled: false};
    const store = new CatalogHandshakeStore(cfg);
    const handshake = store.create();
    const client = crypto.createECDH("prime256v1");
    client.generateKeys();
    const encrypted = encryptForHandshake(handshake, {
        csrfToken: handshake.csrfToken,
        url: "/catalog/items",
        method: "GET"
    }, client);
    const response = await executeSecurePayload(encrypted, cfg, store);
    const decrypted = decryptSecureResponse(response, handshake, client);
    assert.equal(decrypted.status, 200);
    assert.equal(decrypted.body.secure, true);
})));
