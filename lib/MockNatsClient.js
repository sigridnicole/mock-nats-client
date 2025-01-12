const uuid = require("uuid");
const utils = require("./utils");
const EventEmitter = require("events");

class MockNatsClient extends EventEmitter {

	constructor(opts = {}) {
		super();
		this.subs = [];
		this.useJson = 'json' in opts ? opts.json : false;
		this.preserveBuffers = 'preserveBuffers' in opts ? opts.preserveBuffers : false;
	}

	/**
	 * Mock connect. Will not do anything except from setting
	 * property `connected` to true and emit `connect` event.
	 *
	 * @param  {object} opts
	 */
	connect(opts) {
		this.connected = true;

		setTimeout(() => {
			this.emit("connect");
		}, 10);
	}

	/**
	 * Mock close. Will empty subscriptions and set `connected` to false.
	 */
	close() {
		this.subs = [];
		this.connected = false;

		process.nextTick(() => this.emit('disconnect'));
	}

	/**
	 * Subscribe to subject.
	 *
	 * @param  {string}   subject       subject to subscribe to
	 * @param  {mixed}    opts          options or callback
	 * @param  {Function} cb
	 * @return {string}                 subject id (sid)
	 */
	subscribe(subject, opts, cb /* (msg, replyTo, subject) */) {
		const sid = uuid.v4();

		let parsedOpts;
		let parsedCb;

		if (typeof opts === "function") {
			parsedCb = opts;
			parsedOpts = {};
		} else {
			parsedCb = cb;
			parsedOpts = opts || {};
		}

		this.subs.push({
			subject: subject,
			queue: parsedOpts.queue,
			cb: parsedCb,
			sid: sid,
			received: 0
		});

		return sid;
	}

	/**
	 * Publish message to subject.
	 *
	 * @param  {string} subject
	 * @param  {string} message
	 * @param  {string} replyTo subject
	 */
	publish(subject, message, replyTo) {
		// Messages are published as buffers
		const content = this.useJson ? JSON.stringify(message) : message;
		const payload = Buffer.isBuffer(content) ? content : Buffer.from(content);

		// Messages can be delivers as buffers or strings, and also JSON decoded
		let delivery = payload;
		if (this.useJson) {
			delivery = JSON.parse(delivery);
		} else if (!this.preserveBuffers) {
			delivery = payload.toString();
		}

		const subs = this._findSubscribesBySubject(subject);

		subs.forEach(sub => {
			if (sub) {
				sub.received++;

				if (sub.timeout && sub.received >= sub.expected) {
					clearTimeout(sub.timeout);
					sub.timeout = null;
				}

				sub.cb(delivery, replyTo, subject);
			}
		});

	}

	/**
	 * requestOne
	 *
	 * @param  {string} subject
	 * @param  {string} message
	 * @param {Object} options
	 * @param {Function} callback
	 *
	 * @returns {String} sid
	 */
	requestOne(subject, message, options, callback) {
		const sid = uuid();

		if (typeof message === 'function') {
			callback = message;
			message = EMPTY;
			opt_options = null;
    		}
		
		if (typeof options === 'function') {
			callback = options;
			options = null;
		}

		this.publish(subject, message, sid);

		return sid;
	}


	/**
	 * Remove existing subscription by sid.
	 *
	 * @param  {string} sid
	 */
	unsubscribe(sid) {
		// TODO: Add support for auto-unsubscribe after MAX_WANTED messages received
		const subToRemove = this._findSubscribeBySid(sid);

		if (subToRemove) {
			this.subs.splice(this.subs.indexOf(subToRemove), 1);
		}
	}

	/**
	 * Invoke timeout callback if subscription has not received
	 * expected number of message during given timeout (ms).
	 *
	 * @param  {string}   sid
	 * @param  {number}   timeout  in ms
	 * @param  {number}   expected number of messages to receive
	 * @param  {Function} cb
	 */
	timeout(sid, timeout, expected, cb = () => { }) {
		let sub = this._findSubscribeBySid(sid);

		if (sub) {
			sub.expected = expected;
			sub.timeout = setTimeout(() => {
				cb(sid);
			}, timeout);
		}
	}

	_findSubscribesBySubject(subject) {
		let matches = this.subs.filter(sub => utils.matchSubject(subject, sub.subject));

		// Pick one subscribe from each queue group plus all subscriptions
		// that does not have any queue group set
		let onePerQueue = {};

		matches.forEach(sub => {
			onePerQueue[sub.queue || uuid.v4()] = sub;
		});

		return Object.values(onePerQueue);
	}

	_findSubscribeBySid(sid) {
		return this.subs.find(sub => sub.sid === sid);
	}

}

module.exports = MockNatsClient;
