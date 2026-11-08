import { spawnSync } from "node:child_process";
import { join } from "node:path";

const wrapper = join(process.cwd(), process.platform === "win32" ? "gradlew.bat" : "gradlew");
const result = spawnSync(`"${wrapper}"`, process.argv.slice(2), { stdio: "inherit", shell: true });
process.exit(result.status ?? 1);
