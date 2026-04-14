const test = require("node:test");
const assert = require("node:assert/strict");
const {assertSafeWebhookUrl} = require("../src/utils/webhookSecurity");

test("assertSafeWebhookUrl accepts public https urls", () => {
    assert.equal(assertSafeWebhookUrl("https://discord.com/api/webhooks/1/2"), "https://discord.com/api/webhooks/1/2");
});

test("assertSafeWebhookUrl rejects non-https urls", () => {
    assert.throws(() => assertSafeWebhookUrl("http://example.com/webhook"), {
        message: "Webhook URL must use HTTPS."
    });
});

test("assertSafeWebhookUrl rejects localhost and private networks", () => {
    assert.throws(() => assertSafeWebhookUrl("https://localhost/webhook"), {
        message: "Webhook URL host is not allowed."
    });
    assert.throws(() => assertSafeWebhookUrl("https://127.0.0.1/webhook"), {
        message: "Webhook URL host is not allowed."
    });
    assert.throws(() => assertSafeWebhookUrl("https://192.168.1.10/webhook"), {
        message: "Webhook URL host is not allowed."
    });
});

test("assertSafeWebhookUrl strips fragments and credentials are rejected", () => {
    assert.equal(assertSafeWebhookUrl("https://example.com/path#fragment"), "https://example.com/path");
    assert.throws(() => assertSafeWebhookUrl("https://user:pass@example.com/path"), {
        message: "Webhook URL must not include credentials."
    });
});

test("assertSafeWebhookUrl honors configured host allowlist", () => {
    const previous = process.env.WEBHOOK_ALLOWED_HOSTS;
    process.env.WEBHOOK_ALLOWED_HOSTS = "discord.com, hooks.slack.com";

    try {
        assert.equal(assertSafeWebhookUrl("https://hooks.slack.com/services/test"), "https://hooks.slack.com/services/test");
        assert.throws(() => assertSafeWebhookUrl("https://example.com/webhook"), {
            message: "Webhook URL host is not allowed."
        });
    } finally {
        if (typeof previous === "undefined") delete process.env.WEBHOOK_ALLOWED_HOSTS; else process.env.WEBHOOK_ALLOWED_HOSTS = previous;
    }
});
