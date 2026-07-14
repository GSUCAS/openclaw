import fs from "node:fs/promises";
import path from "node:path";
import { normalizeLowercaseStringOrEmpty } from "openclaw/plugin-sdk/string-coerce-runtime";
import { slugifyWikiSegment, type WikiPageSummary } from "./markdown.js";

const WIKI_CONTENT_DIRS = ["sources", "entities", "concepts", "syntheses", "reports"] as const;

type WikiLinkTargetIndex = {
  pathTargets: Set<string>;
  aliasTargets: Set<string>;
};

export type BrokenWikiLink = {
  path: string;
  target: string;
};

function normalizeTarget(value: string, options: { stripQuery: boolean }): string {
  const withoutFragment = value.trim().replace(/\\/g, "/").split("#")[0] ?? "";
  const target = options.stripQuery ? (withoutFragment.split("?")[0] ?? "") : withoutFragment;
  return target
    .replace(/\.md$/i, "")
    .replace(/^\.\/+/, "")
    .replace(/^\/+/, "")
    .replace(/\/+$/, "")
    .trim();
}

function normalizePathTarget(value: string): string {
  return normalizeTarget(value, { stripQuery: true });
}

function normalizeAliasTextTarget(value: string): string {
  return normalizeTarget(value, { stripQuery: false });
}

function addPathTarget(index: WikiLinkTargetIndex, raw: string | undefined) {
  const normalized = raw ? normalizePathTarget(raw) : "";
  if (!normalized) {
    return;
  }
  index.pathTargets.add(normalized);
  index.pathTargets.add(path.posix.basename(normalized));
}

function addAliasTarget(index: WikiLinkTargetIndex, raw: string | undefined) {
  const normalized = raw ? normalizeLowercaseStringOrEmpty(normalizeAliasTextTarget(raw)) : "";
  if (normalized) {
    index.aliasTargets.add(normalized);
  }
}

function addSlugAliasTarget(index: WikiLinkTargetIndex, raw: string | undefined) {
  const normalized = raw ? normalizeAliasTextTarget(raw) : "";
  if (normalized) {
    index.aliasTargets.add(slugifyWikiSegment(normalized));
  }
}

function addPathSuffixTargets(index: WikiLinkTargetIndex, raw: string | undefined) {
  const normalized = raw ? normalizePathTarget(raw) : "";
  if (!normalized) {
    return;
  }
  const parts = normalized.split("/").filter(Boolean);
  for (let partIndex = 0; partIndex < parts.length; partIndex += 1) {
    const suffix = parts.slice(partIndex).join("/");
    addPathTarget(index, suffix);
    addSlugAliasTarget(index, suffix);
  }
}

function buildTargetIndex(
  pages: WikiPageSummary[],
  existingMarkdownPaths: readonly string[],
): WikiLinkTargetIndex {
  const index: WikiLinkTargetIndex = { pathTargets: new Set(), aliasTargets: new Set() };
  for (const page of pages) {
    addPathTarget(index, page.relativePath);
    addAliasTarget(index, page.title);
    addSlugAliasTarget(index, page.title);
    addPathSuffixTargets(index, page.sourcePath);
    addPathSuffixTargets(index, page.bridgeRelativePath);
    addPathSuffixTargets(index, page.unsafeLocalRelativePath);
  }
  for (const relativePath of existingMarkdownPaths) {
    addPathTarget(index, relativePath);
  }
  return index;
}

function hasValidTarget(index: WikiLinkTargetIndex, rawTarget: string): boolean {
  const pathTarget = normalizePathTarget(rawTarget);
  if (!pathTarget) {
    return true;
  }
  const withoutFragment = rawTarget.trim().replace(/\\/g, "/").split("#")[0] ?? "";
  const hasQuery = withoutFragment.includes("?");
  const withoutQuery = withoutFragment.split("?")[0] ?? "";
  const isPathStyle =
    withoutQuery.startsWith("/") ||
    withoutQuery.startsWith("./") ||
    withoutQuery.includes("/") ||
    /\.md$/i.test(withoutQuery);
  if (index.pathTargets.has(pathTarget) && (!hasQuery || isPathStyle)) {
    return true;
  }
  if (pathTarget.includes("/")) {
    return false;
  }
  const alias = normalizeLowercaseStringOrEmpty(normalizeAliasTextTarget(rawTarget));
  return index.aliasTargets.has(alias) || index.aliasTargets.has(slugifyWikiSegment(alias));
}

export async function collectExistingMarkdownPaths(rootDir: string): Promise<string[]> {
  const entries = await Promise.all(
    WIKI_CONTENT_DIRS.map(async (relativeDir) => {
      const dirPath = path.join(rootDir, relativeDir);
      const children = await fs
        .readdir(dirPath, { withFileTypes: true, recursive: true })
        .catch(() => []);
      return children
        .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
        .map((entry) => {
          const absolutePath = path.join(entry.parentPath ?? dirPath, entry.name);
          return path.relative(rootDir, absolutePath).split(path.sep).join("/");
        });
    }),
  );
  return entries.flat().toSorted((left, right) => left.localeCompare(right));
}

export function collectBrokenWikiLinks(
  pages: WikiPageSummary[],
  existingMarkdownPaths: readonly string[],
): BrokenWikiLink[] {
  const validTargets = buildTargetIndex(pages, existingMarkdownPaths);
  return pages.flatMap((page) =>
    page.linkTargets.flatMap((target) =>
      hasValidTarget(validTargets, target) ? [] : [{ path: page.relativePath, target }],
    ),
  );
}
