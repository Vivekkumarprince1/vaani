/**
 * LanguageRoutingMap
 * Single responsibility: build and query language → subscriber maps.
 *
 * Extracted from groupCallAudioHandler.js so the routing logic can be
 * tested and reused independently of Socket.IO or the translation SDK.
 */

class LanguageRoutingMap {
  /**
   * Build a map from a RoomManager language routing map.
   * @param {Map<string, string[]>} rawMap - lang → [userId]
   * @returns {LanguageRoutingMap}
   */
  static fromRoomManager(rawMap) {
    const instance = new LanguageRoutingMap();
    instance._map = rawMap;
    return instance;
  }

  constructor() {
    this._map = new Map();
  }

  /**
   * All unique target language codes in this map.
   * @returns {string[]}
   */
  getTargetLanguages() {
    return Array.from(this._map.keys());
  }

  /**
   * User IDs who want to hear a specific language.
   * @param {string} lang
   * @returns {string[]}
   */
  getSubscribersForLang(lang) {
    return this._map.get(lang) ?? [];
  }

  /**
   * True if no listeners exist (speaker is alone in the room).
   */
  isEmpty() {
    return this._map.size === 0;
  }

  entries() {
    return this._map.entries();
  }

  size() {
    return this._map.size;
  }
}

module.exports = LanguageRoutingMap;
