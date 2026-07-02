const test = require("node:test");
const assert = require("node:assert/strict");
const {_internals} = require("../src/services/salesWatcher");

test("buildSaleEntry projects item details and sale metadata", () => {
    const entry = _internals.buildSaleEntry({
        Id: "sale-store",
        Title: {NEUTRAL: "Summer Sale"},
        Description: {NEUTRAL: "Discounted packs"},
        DisplayProperties: {
            discount: 0.5,
            startDate: "2026-06-01T00:00:00.000Z",
            endDate: "2026-06-30T00:00:00.000Z"
        },
        ItemReferences: [{
            Id: "item-1",
            Price: {
                Prices: [{
                    Amounts: [{CurrencyId: "Minecoin", Amount: 330}]
                }]
            }
        }]
    }, [], new Map([["item-1", {
        Id: "item-1",
        Title: {NEUTRAL: "Sale Item"},
        Description: {NEUTRAL: "Item description"},
        DisplayProperties: {creatorName: "Creator One"},
        Images: [{Tag: "thumbnail", Url: "https://example.com/thumb.png"}],
        Tags: ["skin_pack"],
        Platforms: ["Windows"],
        CreationDate: "2026-05-01T00:00:00.000Z",
        StartDate: "2026-05-02T00:00:00.000Z"
    }]]));

    assert.equal(entry.id, "sale-store");
    assert.equal(entry.count, 1);
    assert.equal(entry.sale.title, "Summer Sale");
    assert.equal(entry.sale.discountPercent, 50);
    assert.equal(entry.sale.items[0].id, "item-1");
    assert.equal(entry.sale.items[0].title, "Sale Item");
    assert.equal(entry.sale.items[0].creatorName, "Creator One");
    assert.equal(entry.sale.items[0].prices[0].amount, 330);
    assert.equal(entry.sale.items[0].sale.id, "sale-store");
});

test("buildPayload includes item.created style item lists and sale buckets", () => {
    const snap = new Map([["sale-store", _internals.buildSaleEntry({
        Id: "sale-store",
        Title: {NEUTRAL: "Summer Sale"},
        ItemReferences: [{Id: "item-1"}]
    }, [], new Map([["item-1", {
        Id: "item-1",
        Title: {NEUTRAL: "Sale Item"},
        DisplayProperties: {creatorName: "Creator One"},
        Images: [{Tag: "thumbnail", Url: "https://example.com/thumb.png"}]
    }]]))]]);

    const payload = _internals.buildPayload(123, snap, [{
        storeId: "sale-store",
        type: "created",
        before: null,
        after: snap.get("sale-store").sale,
        items: snap.get("sale-store").sale.items.map(item => ({...item, __saleChangeType: "created"}))
    }]);

    assert.equal(payload.ts, 123);
    assert.equal(payload.stores, 1);
    assert.equal(payload.count, 1);
    assert.equal(payload.totalItems, 1);
    assert.equal(payload.itemsPerCreator["Creator One"], 1);
    assert.equal(payload.items[0].title, "Sale Item");
    assert.equal(payload.items[0].sale.title, "Summer Sale");
    assert.equal(payload.sales["sale-store"].items[0].creatorName, "Creator One");
    assert.equal(payload.changes[0].type, "created");
});

test("buildPayload limits sale.update items to changed sale items", () => {
    const beforeSale = _internals.buildSaleEntry({
        Id: "sale-store",
        Title: {NEUTRAL: "Summer Sale"},
        ItemReferences: [{
            Id: "item-1",
            Price: {Prices: [{Amounts: [{CurrencyId: "Minecoin", Amount: 310}]}]}
        }, {Id: "item-2"}]
    }, [], new Map([
        ["item-1", {
            Id: "item-1",
            Title: {NEUTRAL: "Changed Item"},
            DisplayProperties: {creatorName: "Changed Creator"}
        }],
        ["item-2", {
            Id: "item-2",
            Title: {NEUTRAL: "Stable Item"},
            DisplayProperties: {creatorName: "Stable Creator"}
        }]
    ]));
    const afterSale = _internals.buildSaleEntry({
        Id: "sale-store",
        Title: {NEUTRAL: "Summer Sale"},
        ItemReferences: [{
            Id: "item-1",
            Price: {Prices: [{Amounts: [{CurrencyId: "Minecoin", Amount: 160}]}]}
        }, {Id: "item-2"}]
    }, [], new Map([
        ["item-1", {
            Id: "item-1",
            Title: {NEUTRAL: "Changed Item New"},
            DisplayProperties: {creatorName: "Changed Creator"}
        }],
        ["item-2", {
            Id: "item-2",
            Title: {NEUTRAL: "Stable Item"},
            DisplayProperties: {creatorName: "Stable Creator"}
        }]
    ]));
    const otherSale = _internals.buildSaleEntry({
        Id: "other-sale",
        Title: {NEUTRAL: "Other Sale"},
        ItemReferences: [{Id: "item-3"}]
    }, [], new Map([["item-3", {
        Id: "item-3",
        Title: {NEUTRAL: "Other Item"},
        DisplayProperties: {creatorName: "Other Creator"}
    }]]));
    const snap = new Map([["sale-store", afterSale], ["other-sale", otherSale]]);
    const changes = _internals.diff(new Map([["sale-store", beforeSale], ["other-sale", otherSale]]), snap);
    const payload = _internals.buildPayload(123, snap, changes);

    assert.equal(payload.count, 1);
    assert.equal(payload.totalItems, 3);
    assert.equal(payload.items[0].id, "item-1");
    assert.equal(payload.items[0].__saleChangeType, "updated");
    assert.equal(payload.changes[0].items.length, 1);
    assert.equal(payload.changes[0].items[0].id, "item-1");
    assert.equal(payload.sales["other-sale"].items[0].id, "item-3");
});
