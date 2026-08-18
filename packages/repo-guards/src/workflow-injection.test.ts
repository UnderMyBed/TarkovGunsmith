import { describe, expect, it } from "vitest";
import { collectRunBlocks, parseWorkflow, workflowFiles } from "./workflows.js";

const EXPRESSION = /\$\{\{/;

/**
 * GitHub Actions substitutes ${{ }} into a `run:` scalar BEFORE bash parses it, so a
 * spliced value is source code, not data. Any expression a run block needs must arrive
 * through `env:` and be referenced as a quoted shell variable.
 */
describe("no ${{ }} expressions inside run: blocks", () => {
  for (const file of workflowFiles()) {
    it(`${file} routes every expression through env:`, () => {
      const offenders = collectRunBlocks(parseWorkflow(file))
        .filter((block) => EXPRESSION.test(block.script))
        .map((block) => {
          const line = block.script.split("\n").find((l) => EXPRESSION.test(l));
          return `${block.path} -> ${line?.trim() ?? ""}`;
        });

      expect(offenders).toEqual([]);
    });
  }
});
