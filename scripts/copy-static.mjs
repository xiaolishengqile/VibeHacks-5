import { cp, mkdir, rm } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const distRoot = resolve(repositoryRoot, "dist");
const sourceRoot = resolve(repositoryRoot, "src/renderer");
const destination = resolve(distRoot, "src/renderer");
const destinationRelative = relative(distRoot, destination);

if (!destinationRelative || destinationRelative.startsWith("..") || isAbsolute(destinationRelative)) {
	throw new Error("静态资源目标目录不在构建目录内");
}

await rm(destination, { recursive: true, force: true });
await mkdir(destination, { recursive: true });
for (const filename of ["index.html", "mini.html", "styles.css"]) {
	await cp(resolve(sourceRoot, filename), resolve(destination, filename));
}
