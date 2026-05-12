// -----------------------------------------------------------------------------
//
// File: test/etag.test.js
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
const {EventEmitter} = require("node:events");
const {_internals} = require("../src/middleware/etag");

class FakeResponse extends EventEmitter {
    constructor() {
        super();
        this.headers = {};
        this.chunks = [];
    }

    setHeader(name, value) {
        this.headers[name] = value;
    }

    write(chunk) {
        this.chunks.push(String(chunk));
        return true;
    }

    end(chunk = "") {
        if (chunk) this.chunks.push(String(chunk));
    }
}

test("shouldStreamJsonArray only streams large arrays", () => {
    assert.equal(_internals.shouldStreamJsonArray(new Array(4999).fill({})), false);
    assert.equal(_internals.shouldStreamJsonArray(new Array(5000).fill({})), true);
});

test("streamJsonArray writes valid JSON without building one large body first", async () => {
    const res = new FakeResponse();

    await _internals.streamJsonArray(res, [{Id: "one"}, {Id: "two"}]);

    assert.equal(res.headers["Content-Type"], "application/json; charset=utf-8");
    assert.deepEqual(JSON.parse(res.chunks.join("")), [{Id: "one"}, {Id: "two"}]);
});
