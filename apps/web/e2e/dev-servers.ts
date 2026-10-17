/**
 * The two local servers the suite runs against, and the watcher that reports when one dies.
 *
 * Both are wrangler dev servers (`playwright.config.ts` starts them). If one exits mid-run,
 * Playwright does not notice: every remaining test fails on its own with
 * `ERR_CONNECTION_REFUSED`, and the only server output is whatever wrangler printed to the
 * terminal, which for a fatal dev-runtime error can be a bare `✘ [ERROR]` with no message.
 * The cause lands only in wrangler's debug log file.
 *
 * So each server writes its debug log to a known per-run file (`WRANGLER_LOG_PATH`), and
 * `global-setup.ts` watches both ports for the rest of the run. When a port stops accepting
 * connections, the watcher prints which server died and the tail of its log, then interrupts
 * the run the way Ctrl-C would, so the run ends on the cause instead of on 70 copies of the
 * symptom.
 */
import { mkdtempSync, readFileSync } from "node:fs";
import { connect } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const WEB_PORT = 4173;
export const API_PORT = 8787;

/** Carries the run's log directory from the runner process to the workers it forks. */
const LOG_DIR_ENV = "TARKOV_E2E_LOG_DIR";

export interface DevServer {
  name: string;
  port: number;
  /** Wrangler's debug log for this server — every level, unlike what it prints. */
  logFile: string;
}

/**
 * The servers, with this run's log files. The config is evaluated in the runner and again in
 * every worker, so the directory is made once and passed on through the environment. It is
 * left in place after the run: it is the record of what happened.
 */
export function devServers(): { api: DevServer; web: DevServer } {
  let dir = process.env[LOG_DIR_ENV];
  if (!dir) {
    dir = mkdtempSync(join(tmpdir(), "tarkov-e2e-logs-"));
    process.env[LOG_DIR_ENV] = dir;
  }
  return {
    api: {
      name: "builds-api (wrangler dev)",
      port: API_PORT,
      logFile: join(dir, "builds-api.log"),
    },
    web: { name: "web (wrangler pages dev)", port: WEB_PORT, logFile: join(dir, "pages-dev.log") },
  };
}

/** Whether something accepts a TCP connection on `127.0.0.1:port`. A bare connect sends no request. */
export function portAccepts(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect({ host: "127.0.0.1", port });
    socket.setTimeout(2_000);
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("timeout", () => {
      // Slow to accept is not dead — only a refusal is. Count it as alive.
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => {
      socket.destroy();
      resolve(false);
    });
  });
}

const ENTRY_HEADER = /^--- \d{4}-\d\d-\d\dT[\d:.]+Z (\w+)$/m;
const TAIL_ENTRIES = 12;
const TAIL_ERRORS = 5;
const ENTRY_LINES = 15;
const LINE_CHARS = 300;

/**
 * The end of a wrangler debug log, readable in a terminal.
 *
 * The log is a series of `--- <ISO time> <level>` entries, and one of them can be megabytes
 * long — wrangler dumps the whole bundled worker into the context of a dev-runtime error — so
 * a plain line tail would show nothing but bundle source. This keeps the last few entries and
 * the last few error-level ones, each clipped.
 */
export function wranglerLogTail(logFile: string): string {
  let text: string;
  try {
    text = readFileSync(logFile, "utf8");
  } catch (error) {
    return (
      `(could not read ${logFile}: ${error instanceof Error ? error.message : String(error)} — ` +
      "if the server was reused from outside this run, its log is in wrangler's default log directory)"
    );
  }

  const entries = text
    .split(/\n(?=--- \d{4}-\d\d-\d\dT[\d:.]+Z \w+\n)/)
    .map((entry) => entry.trim())
    .filter((entry) => ENTRY_HEADER.test(entry));
  const errors = entries.filter((entry) => ENTRY_HEADER.exec(entry)?.[1] === "error");
  const shown = [...new Set([...errors.slice(-TAIL_ERRORS), ...entries.slice(-TAIL_ENTRIES)])].sort(
    (a, b) => entries.indexOf(a) - entries.indexOf(b),
  );

  return shown
    .map((entry) => {
      const lines = entry.replace(/\n---$/, "").split("\n");
      const clipped = lines
        .slice(0, ENTRY_LINES)
        .map((line) => (line.length > LINE_CHARS ? `${line.slice(0, LINE_CHARS)} …` : line));
      if (lines.length > ENTRY_LINES) clipped.push(`… (${lines.length - ENTRY_LINES} more lines)`);
      return clipped.join("\n");
    })
    .join("\n");
}

/**
 * Poll the servers' ports once a second until stopped. On the first refused connection,
 * report the death and interrupt the run. Call only once every port is accepting, and stop it
 * before the servers are torn down — a refusal is read as a death, unconditionally.
 */
export function watchDevServers(servers: readonly DevServer[]): () => void {
  let stopped = false;
  let polling = false;

  const stop = (): void => {
    stopped = true;
    clearInterval(timer);
    process.off("SIGINT", stop);
  };

  const poll = async (): Promise<void> => {
    if (stopped || polling) return;
    polling = true;
    try {
      for (const server of servers) {
        if (await portAccepts(server.port)) continue;
        if (stopped) return;
        stop();
        process.stderr.write(deathReport(server));
        // Interrupt the run as Ctrl-C would: Playwright stops scheduling tests, runs its
        // teardown, and reports the failures so far with a summary of what did not run. Every
        // test after this point would only fail on a refused connection. (Nothing else in the
        // runner may exit on SIGINT first — see the launch options in `global-setup.ts`.)
        process.kill(process.pid, "SIGINT");
        return;
      }
    } finally {
      polling = false;
    }
  };

  const timer = setInterval(() => void poll(), 1_000);
  timer.unref();
  // A real Ctrl-C reaches the servers too, and they exit — that is not a death to report.
  process.on("SIGINT", stop);
  return stop;
}

function deathReport(server: DevServer): string {
  const rule = "=".repeat(78);
  return [
    "",
    rule,
    `E2E SERVER DIED: ${server.name} on 127.0.0.1:${server.port} stopped accepting connections mid-run.`,
    "Stopping the run — every remaining test would fail with ERR_CONNECTION_REFUSED.",
    `Full wrangler log: ${server.logFile}`,
    "",
    "Log tail:",
    wranglerLogTail(server.logFile),
    rule,
    "",
  ].join("\n");
}
