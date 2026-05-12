/**
 * TrackSubscriptionManager
 * Identifies and subscribes to the correct vaani-translator-{lang} track
 * in the LiveKit room based on the local user's preferred language.
 *
 * Virtual participants published by TranslationWorker have identity:
 *   vaani-translator-hi, vaani-translator-fr, etc.
 *
 * This manager watches remote participants, finds the one matching the
 * user's preferredLanguage, and returns its audio track publication
 * (or null if not yet available).
 */

export const TRANSLATOR_IDENTITY_PREFIX = 'vaani-translator-';

/**
 * Check whether a LiveKit participant is a server-side translation virtual participant.
 * @param {Participant} participant
 * @returns {boolean}
 */
export function isTranslatorParticipant(participant) {
  return participant?.identity?.startsWith(TRANSLATOR_IDENTITY_PREFIX) ?? false;
}

/**
 * Extract the language code from a translator participant's identity.
 * e.g. "vaani-translator-hi" → "hi"
 * @param {Participant} participant
 * @returns {string|null}
 */
export function translatorLanguage(participant) {
  if (!isTranslatorParticipant(participant)) return null;
  return participant.identity.slice(TRANSLATOR_IDENTITY_PREFIX.length);
}

/**
 * Find the translator participant for a given language code.
 * @param {Map<string, Participant>} remoteParticipants - from LiveKit Room
 * @param {string} lang - e.g. 'hi', 'fr'
 * @returns {Participant|null}
 */
export function findTranslatorParticipant(remoteParticipants, lang) {
  if (!lang || !remoteParticipants) return null;
  const targetIdentity = `${TRANSLATOR_IDENTITY_PREFIX}${lang}`;
  for (const participant of remoteParticipants.values()) {
    if (participant.identity === targetIdentity) return participant;
  }
  return null;
}

/**
 * Get the first subscribed audio track publication from a translator participant.
 * @param {Participant} translatorParticipant
 * @returns {RemoteTrackPublication|null}
 */
export function getTranslatorAudioTrack(translatorParticipant) {
  if (!translatorParticipant) return null;
  for (const pub of translatorParticipant.trackPublications.values()) {
    if (pub.kind === 'audio' && pub.isSubscribed && pub.track) {
      return pub;
    }
  }
  return null;
}

/**
 * Filter remote participants to exclude all translator virtual participants.
 * Use this to hide translators from the ParticipantGrid UI.
 * @param {Map<string, Participant>} remoteParticipants
 * @returns {Participant[]}
 */
export function filterHumanParticipants(remoteParticipants) {
  if (!remoteParticipants) return [];
  return Array.from(remoteParticipants.values()).filter(
    (p) => !isTranslatorParticipant(p)
  );
}
