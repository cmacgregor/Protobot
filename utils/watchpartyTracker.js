// utils/watchpartyTracker.js

/**
 * Tracks active watchparties for end-of-movie attendee capture
 */
class WatchpartyTracker {
	constructor() {
		// Map of channelId -> watchparty data
		this.activeParties = new Map();
	}

	/**
	 * Start tracking a new watchparty
	 * @param {Object} data - Watchparty data
	 * @param {string} data.channelId - Discord text channel ID
	 * @param {string} data.voiceChannelId - Discord voice channel ID
	 * @param {string} data.title - Movie title
	 * @param {string} data.url - Movie URL
	 * @param {string} data.host - Host username
	 * @param {Date} data.startTime - Start timestamp
	 * @param {number} data.runtime - Runtime in minutes
	 * @param {Function} data.onEnd - Callback when watchparty ends
	 */
	startTracking(data) {
		const { channelId, runtime, onEnd } = data;

		// Clear any existing timer for this channel
		this.endTracking(channelId);

		// Store watchparty data
		const party = {
			...data,
			timer: null,
		};

		// Set timer if runtime is available
		if (runtime && runtime > 0) {
			// Convert minutes to milliseconds
			const timeoutMs = runtime * 60 * 1000;
			party.timer = setTimeout(() => {
				console.log(`[WATCHPARTY] Auto-ending watchparty: ${data.title} after ${runtime} minutes`);
				if (onEnd) onEnd();
				this.activeParties.delete(channelId);
			}, timeoutMs);

			console.log(`[WATCHPARTY] Timer set for ${runtime} minutes for: ${data.title}`);
		}

		this.activeParties.set(channelId, party);
	}

	/**
	 * Manually end a watchparty (called by /endwatchparty command)
	 * @param {string} channelId - Discord text channel ID
	 * @returns {Object|null} Watchparty data if found, null otherwise
	 */
	endTracking(channelId) {
		const party = this.activeParties.get(channelId);
		if (!party) return null;

		// Clear timer if exists
		if (party.timer) {
			clearTimeout(party.timer);
		}

		this.activeParties.delete(channelId);
		return party;
	}

	/**
	 * Get active watchparty for a channel
	 * @param {string} channelId - Discord text channel ID
	 * @returns {Object|null} Watchparty data if found, null otherwise
	 */
	getActive(channelId) {
		return this.activeParties.get(channelId) || null;
	}

	/**
	 * Check if a channel has an active watchparty
	 * @param {string} channelId - Discord text channel ID
	 * @returns {boolean}
	 */
	hasActive(channelId) {
		return this.activeParties.has(channelId);
	}
}

// Singleton instance
const tracker = new WatchpartyTracker();

module.exports = tracker;
