const {EventEmitter} = require("events");
const eventBus = new EventEmitter();
eventBus.setMaxListeners(0);
module.exports = {eventBus};
