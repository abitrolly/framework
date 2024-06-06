import {Runtime} from "observablehq:runtime";
import {FileAttachment, Generators, Mutable, resize} from "observablehq:stdlib";
import {inspect, inspectError} from "./inspect.js";
import * as recommendedLibraries from "./stdlib/recommendedLibraries.js";
import * as sampleDatasets from "./stdlib/sampleDatasets.js";

const library = {
  now: () => Generators.now(),
  width: () => Generators.width(document.querySelector("main")),
  dark: () => Generators.dark(),
  resize: () => resize,
  FileAttachment: () => FileAttachment,
  Generators: () => Generators,
  Mutable: () => Mutable,
  ...recommendedLibraries,
  ...sampleDatasets
};

export const runtime = new Runtime(library);
export const main = runtime.module();

const cellsById = new Map();
const rootsById = findRoots(document.body);

export function define(cell) {
  const {id, inline, attr, inputs = [], outputs = [], body} = cell;
  const variables = [];
  cellsById.get(id)?.variables.forEach((v) => v.delete());
  cellsById.set(id, {cell, variables});
  const root = rootsById.get(id);
  const loading = attr ? null : findLoading(root);
  if (!attr) root._nodes = [];
  if (loading) root._nodes.push(loading);
  const pending = attr ? () => {} : () => reset(root, loading);
  const rejected = attr ? () => {} : (error) => reject(root, error);
  const v = main.variable({_node: attr ? root : root.parentNode, pending, rejected}, {shadow: {}}); // _node for visibility promise
  if (inputs.includes("display") || inputs.includes("view")) {
    let displayVersion = -1; // the variable._version of currently-displayed values
    const display = attr ? displayAttr(attr) : inline ? displayInline : displayBlock;
    const vd = new v.constructor(2, v._module);
    vd.define(
      inputs.filter((i) => i !== "display" && i !== "view"),
      () => {
        let version = v._version; // capture version on input change
        return (value) => {
          if (version < displayVersion) throw new Error("stale display");
          else if (version > displayVersion && !attr) clear(root);
          displayVersion = version;
          display(root, value);
          return value;
        };
      }
    );
    v._shadow.set("display", vd);
    if (inputs.includes("view")) {
      const vv = new v.constructor(2, v._module, null, {shadow: {}});
      vv._shadow.set("display", vd);
      vv.define(["display"], (display) => (v) => Generators.input(display(v)));
      v._shadow.set("view", vv);
    }
  }
  v.define(outputs.length ? `cell ${id}` : null, inputs, body);
  variables.push(v);
  for (const o of outputs) variables.push(main.variable(true).define(o, [`cell ${id}`], (exports) => exports[o]));
}

// If the variable previously rejected, it will show an error even if it doesn’t
// normally display; we can’t rely on a subsequent display clearing the error,
// so we clear the error when the variable is pending. We also restore the
// original loading indicator in this case, which applies to inline expressions
// and expression code blocks.
function reset(root, loading) {
  if (root._error) {
    root._error = false;
    clear(root);
    if (loading) displayNode(root, loading);
  }
}

function reject(root, error) {
  console.error(error);
  root._error = true; // see reset
  clear(root);
  displayNode(root, inspectError(error));
}

function displayNode(root, node) {
  if (node.nodeType === 11) {
    let child;
    while ((child = node.firstChild)) {
      root._nodes.push(child);
      root.parentNode.insertBefore(child, root);
    }
  } else {
    root._nodes.push(node);
    root.parentNode.insertBefore(node, root);
  }
}

function clear(root) {
  for (const v of root._nodes) v.remove();
  root._nodes.length = 0;
}

function displayAttr(name) {
  return (root, value) => {
    root.setAttribute(name, value); // TODO remove if nullish value
  };
}

function displayInline(root, value) {
  if (isNode(value)) {
    displayNode(root, value);
  } else if (typeof value === "string" || !value?.[Symbol.iterator]) {
    displayNode(root, document.createTextNode(value));
  } else {
    for (const v of value) {
      displayNode(root, isNode(v) ? v : document.createTextNode(v));
    }
  }
}

function displayBlock(root, value) {
  displayNode(root, isNode(value) ? value : inspect(value));
}

export function undefine(id) {
  cellsById.get(id)?.variables.forEach((v) => v.delete());
  cellsById.delete(id);
}

// Note: Element.prototype is instanceof Node, but cannot be inserted!
function isNode(value) {
  return value instanceof Node && value instanceof value.constructor;
}

export function findRoots(root) {
  const roots = new Map();
  const iterator = document.createNodeIterator(root, 128, null);
  let node;
  while ((node = iterator.nextNode())) {
    if (isRoot(node)) {
      roots.set(node.data.slice(1, -1), node);
    }
  }
  for (const element of document.querySelectorAll("[data-attr]")) {
    for (const attr of element.attributes) {
      if (attr.name.startsWith("data-attr-")) {
        roots.set(attr.value.slice(1, -1), element);
      }
    }
  }
  return roots;
}

function isRoot(node) {
  return node.nodeType === 8 && /^:[0-9a-f]{8}(?:-\d+)?:$/.test(node.data);
}

function isLoading(node) {
  return node.nodeType === 1 && node.tagName === "O-LOADING";
}

export function findLoading(root) {
  const sibling = root.previousSibling;
  return sibling && isLoading(sibling) ? sibling : null;
}

export function registerRoot(id, node) {
  if (node == null) rootsById.delete(id);
  else rootsById.set(id, node);
}
