const test = require("node:test");
const assert = require("node:assert/strict");
const {resolveTitle} = require("../src/utils/titles");

test("resolveTitle normalizes aliases from input", () => {
    assert.equal(resolveTitle(" Prod "), "20CA2");
});

test("resolveTitle keeps known aliases valid after normalization", () => {
    assert.equal(resolveTitle("DEv"), "E9D1");
});
