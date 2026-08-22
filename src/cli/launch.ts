import { spawn } from "node:child_process";
import { constants } from "node:os";
import { join } from "node:path";

export function launch(profilePath: string, piArgs: string[]): void {
  const env = {
    ...process.env,
    PI_CODING_AGENT_DIR: profilePath,
    PI_CODING_AGENT_SESSION_DIR: join(profilePath, "sessions"),
  };
  const child = spawn("pi", piArgs, { env, stdio: "inherit" });

  for (const sig of ["SIGTERM", "SIGHUP"] as const) {
    process.on(sig, () => child.kill(sig));
  }

  child.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "ENOENT") {
      console.error("pi not found. Install from https://pi.dev");
      process.exit(1);
    }
    throw err;
  });

  child.on("exit", (code, signal) => {
    if (code !== null) {
      process.exit(code);
    }
    const sigNum = signal ? (constants.signals[signal] ?? 1) : 1;
    process.exit(128 + sigNum);
  });
}
