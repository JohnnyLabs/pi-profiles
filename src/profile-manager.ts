import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  unlinkSync,
  readdirSync,
  statSync,
  lstatSync,
  symlinkSync,
  readlinkSync,
  rmSync,
  copyFileSync,
} from "node:fs";
import { join, resolve, dirname } from "node:path";
import { homedir } from "node:os";
import type { Profile, ProfileSummary, CreateOpts } from "./types.js";

const NAME_REGEX = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;
const MAX_NAME_LENGTH = 64;

export class ProfileManager {
  readonly piRoot: string;
  readonly profilesDir: string;
  readonly agentDir: string;

  constructor(piRoot?: string) {
    this.piRoot = piRoot ?? join(homedir(), ".pi");
    this.profilesDir = join(this.piRoot, "profiles");
    this.agentDir = join(this.piRoot, "agent");
  }

  private validateName(name: string): void {
    if (!name || name.length > MAX_NAME_LENGTH || !NAME_REGEX.test(name)) {
      throw new Error(
        `Invalid profile name "${name}". Names must match ${NAME_REGEX} and be at most ${MAX_NAME_LENGTH} characters.`
      );
    }
  }

  private profilePath(name: string): string {
    return join(this.profilesDir, name);
  }

  private defaultJsonPath(): string {
    return join(this.profilesDir, "default.json");
  }

  resolve(name: string): Profile {
    this.validateName(name);
    const path = this.profilePath(name);
    if (!existsSync(path)) {
      throw new Error(`Profile "${name}" does not exist at ${path}`);
    }
    return { name, path };
  }

  getDefault(): string | undefined {
    const p = this.defaultJsonPath();
    if (!existsSync(p)) return undefined;
    try {
      const data = JSON.parse(readFileSync(p, "utf-8"));
      return data.default ?? undefined;
    } catch {
      return undefined;
    }
  }

  setDefault(name: string): void {
    this.resolve(name);
    mkdirSync(this.profilesDir, { recursive: true });
    writeFileSync(
      this.defaultJsonPath(),
      JSON.stringify({ default: name }, null, 2) + "\n"
    );
  }

  clearDefault(): void {
    const p = this.defaultJsonPath();
    if (existsSync(p)) {
      unlinkSync(p);
    }
  }

  list(): ProfileSummary[] {
    if (!existsSync(this.profilesDir)) return [];
    const defaultName = this.getDefault();
    return readdirSync(this.profilesDir)
      .filter((entry) => {
        try {
          return statSync(join(this.profilesDir, entry)).isDirectory();
        } catch {
          return false;
        }
      })
      .sort()
      .map((name) => ({
        name,
        path: join(this.profilesDir, name),
        isDefault: name === defaultName,
      }));
  }

  create(name: string, opts?: CreateOpts): void {
    this.validateName(name);
    const profileDir = this.profilePath(name);
    if (existsSync(profileDir)) {
      throw new Error(`Profile "${name}" already exists at ${profileDir}`);
    }

    if (opts?.from && opts?.fromBase) {
      throw new Error("Cannot use both --from and --from-base");
    }

    const shareAuth = opts?.shareAuth ?? true;
    const shareModels = opts?.shareModels ?? true;
    const shareSessions = opts?.shareSessions ?? true;

    if (opts?.from) {
      const srcProfile = this.resolve(opts.from);
      this.copyDirPreservingSymlinks(srcProfile.path, profileDir, "sessions");
      this.linkOrCreateSessions(profileDir, shareSessions);

      for (const [file, share] of [
        ["auth.json", shareAuth],
        ["models.json", shareModels],
      ] as const) {
        const filePath = join(profileDir, file);
        if (!share && existsSync(filePath) && lstatSync(filePath).isSymbolicLink()) {
          const target = readlinkSync(filePath);
          unlinkSync(filePath);
          const resolvedTarget = resolve(dirname(filePath), target);
          copyFileSync(resolvedTarget, filePath);
        }
      }
    } else if (opts?.fromBase) {
      const excludeFiles = new Set(["auth.json", "models.json"]);
      this.copyDirPreservingSymlinks(this.agentDir, profileDir, "sessions", excludeFiles);
      this.linkOrCreateSessions(profileDir, shareSessions);
      this.linkOrCopyStockAuth(profileDir, shareAuth, shareModels);
    } else {
      mkdirSync(profileDir, { recursive: true });
      for (const dir of ["extensions", "skills", "tools", "prompts"]) {
        mkdirSync(join(profileDir, dir));
      }
      writeFileSync(join(profileDir, "settings.json"), "{}\n");

      this.linkOrCreateSessions(profileDir, shareSessions);
      this.linkOrCopyStockAuth(profileDir, shareAuth, shareModels);
    }
  }

  delete(name: string): void {
    const profile = this.resolve(name);
    const defaultName = this.getDefault();
    rmSync(profile.path, { recursive: true, force: true });
    if (defaultName === name) {
      this.clearDefault();
    }
  }

  private linkOrCreateSessions(
    profileDir: string,
    shareSessions: boolean,
  ): void {
    const profileSessions = join(profileDir, "sessions");
    if (shareSessions) {
      const stockSessions = join(this.agentDir, "sessions");
      mkdirSync(stockSessions, { recursive: true });
      symlinkSync(
        stockSessions,
        profileSessions,
        process.platform === "win32" ? "junction" : "dir",
      );
    } else {
      mkdirSync(profileSessions, { recursive: true });
    }
  }

  private linkOrCopyStockAuth(
    profileDir: string,
    shareAuth: boolean,
    shareModels: boolean,
  ): void {
    for (const [file, share] of [
      ["auth.json", shareAuth],
      ["models.json", shareModels],
    ] as const) {
      const stockPath = join(this.agentDir, file);
      if (existsSync(stockPath)) {
        if (share) {
          symlinkSync(stockPath, join(profileDir, file));
        } else {
          copyFileSync(stockPath, join(profileDir, file));
        }
      }
    }
  }

  private copyDirPreservingSymlinks(
    src: string,
    dest: string,
    excludeEntry?: string,
    excludeFiles?: Set<string>,
  ): void {
    mkdirSync(dest, { recursive: true });
    for (const entry of readdirSync(src)) {
      if (entry === excludeEntry || excludeFiles?.has(entry)) continue;

      const srcPath = join(src, entry);
      const destPath = join(dest, entry);
      const stat = lstatSync(srcPath);

      if (stat.isSymbolicLink()) {
        const linkTarget = readlinkSync(srcPath);
        symlinkSync(linkTarget, destPath);
      } else if (stat.isDirectory()) {
        this.copyDirPreservingSymlinks(srcPath, destPath);
      } else {
        copyFileSync(srcPath, destPath);
      }
    }
  }
}
