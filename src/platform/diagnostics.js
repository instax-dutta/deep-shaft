/**
 * Local diagnostics.
 *
 * A bounded log of recent problems and the build version, surfaced in the settings view so a
 * player can copy a report. Deliberately local: nothing here is ever sent anywhere, and the save
 * is never included — a diagnostics dump must not become a data leak.
 */

/** Tokens that would identify save contents in a recorded message. */
const SAVE_SECRET_TOKENS = Object.freeze(['currency', 'drill', 'prestige', 'resources', 'workers']);

function sanitize(message) {
  let text = String(message ?? 'undefined');
  for (const token of SAVE_SECRET_TOKENS) {
    text = text.split(token).join('[redacted]');
  }
  return text;
}

export function createDiagnostics({ maxErrors = 20, now = () => Date.now() } = {}) {
  const errors = [];

  return {
    record(problem) {
      const message = sanitize(
        problem instanceof Error ? problem.message : problem,
      ).slice(0, 500);
      errors.push({ at: now(), message });
      if (errors.length > maxErrors) {
        errors.splice(0, errors.length - maxErrors);
      }
      return { ok: true, recorded: message };
    },

    report() {
      return {
        errors: errors.map((entry) => ({ ...entry })),
        count: errors.length,
      };
    },
  };
}
