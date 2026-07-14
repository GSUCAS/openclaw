import {
  assessPageFreshness,
  collectWikiClaimHealth,
  normalizeClaimStatus,
  WIKI_AGING_DAYS,
  type WikiFreshness,
} from "./claim-health.js";
import { isUnmanagedRawSourceSummary, type WikiPageSummary } from "./markdown.js";

export function buildFreshnessReportBody(params: {
  pages: WikiPageSummary[];
  managedImportedSourcePagePaths: Set<string>;
  now: Date;
  formatPage: (page: WikiPageSummary, freshness: WikiFreshness) => string;
}): string {
  const sourcePages = params.pages.filter(
    (page) =>
      page.kind === "source" &&
      !(
        isUnmanagedRawSourceSummary(page) &&
        !params.managedImportedSourcePagePaths.has(page.relativePath)
      ),
  );
  const retrievalPages = params.pages.filter((page) => page.kind === "entity");
  const findAgingPages = (pages: WikiPageSummary[]) =>
    pages
      .flatMap((page) => {
        const freshness = assessPageFreshness(page, params.now);
        return freshness.level === "fresh" ? [] : [{ page, freshness }];
      })
      .toSorted((left, right) => left.page.title.localeCompare(right.page.title));
  const sourceMatches = findAgingPages(sourcePages);
  const retrievalMatches = findAgingPages(retrievalPages);
  const claimHealth = collectWikiClaimHealth(params.pages, params.now);
  const staleClaims = claimHealth.filter(
    (claim) => claim.freshness.level === "stale" || claim.freshness.level === "unknown",
  );
  const historicalClaims = claimHealth.filter((claim) =>
    ["superseded", "deprecated"].includes(normalizeClaimStatus(claim.status)),
  );
  const lines = [
    `- Source-history age: ${sourceMatches.length} / ${sourcePages.length} source pages are aging or stale.`,
    `- Retrieval-anchor review age: ${retrievalMatches.length} / ${retrievalPages.length} entity pages are aging or stale.`,
    `- Structured-claim staleness: ${staleClaims.length} / ${claimHealth.length} claims are stale or unknown.`,
    `- Historical claim status: ${historicalClaims.length} / ${claimHealth.length} claims are superseded or deprecated.`,
    "- Historical source age is not, by itself, evidence that a structured claim is stale.",
  ];
  if (sourceMatches.length > 0) {
    lines.push(
      "",
      "### Source-History Age",
      ...sourceMatches.map(({ page, freshness }) => `- ${params.formatPage(page, freshness)}`),
    );
  }
  if (retrievalMatches.length > 0) {
    lines.push(
      "",
      "### Retrieval Anchors Due For Review",
      ...retrievalMatches.map(({ page, freshness }) => `- ${params.formatPage(page, freshness)}`),
    );
  }
  if (sourceMatches.length === 0 && retrievalMatches.length === 0 && staleClaims.length === 0) {
    lines.push("", `No aging or stale pages older than ${WIKI_AGING_DAYS} days.`);
  }
  return lines.join("\n");
}
