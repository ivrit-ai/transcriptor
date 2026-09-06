// Single source of truth for the number of distinct-user transcriptions a
// line needs before it's considered "complete" / stops being served for
// more work. Must match the backend's `settings.transcription_target`
// (see app/config.py) — the two are not fetched from a shared API field,
// so keep them in sync by hand when this value changes.
export const TRANSCRIPTION_TARGET: number = 2
