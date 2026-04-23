import { execa } from "execa";
import { GitError } from "../errors.js";

export async function clone(repo: string, dest: string): Promise<void> {
  try {
    await execa("git", ["clone", repo, dest], { stdio: "inherit" });
  } catch (err: any) {
    throw new GitError(`git clone failed for ${repo}`, {
      hint: "check the repo URL, your auth, and network",
    });
  }
}
