// The instant-access consent at checkout (gate C3, E9-lite). Digital content is supplied as soon as
// playback starts; the Consumer Contracts Regulations 2013 (reg. 37) end the 14-day cancellation
// right then only with the buyer's express request and acknowledgement. The version string is sent
// with a card order and stored on it (payment service, migration 0003). Change the version whenever
// the text changes; a stored version must always point to one exact text. Draft pending counsel.

export const INSTANT_ACCESS_CONSENT_VERSION = 'instant-access-en-2026-10-18';

export const INSTANT_ACCESS_CONSENT_TEXT =
    'I ask for this video to be made available to me immediately as digital content. I understand that my 14-day right to cancel ends once I start playback.';
