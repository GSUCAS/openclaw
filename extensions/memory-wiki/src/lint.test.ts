import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { lintMemoryWikiVault } from "./lint.js";
import { renderWikiMarkdown } from "./markdown.js";
import { createMemoryWikiTestHarness } from "./test-helpers.js";

const { createVault } = createMemoryWikiTestHarness();

describe("lintMemoryWikiVault", () => {
  it("accepts generated markdown links and ignores OpenClaw directive tags", async () => {
    const { rootDir, config } = await createVault({
      prefix: "memory-wiki-lint-links-",
      config: {
        vault: { renderMode: "native" },
      },
    });
    await fs.mkdir(path.join(rootDir, "sources"), { recursive: true });

    const updatedAt = new Date().toISOString();
    await fs.writeFile(
      path.join(rootDir, "sources", "target-page.md"),
      renderWikiMarkdown({
        frontmatter: {
          pageType: "source",
          id: "source.target-page",
          title: "Target Page",
          updatedAt,
        },
        body: "# Target Page\n",
      }),
      "utf8",
    );
    await fs.writeFile(
      path.join(rootDir, "sources", "source-page.md"),
      renderWikiMarkdown({
        frontmatter: {
          pageType: "source",
          id: "source.source-page",
          title: "Source Page",
          updatedAt,
        },
        body: [
          "# Source Page",
          "",
          "[Target Page](sources/target-page.md)",
          "[Target By Title](Target Page)",
          "[Target By Id](source.target-page)",
          "[Target By Basename](target-page)",
          "[Target By Relative Path](./sources/target-page.md)",
          "[[reply_to_current]]",
          "[[reply_to: 123]]",
          "[[audio_as_voice]]",
        ].join("\n"),
      }),
      "utf8",
    );

    const result = await lintMemoryWikiVault(config);

    expect(result.issues.filter((issue) => issue.code === "broken-wikilink")).toEqual([]);
  });

  it("detects duplicate ids, provenance gaps, contradictions, and open questions", async () => {
    const { rootDir, config } = await createVault({
      prefix: "memory-wiki-lint-",
      config: {
        vault: { renderMode: "obsidian" },
      },
    });
    await Promise.all(
      ["entities", "concepts", "sources", "syntheses"].map((dir) =>
        fs.mkdir(path.join(rootDir, dir), { recursive: true }),
      ),
    );

    const duplicate = renderWikiMarkdown({
      frontmatter: {
        pageType: "entity",
        id: "entity.alpha",
        title: "Alpha",
        contradictions: ["Conflicts with source.beta"],
        questions: ["Is Alpha still active?"],
        confidence: 0.2,
        claims: [
          {
            id: "claim.alpha.db",
            text: "Alpha uses PostgreSQL for production writes.",
            confidence: 0.2,
            evidence: [],
          },
        ],
      },
      body: "# Alpha\n\n[[missing-page]]\n",
    });
    await fs.writeFile(path.join(rootDir, "entities", "alpha.md"), duplicate, "utf8");
    await fs.writeFile(path.join(rootDir, "concepts", "alpha.md"), duplicate, "utf8");
    await fs.writeFile(
      path.join(rootDir, "sources", "bridge-alpha.md"),
      renderWikiMarkdown({
        frontmatter: {
          pageType: "source",
          id: "source.bridge.alpha",
          title: "Bridge Alpha",
          sourceType: "memory-bridge",
        },
        body: "# Bridge Alpha\n",
      }),
      "utf8",
    );
    await fs.writeFile(
      path.join(rootDir, "syntheses", "alpha-db.md"),
      renderWikiMarkdown({
        frontmatter: {
          pageType: "synthesis",
          id: "synthesis.alpha.db",
          title: "Alpha Database",
          sourceIds: ["source.bridge.alpha"],
          updatedAt: "2025-10-01T00:00:00.000Z",
          claims: [
            {
              id: "claim.alpha.db",
              text: "Alpha uses MySQL for production writes.",
              status: "contested",
              confidence: 0.7,
              evidence: [
                {
                  sourceId: "source.bridge.alpha",
                  lines: "1-3",
                  updatedAt: "2025-10-01T00:00:00.000Z",
                },
              ],
            },
          ],
        },
        body: "# Alpha Database\n",
      }),
      "utf8",
    );

    const result = await lintMemoryWikiVault(config);

    expect(result.issueCount).toBeGreaterThan(0);
    expect(result.issues.map((issue) => issue.code)).toContain("duplicate-id");
    expect(result.issues.map((issue) => issue.code)).toContain("missing-source-ids");
    expect(result.issues.map((issue) => issue.code)).toContain("missing-import-provenance");
    expect(result.issues.map((issue) => issue.code)).toContain("broken-wikilink");
    expect(result.issues.map((issue) => issue.code)).toContain("contradiction-present");
    expect(result.issues.map((issue) => issue.code)).toContain("claim-conflict");
    expect(result.issues.map((issue) => issue.code)).toContain("open-question");
    expect(result.issues.map((issue) => issue.code)).toContain("low-confidence");
    expect(result.issues.map((issue) => issue.code)).toContain("claim-missing-evidence");
    expect(result.issues.map((issue) => issue.code)).toContain("claim-low-confidence");
    expect(result.issues.map((issue) => issue.code)).toContain("stale-page");
    expect(result.issues.map((issue) => issue.code)).toContain("stale-claim");
    expect(
      result.issuesByCategory.contradictions.some((issue) => issue.code === "claim-conflict"),
    ).toBe(true);
    expect(result.issuesByCategory["open-questions"].length).toBeGreaterThanOrEqual(2);
    expect(
      result.issuesByCategory.provenance.some(
        (issue) => issue.code === "missing-import-provenance",
      ),
    ).toBe(true);
    expect(
      result.issuesByCategory.provenance.some((issue) => issue.code === "claim-missing-evidence"),
    ).toBe(true);
    await expect(fs.readFile(result.reportPath, "utf8")).resolves.toContain("### Errors");
    await expect(fs.readFile(result.reportPath, "utf8")).resolves.toContain("### Contradictions");
    await expect(fs.readFile(result.reportPath, "utf8")).resolves.toContain("### Open Questions");
  });
});
