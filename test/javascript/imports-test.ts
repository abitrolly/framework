import assert from "node:assert";
import {join} from "node:path";
import type {Program} from "acorn";
import {Parser} from "acorn";
import {findExports, getGlobalImports, hasImportDeclaration} from "../../src/javascript/imports.js";
import {parseLocalImports, rewriteModule, rewriteNpmImports} from "../../src/javascript/imports.js";
import {parseMarkdown} from "../../src/markdown.js";
import {mockJsDelivr} from "../mocks/jsdelivr.js";

describe("findExports(body)", () => {
  it("finds export all declarations", () => {
    const program = parse("export * from 'foo.js';\nexport * from 'bar.js';");
    assert.deepStrictEqual(findExports(program), program.body);
  });
  it("finds named export declarations", () => {
    const program = parse("export {foo} from 'foo.js';\nexport const bar = 2;");
    assert.deepStrictEqual(findExports(program), program.body);
  });
  it("returns the empty array if there are no exports", () => {
    assert.deepStrictEqual(findExports(parse("1 + 2;")), []);
  });
});

describe("hasImportDeclaration(body)", () => {
  it("returns true if the body has import declarations", () => {
    assert.strictEqual(hasImportDeclaration(parse("import 'foo.js';")), true);
  });
  it("returns false if the body does not have import declarations", () => {
    assert.strictEqual(hasImportDeclaration(parse("1 + 2;")), false);
    assert.strictEqual(hasImportDeclaration(parse("import('foo.js');")), false);
  });
});

describe("getGlobalImports(parse)", () => {
  mockJsDelivr();
  it("resolves global imports", async () => {
    const root = "test/input";
    const path = "mermaid";
    const parse = await parseMarkdown(join(root, path) + ".md", {root, path});
    const imports = getGlobalImports(parse);
    assert.deepStrictEqual(
      imports,
      new Set([
        "observablehq:client",
        "npm:@observablehq/runtime",
        "npm:@observablehq/stdlib",
        "npm:@observablehq/mermaid",
        "npm:d3",
        "npm:mermaid"
      ])
    );
  });
});

