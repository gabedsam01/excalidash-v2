/**
 * auto_polish_drawing — lint → score → repair in a loop until the scene passes
 * MCP_MIN_DRAWING_SCORE or MCP_MAX_REPAIR_ATTEMPTS is reached.
 */
import type { DrawingScore, ExcalidrawScene } from "../types";
import { repairScene } from "./repair";
import { scoreScene } from "./score";
import type { LintOptions } from "./lint";

export interface AutoPolishOptions {
  minimumScore: number;
  maxAttempts: number;
  lintOptions?: Partial<LintOptions>;
}

export interface AutoPolishStep {
  attempt: number;
  score: number;
  issues: number;
  applied?: string[];
}

export interface AutoPolishResult {
  scene: ExcalidrawScene;
  score: DrawingScore;
  passed: boolean;
  attempts: number;
  history: AutoPolishStep[];
}

export const autoPolish = (
  scene: ExcalidrawScene,
  options: AutoPolishOptions,
): AutoPolishResult => {
  const { minimumScore, maxAttempts, lintOptions = {} } = options;
  // Keep the BEST scene seen so far ("snapshot"). A repair pass that does not
  // strictly improve the score is discarded (rollback) and the loop stops —
  // guaranteeing auto-polish never returns a worse scene than its input.
  let best = scene;
  let bestResult = scoreScene(best, minimumScore, lintOptions);
  const history: AutoPolishStep[] = [
    { attempt: 0, score: bestResult.score, issues: bestResult.issues.length },
  ];

  let attempts = 0;
  while (!bestResult.passed && attempts < maxAttempts) {
    attempts += 1;
    const repaired = repairScene(best, lintOptions);
    const nextResult = scoreScene(repaired.scene, minimumScore, lintOptions);
    history.push({
      attempt: attempts,
      score: nextResult.score,
      issues: nextResult.issues.length,
      applied: repaired.applied,
    });
    if (nextResult.score > bestResult.score) {
      best = repaired.scene;
      bestResult = nextResult;
    } else {
      // No improvement (or a regression): roll back to the snapshot and stop.
      break;
    }
  }

  return {
    scene: best,
    score: bestResult,
    passed: bestResult.passed,
    attempts,
    history,
  };
};
