import { describe, expect, it } from 'vitest';

import { createDiagnostics } from '../../src/platform/diagnostics.js';

describe('diagnostics', () => {
  it('records errors with a timestamp and returns a bounded report', () => {
    const diagnostics = createDiagnostics();

    diagnostics.record(new Error('boom'));
    diagnostics.record('a string problem');

    const report = diagnostics.report();
    expect(report.errors).toHaveLength(2);
    expect(report.errors[0].message).toContain('boom');
    expect(typeof report.errors[0].at).toBe('number');
    expect(report.errors[1].message).toContain('a string problem');
  });

  it('the record is bounded and never grows without limit', () => {
    const diagnostics = createDiagnostics({ maxErrors: 5 });

    for (let index = 0; index < 50; index += 1) {
      diagnostics.record(`error ${index}`);
    }

    expect(diagnostics.report().errors).toHaveLength(5);
    // The newest errors survive, not the oldest.
    expect(diagnostics.report().errors[4].message).toContain('error 49');
  });

  it('diagnostics never include player save contents', () => {
    const diagnostics = createDiagnostics();
    const saveLike = JSON.stringify({ currency: 1_000_000, drills: { 'drill-1': 5 } });

    diagnostics.record(new Error(`failed near ${saveLike}`));

    const report = diagnostics.report();
    expect(report.errors[0].message).not.toContain('1_000_000');
    expect(report.errors[0].message).not.toContain('drill-1');
    expect(report.errors[0].message).not.toContain('currency');
  });

  it('a non-object problem is recorded as its string form', () => {
    const diagnostics = createDiagnostics();

    diagnostics.record(undefined);

    expect(diagnostics.report().errors[0].message).toContain('undefined');
  });
});
