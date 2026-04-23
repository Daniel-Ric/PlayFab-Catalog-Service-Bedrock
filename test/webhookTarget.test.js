const test = require("node:test");
const assert = require("node:assert/strict");
const {assertSafeWebhookUrl, isPrivateIp, parseWebhookUrl} = require("../src/utils/webhookTarget");

test("parseWebhookUrl accepts public HTTP and HTTPS URLs", () => {
    for (const value of ["https://example.com/hooks/catalog", "http://example.com/hooks/catalog"]) {
        const parsed = parseWebhookUrl(value);
        assert.equal(parsed.hostname, "example.com");
        assert.equal(parsed.pathname, "/hooks/catalog");
    }
});

test("parseWebhookUrl rejects invalid or unsafe URL forms", () => {
    const cases = [
        ["not a url", /valid absolute URL/i],
        ["ftp://example.com/hook", /HTTP or HTTPS/i],
        ["https://user:pass@example.com/hook", /embedded credentials/i],
        ["http://localhost:3000/hook", /not allowed/i],
        ["https://service.internal/hook", /not allowed/i],
        ["https://printer.lan/hook", /not allowed/i],
        ["http://127.0.0.1:3000/hook", /private or local IP address/i],
        ["http://10.1.2.3/hook", /private or local IP address/i]
    ];

    for (const [value, pattern] of cases) {
        assert.throws(() => parseWebhookUrl(value), pattern, value);
    }
});

test("isPrivateIp detects IPv4 private, local, invalid, and public ranges", () => {
    const privateValues = [
        "0.0.0.0",
        "10.1.2.3",
        "127.0.0.1",
        "169.254.10.20",
        "172.16.0.1",
        "172.31.255.255",
        "192.168.1.10",
        "224.0.0.1",
        "not-an-ip"
    ];
    const publicValues = ["8.8.8.8", "93.184.216.34", "172.15.255.255", "172.32.0.1"];

    for (const value of privateValues) {
        assert.equal(isPrivateIp(value), true, value);
    }
    for (const value of publicValues) {
        assert.equal(isPrivateIp(value), false, value);
    }
});

test("isPrivateIp detects IPv6 private, local, multicast, and public ranges", () => {
    const privateValues = ["::", "::1", "fe80::1", "fc00::1", "fd12:3456::1", "ff02::1"];
    const publicValues = ["2001:4860:4860::8888", "2606:2800:220:1:248:1893:25c8:1946"];

    for (const value of privateValues) {
        assert.equal(isPrivateIp(value), true, value);
    }
    for (const value of publicValues) {
        assert.equal(isPrivateIp(value), false, value);
    }
});

test("assertSafeWebhookUrl rejects hostnames resolving to local IPs", async () => {
    await assert.rejects(() => assertSafeWebhookUrl("https://hooks.example.test/a", {
        lookup: async () => [{address: "127.0.0.1", family: 4}]
    }), /private or local IP address/i);
});

test("assertSafeWebhookUrl rejects unresolved hostnames", async () => {
    await assert.rejects(() => assertSafeWebhookUrl("https://hooks.example.test/a", {
        lookup: async () => {
            throw new Error("NXDOMAIN");
        }
    }), /could not be resolved/i);

    await assert.rejects(() => assertSafeWebhookUrl("https://hooks.example.test/a", {
        lookup: async () => []
    }), /could not be resolved/i);
});

test("assertSafeWebhookUrl rejects mixed public and private DNS answers", async () => {
    await assert.rejects(() => assertSafeWebhookUrl("https://hooks.example.test/a", {
        lookup: async () => [
            {address: "93.184.216.34", family: 4},
            {address: "10.1.2.3", family: 4}
        ]
    }), /private or local IP address/i);
});

test("assertSafeWebhookUrl normalizes safe URLs", async () => {
    const url = await assertSafeWebhookUrl("https://hooks.example.com/catalog#frag", {
        lookup: async () => [{address: "93.184.216.34", family: 4}]
    });

    assert.equal(url, "https://hooks.example.com/catalog");
});

test("assertSafeWebhookUrl accepts direct public IPs without DNS lookup", async () => {
    let lookupCalled = false;

    const url = await assertSafeWebhookUrl("https://93.184.216.34/catalog?event=item.updated#frag", {
        lookup: async () => {
            lookupCalled = true;
            return [{address: "127.0.0.1", family: 4}];
        }
    });

    assert.equal(lookupCalled, false);
    assert.equal(url, "https://93.184.216.34/catalog?event=item.updated");
});
