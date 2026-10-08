const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");

function clientIp(trust, remoteAddress, forwardedFor = "198.51.100.7") {
    const app = express();
    app.set("trust proxy", trust);
    const req = Object.create(app.request);
    req.socket = {remoteAddress};
    req.headers = {"x-forwarded-for": forwardedFor};
    return req.ip;
}

// Guard the dependency boundary used by rate limiting and SSE client budgets.
// Reverting proxy-addr to 2.0.7 lets untrusted peers choose their client IP.
for (const trust of ["::ffff:10.0.0.0/8", "::/1"]) {
    for (const peer of ["203.0.113.9", "::ffff:203.0.113.9"]) {
        test(`trust subnet ${trust} ignores forwarded IP from untrusted peer ${peer}`, () => {
            assert.equal(clientIp([trust], peer), peer);
        });
    }
}

test("trusted IPv4 and correctly mapped IPv6 proxies retain forwarded client IPs", () => {
    for (const trust of ["10.0.0.0/8", "::ffff:10.0.0.0/104"]) {
        for (const peer of ["10.1.2.3", "::ffff:10.1.2.3"]) {
            assert.equal(clientIp([trust], peer), "198.51.100.7");
        }
        assert.equal(clientIp([trust], "203.0.113.9"), "203.0.113.9");
    }
});

test("IPv6 subnet and default single-hop proxy configurations still work", () => {
    assert.equal(clientIp(["2001:db8::/32"], "2001:db8::1"), "198.51.100.7");
    assert.equal(clientIp(["2001:db8::/32"], "2001:db9::1"), "2001:db9::1");
    assert.equal(clientIp(1, "127.0.0.1", "192.0.2.8, 198.51.100.7"), "198.51.100.7");
});