// prettier-ignore
describe("rewriteNpmImports(input, path)", () => {
  it("rewrites /npm/ imports to /_npm/", () => {
    assert.strictEqual(rewriteNpmImports('export * from "/npm/d3-array@3.2.4/dist/d3-array.js";\n', "/_npm/d3@7.8.5/dist/d3.js"), 'export * from "../../d3-array@3.2.4/dist/d3-array.js";\n');
  });
  it("rewrites /npm/…+esm imports to +esm.js", () => {
    assert.strictEqual(rewriteNpmImports('export * from "/npm/d3-array@3.2.4/+esm";\n', "/_npm/d3@7.8.5/+esm.js"), 'export * from "../d3-array@3.2.4/+esm.js";\n');
  });
  it("rewrites /npm/ imports to a relative path", () => {
    assert.strictEqual(rewriteNpmImports('import "/npm/d3-array@3.2.4/dist/d3-array.js";\n', "/_npm/d3@7.8.5/dist/d3.js"), 'import "../../d3-array@3.2.4/dist/d3-array.js";\n');
    assert.strictEqual(rewriteNpmImports('import "/npm/d3-array@3.2.4/dist/d3-array.js";\n', "/_npm/d3@7.8.5/d3.js"), 'import "../d3-array@3.2.4/dist/d3-array.js";\n');
  });
  it("rewrites named imports", () => {
    assert.strictEqual(rewriteNpmImports('import {sort} from "/npm/d3-array@3.2.4/+esm";\n', "/_npm/d3@7.8.5/+esm.js"), 'import {sort} from "../d3-array@3.2.4/+esm.js";\n');
  });
  it("rewrites empty imports", () => {
    assert.strictEqual(rewriteNpmImports('import "/npm/d3-array@3.2.4/+esm";\n', "/_npm/d3@7.8.5/+esm.js"), 'import "../d3-array@3.2.4/+esm.js";\n');
  });
  it("rewrites default imports", () => {
    assert.strictEqual(rewriteNpmImports('import d3 from "/npm/d3-array@3.2.4/+esm";\n', "/_npm/d3@7.8.5/+esm.js"), 'import d3 from "../d3-array@3.2.4/+esm.js";\n');
  });
  it("rewrites namespace imports", () => {
    assert.strictEqual(rewriteNpmImports('import * as d3 from "/npm/d3-array@3.2.4/+esm";\n', "/_npm/d3@7.8.5/+esm.js"), 'import * as d3 from "../d3-array@3.2.4/+esm.js";\n');
  });
  it("rewrites named exports", () => {
    assert.strictEqual(rewriteNpmImports('export {sort} from "/npm/d3-array@3.2.4/+esm";\n', "/_npm/d3@7.8.5/+esm.js"), 'export {sort} from "../d3-array@3.2.4/+esm.js";\n');
  });
  it("rewrites namespace exports", () => {
    assert.strictEqual(rewriteNpmImports('export * from "/npm/d3-array@3.2.4/+esm";\n', "/_npm/d3@7.8.5/+esm.js"), 'export * from "../d3-array@3.2.4/+esm.js";\n');
  });
  it("rewrites dynamic imports with static module specifiers", () => {
    assert.strictEqual(rewriteNpmImports('import("/npm/d3-array@3.2.4/+esm");\n', "/_npm/d3@7.8.5/+esm.js"), 'import("../d3-array@3.2.4/+esm.js");\n');
    assert.strictEqual(rewriteNpmImports("import(`/npm/d3-array@3.2.4/+esm`);\n", "/_npm/d3@7.8.5/+esm.js"), 'import("../d3-array@3.2.4/+esm.js");\n');
    assert.strictEqual(rewriteNpmImports("import('/npm/d3-array@3.2.4/+esm');\n", "/_npm/d3@7.8.5/+esm.js"), 'import("../d3-array@3.2.4/+esm.js");\n');
  });
  it("ignores dynamic imports with dynamic module specifiers", () => {
    assert.strictEqual(rewriteNpmImports('import(`/npm/d3-array@${"3.2.4"}/+esm`);\n', "/_npm/d3@7.8.5/+esm.js"), 'import(`/npm/d3-array@${"3.2.4"}/+esm`);\n');
  });
  it("ignores dynamic imports with dynamic module specifiers", () => {
    assert.strictEqual(rewriteNpmImports('import(`/npm/d3-array@${"3.2.4"}/+esm`);\n', "/_npm/d3@7.8.5/+esm.js"), 'import(`/npm/d3-array@${"3.2.4"}/+esm`);\n');
  });
  it("strips the sourceMappingURL declaration", () => {
    assert.strictEqual(rewriteNpmImports('import(`/npm/d3-array@${"3.2.4"}/+esm`);\n//# sourceMappingURL=index.js.map', "/_npm/d3@7.8.5/+esm.js"), 'import(`/npm/d3-array@${"3.2.4"}/+esm`);\n');
    assert.strictEqual(rewriteNpmImports('import(`/npm/d3-array@${"3.2.4"}/+esm`);\n//# sourceMappingURL=index.js.map\n', "/_npm/d3@7.8.5/+esm.js"), 'import(`/npm/d3-array@${"3.2.4"}/+esm`);\n');
  });
});

describe("parseLocalImports(root, paths)", () => {
  it("finds all local imports in one file", () => {
    assert.deepStrictEqual(parseLocalImports("test/input/build/imports", ["foo/foo.js"]).imports, [
      {name: "foo/foo.js", type: "local"},
      {name: "npm:d3", type: "global"},
      {name: "bar/bar.js", type: "local"},
      {name: "top.js", type: "local"},
      {name: "bar/baz.js", type: "local"}
    ]);
  });
  it("finds all local imports in multiple files", () => {
    assert.deepStrictEqual(
      parseLocalImports("test/input/imports", ["transitive-static-import.js", "dynamic-import.js"]).imports,
      [
        {name: "transitive-static-import.js", type: "local"},
        {name: "dynamic-import.js", type: "local"},
        {name: "other/foo.js", type: "local"},
        {name: "bar.js", type: "local"}
      ]
    );
  });
  it("ignores missing files", () => {
    assert.deepStrictEqual(parseLocalImports("test/input/imports", ["static-import.js", "does-not-exist.js"]).imports, [
      {name: "static-import.js", type: "local"},
      {name: "does-not-exist.js", type: "local"},
      {name: "bar.js", type: "local"}
    ]);
  });
  it("find all local fetches in one file", () => {
    assert.deepStrictEqual(
      parseLocalImports("test/input/build/fetches", ["foo/foo.js"]).files.map(({node, ...f}) => f),
      [
        {path: "foo/foo-data.json", mimeType: "application/json", method: "json"},
        {path: "foo/foo-data.csv", mimeType: "text/csv", method: "text"}
      ]
    );
  });
  it("find all local fetches via transitive import", () => {
    assert.deepStrictEqual(
      parseLocalImports("test/input/build/fetches", ["top.js"]).files.map(({node, ...f}) => f),
      [
        {path: "top-data.json", mimeType: "application/json", method: "json"},
        {path: "top-data.csv", mimeType: "text/csv", method: "text"},
        {path: "foo/foo-data.json", mimeType: "application/json", method: "json"},
        {path: "foo/foo-data.csv", mimeType: "text/csv", method: "text"}
      ]
    );
  });
});

