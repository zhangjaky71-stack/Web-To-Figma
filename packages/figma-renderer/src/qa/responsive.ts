import {
  W2F_NODE30_QA_VERSION,
  W2F_NODE30_RESPONSIVE_DOMAINS,
  W2F_NODE30_RESPONSIVE_SCORE_THRESHOLD,
  type W2fResponsiveQaDomain,
  type W2fResponsiveQaInput,
  type W2fResponsiveQaReport,
} from "./node30-types.js";

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function evaluateResponsiveQa(input: W2fResponsiveQaInput): W2fResponsiveQaReport {
  const failures: string[] = [];
  const warnings: string[] = [];
  const matchedByDomain = new Map<W2fResponsiveQaDomain, number>();
  const totalByDomain = new Map<W2fResponsiveQaDomain, number>();

  for (const check of input.checks) {
    if (!Number.isFinite(check.matched) || !Number.isFinite(check.total) || check.total < 0) {
      failures.push(`Invalid responsive check counts for ${check.id}`);
      continue;
    }
    if (check.matched < 0 || check.matched > check.total) {
      failures.push(`Responsive check ${check.id} matched count is outside 0..total`);
      continue;
    }
    matchedByDomain.set(check.domain, (matchedByDomain.get(check.domain) ?? 0) + check.matched);
    totalByDomain.set(check.domain, (totalByDomain.get(check.domain) ?? 0) + check.total);
  }

  const domainScores: Partial<Record<W2fResponsiveQaDomain, number>> = {};
  const activeScores: number[] = [];
  for (const domain of W2F_NODE30_RESPONSIVE_DOMAINS) {
    const total = totalByDomain.get(domain) ?? 0;
    if (total <= 0) continue;
    const score = clamp01((matchedByDomain.get(domain) ?? 0) / total);
    domainScores[domain] = score;
    activeScores.push(score);
  }

  for (const requiredDomain of new Set(input.requiredDomains ?? [])) {
    if ((totalByDomain.get(requiredDomain) ?? 0) <= 0) {
      failures.push(`Required responsive domain ${requiredDomain} has no evidence`);
    }
  }

  for (const change of input.structuralChanges ?? []) {
    if (!change.expected) continue;
    if (!change.detected) {
      failures.push(`Expected structural responsive change ${change.id} was not detected`);
      continue;
    }
    if (!change.executableInFigma && !change.reportedWhenNotExecutable) {
      failures.push(`Non-executable structural change ${change.id} was detected but not reported`);
    }
  }

  if (activeScores.length === 0) {
    return {
      version: W2F_NODE30_QA_VERSION,
      status: "UNAVAILABLE",
      compositeScore: 0,
      threshold: W2F_NODE30_RESPONSIVE_SCORE_THRESHOLD,
      domainScores,
      failures,
      warnings: ["No responsive checks were available"],
    };
  }

  const compositeScore = clamp01(
    activeScores.reduce((total, score) => total + score, 0) / activeScores.length,
  );
  if (compositeScore < W2F_NODE30_RESPONSIVE_SCORE_THRESHOLD) {
    failures.push(
      `Responsive score ${(compositeScore * 100).toFixed(2)}% is below ${(W2F_NODE30_RESPONSIVE_SCORE_THRESHOLD * 100).toFixed(0)}%`,
    );
  }

  return {
    version: W2F_NODE30_QA_VERSION,
    status: failures.length > 0 ? "FAIL" : warnings.length > 0 ? "WARNING" : "PASS",
    compositeScore,
    threshold: W2F_NODE30_RESPONSIVE_SCORE_THRESHOLD,
    domainScores,
    failures,
    warnings,
  };
}
