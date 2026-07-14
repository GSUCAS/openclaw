export function inferWikiClaimEvidenceKind(params: {
  sourceId?: string;
  evidencePath?: string;
}): string | undefined {
  const sourceId = params.sourceId?.trim() ?? "";
  const evidencePath = params.evidencePath?.trim().replace(/\\/g, "/") ?? "";
  if (/^source\.bridge[.-]/i.test(sourceId) || /^sources\/bridge-/i.test(evidencePath)) {
    return "bridge_source";
  }
  if (/^source\./i.test(sourceId) || /^sources\//i.test(evidencePath)) {
    return "source";
  }
  if (/^synthesis\./i.test(sourceId) || /^syntheses\//i.test(evidencePath)) {
    return "source_backed_synthesis";
  }
  if (/^memory(?:\/|\.)/i.test(sourceId) || /^memory\//i.test(evidencePath)) {
    return "memory_page";
  }
  if (/^webchat(?::|\.)/i.test(sourceId) || /webchat/i.test(evidencePath)) {
    return "webchat_source";
  }
  if (/^user\.statement\./i.test(sourceId)) {
    return "user_statement";
  }
  if (/^https?:\/\//i.test(sourceId) || /^https?:\/\//i.test(evidencePath)) {
    return "web_source";
  }
  if (/^\/.*\/workspace(?:\/|$)/i.test(evidencePath)) {
    return "workspace_source";
  }
  if (sourceId) {
    return "source";
  }
  return evidencePath ? "file" : undefined;
}