async function testFile(target: string, path: string): Promise<string> {
  const input = `import {FileAttachment} from "npm:@observablehq/stdlib";\nFileAttachment(${JSON.stringify(target)})`;
  const output = await rewriteModule(input, path, async (specifier) => specifier);
  return output.split("\n").pop()!;
}

describe("rewriteModule(input, path, resolver)", () => {
  it("rewrites relative files with import.meta.resolve", async () => {
    assert.strictEqual(await testFile("./test.txt", "test.js"), 'FileAttachment("../test.txt", import.meta.url)'); // prettier-ignore
    assert.strictEqual(await testFile("./sub/test.txt", "test.js"), 'FileAttachment("../sub/test.txt", import.meta.url)'); // prettier-ignore
    assert.strictEqual(await testFile("./test.txt", "sub/test.js"), 'FileAttachment("../../sub/test.txt", import.meta.url)'); // prettier-ignore
    assert.strictEqual(await testFile("../test.txt", "sub/test.js"), 'FileAttachment("../../test.txt", import.meta.url)'); // prettier-ignore
  });
  it("does not require paths to start with ./, ../, or /", async () => {
    assert.strictEqual(await testFile("test.txt", "test.js"), 'FileAttachment("../test.txt", import.meta.url)'); // prettier-ignore
    assert.strictEqual(await testFile("sub/test.txt", "test.js"), 'FileAttachment("../sub/test.txt", import.meta.url)'); // prettier-ignore
    assert.strictEqual(await testFile("test.txt", "sub/test.js"), 'FileAttachment("../../sub/test.txt", import.meta.url)'); // prettier-ignore
  });
  it("rewrites absolute files with meta", async () => {
    assert.strictEqual(await testFile("/test.txt", "test.js"), 'FileAttachment("../test.txt", import.meta.url)'); // prettier-ignore
    assert.strictEqual(await testFile("/sub/test.txt", "test.js"), 'FileAttachment("../sub/test.txt", import.meta.url)'); // prettier-ignore
    assert.strictEqual(await testFile("/test.txt", "sub/test.js"), 'FileAttachment("../../test.txt", import.meta.url)'); // prettier-ignore
  });
  it("ignores FileAttachment if masked by a reference", async () => {
    const input = 'import {FileAttachment} from "npm:@observablehq/stdlib";\n((FileAttachment) => FileAttachment("./test.txt"))(eval)'; // prettier-ignore
    const output = (await rewriteModule(input, "test.js", async (specifier) => specifier)).split("\n").pop()!;
    assert.strictEqual(output, '((FileAttachment) => FileAttachment("./test.txt"))(eval)');
  });
  it("ignores FileAttachment if not imported", async () => {
    const input = 'import {Generators} from "npm:@observablehq/stdlib";\nFileAttachment("./test.txt")';
    const output = (await rewriteModule(input, "test.js", async (specifier) => specifier)).split("\n").pop()!;
    assert.strictEqual(output, 'FileAttachment("./test.txt")');
  });
  it("ignores FileAttachment if a comma expression", async () => {
    const input = 'import {FileAttachment} from "npm:@observablehq/stdlib";\n(1, FileAttachment)("./test.txt")';
    const output = (await rewriteModule(input, "test.js", async (specifier) => specifier)).split("\n").pop()!;
    assert.strictEqual(output, '(1, FileAttachment)("./test.txt")');
  });
  it("ignores FileAttachment if not imported from @observablehq/stdlib", async () => {
    const input = 'import {FileAttachment} from "npm:@observablehq/not-stdlib";\nFileAttachment("./test.txt")';
    const output = (await rewriteModule(input, "test.js", async (specifier) => specifier)).split("\n").pop()!;
    assert.strictEqual(output, 'FileAttachment("./test.txt")');
  });
  it("rewrites FileAttachment when aliased", async () => {
    const input = 'import {FileAttachment as F} from "npm:@observablehq/stdlib";\nF("./test.txt")';
    const output = (await rewriteModule(input, "test.js", async (specifier) => specifier)).split("\n").pop()!;
    assert.strictEqual(output, 'F("../test.txt", import.meta.url)');
  });
  it("rewrites FileAttachment when aliased to a global", async () => {
    const input = 'import {FileAttachment as File} from "npm:@observablehq/stdlib";\nFile("./test.txt")';
    const output = (await rewriteModule(input, "test.js", async (specifier) => specifier)).split("\n").pop()!;
    assert.strictEqual(output, 'File("../test.txt", import.meta.url)');
  });
  it.skip("rewrites FileAttachment when imported as a namespace", async () => {
    const input = 'import * as O from "npm:@observablehq/stdlib";\nO.FileAttachment("./test.txt")';
    const output = (await rewriteModule(input, "test.js", async (specifier) => specifier)).split("\n").pop()!;
    assert.strictEqual(output, 'O.FileAttachment("../test.txt", import.meta.url)');
  });
  it("ignores non-FileAttachment calls", async () => {
    const input = 'import {FileAttachment} from "npm:@observablehq/stdlib";\nFile("./test.txt")';
    const output = (await rewriteModule(input, "test.js", async (specifier) => specifier)).split("\n").pop()!;
    assert.strictEqual(output, 'File("./test.txt")');
  });
  it("rewrites single-quoted literals", async () => {
    const input = "import {FileAttachment} from \"npm:@observablehq/stdlib\";\nFileAttachment('./test.txt')";
    const output = (await rewriteModule(input, "test.js", async (specifier) => specifier)).split("\n").pop()!;
    assert.strictEqual(output, 'FileAttachment("../test.txt", import.meta.url)');
  });
  it("rewrites template-quoted literals", async () => {
    const input = 'import {FileAttachment} from "npm:@observablehq/stdlib";\nFileAttachment(`./test.txt`)';
    const output = (await rewriteModule(input, "test.js", async (specifier) => specifier)).split("\n").pop()!;
    assert.strictEqual(output, 'FileAttachment("../test.txt", import.meta.url)');
  });
  it("throws a syntax error with non-literal calls", async () => {
    const input = "import {FileAttachment} from \"npm:@observablehq/stdlib\";\nFileAttachment(`./${'test'}.txt`)";
    await assert.rejects(() => rewriteModule(input, "test.js", async (specifier) => specifier), /FileAttachment requires a single literal string/); // prettier-ignore
  });
  it("throws a syntax error with URL fetches", async () => {
    const input = 'import {FileAttachment} from "npm:@observablehq/stdlib";\nFileAttachment("https://example.com")';
    await assert.rejects(() => rewriteModule(input, "test.js", async (specifier) => specifier), /non-local file path/); // prettier-ignore
  });
  it("ignores non-local path fetches", async () => {
    const input1 = 'import {FileAttachment} from "npm:@observablehq/stdlib";\nFileAttachment("../test.txt")';
    const input2 = 'import {FileAttachment} from "npm:@observablehq/stdlib";\nFileAttachment("./../test.txt")';
    const input3 = 'import {FileAttachment} from "npm:@observablehq/stdlib";\nFileAttachment("../../test.txt")';
    const input4 = 'import {FileAttachment} from "npm:@observablehq/stdlib";\nFileAttachment("./../../test.txt")';
    await assert.rejects(() => rewriteModule(input1, "test.js", async (specifier) => specifier), /non-local file path/); // prettier-ignore
    await assert.rejects(() => rewriteModule(input2, "test.js", async (specifier) => specifier), /non-local file path/); // prettier-ignore
    await assert.rejects(() => rewriteModule(input3, "sub/test.js", async (specifier) => specifier), /non-local file path/); // prettier-ignore
    await assert.rejects(() => rewriteModule(input4, "sub/test.js", async (specifier) => specifier), /non-local file path/); // prettier-ignore
  });
});

function parse(input: string): Program {
  return Parser.parse(input, {ecmaVersion: 13, sourceType: "module"});
}
