#!/usr/bin/env node
// =====================================================================
//  port-prototype.mjs — ONE-SHOT mechanical port of the prototype's JSX
//  files into ES modules under portals/. Semantic changes (server-backed
//  writes, uploads, auth boot) are then made by hand and committed; this
//  script is kept for traceability of what was changed automatically.
//
//  Usage: node scripts/port-prototype.mjs [path/to/prototype]
// =====================================================================
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const proto = path.resolve(process.argv[2] || path.join(root, "..", "revnu"));
const read = (f) => fs.readFileSync(path.join(proto, f), "utf8");
const write = (f, s) => { fs.mkdirSync(path.dirname(path.join(root, f)), { recursive: true }); fs.writeFileSync(path.join(root, f), s, "utf8"); console.log("wrote", f, s.split("\n").length, "lines"); };

// Links between the old static pages → app routes (query params preserved).
const links = (s) => s
  .replace(/"login\.html"/g, '"/login"')
  .replace(/"revnu\.html"/g, '"/revnu"')
  .replace(/"developer\.html\?dev="/g, '"/developer?dev="')
  .replace(/"sales\.html\?dev="/g, '"/sales?dev="');

// ---- shared IIFE modules → ES modules that also keep their window.* globals ----
function iife(src, { imports, exportsLine }) {
  let s = src.replace(/\(function \(\) \{\n/, "").replace(/\n\}\)\(\);\s*$/, "\n");
  s = s.replace(/^const D = window\.REVNU_DATA;\n/m, "");
  return imports + "\n" + links(s) + "\n" + exportsLine + "\n";
}

write("portals/shared/floorplan.jsx", iife(read("floorplan.jsx"), {
  imports: '"use client";\nimport React from "react";',
  exportsLine: "export { FloorPlan, unitLevels, unitLevelName };",
}));
write("portals/shared/contract.jsx", iife(read("contract.jsx"), {
  imports: '"use client";\nimport React from "react";\nimport D from "@/lib/data/store";\nimport "./floorplan";',
  exportsLine: "export { FullAgreement, AppendixKyc };",
}));
write("portals/shared/wordexport.jsx", iife(read("wordexport.jsx"), {
  imports: '"use client";\nimport React from "react";\nimport * as ReactDOMClient from "react-dom/client";\nimport D from "@/lib/data/store";\nimport "./floorplan";\nif (typeof window !== "undefined") { window.React = React; window.ReactDOM = ReactDOMClient; }',
  exportsLine: "export { downloadAgreementWord };",
}));

// ---- portal apps: header + mount → module; the bootstrap block is rewritten by hand afterwards ----
function portal(src, { hooks, extraImports }) {
  let s = links(src);
  s = s.replace(/^const \{ [^}]+ \} = React;\n/m, `import React, { ${hooks} } from "react";\n`);
  s = s.replace(/^const D = window\.REVNU_DATA;\n/m, 'import D from "@/lib/data/store";\nimport { useStoreVersion } from "@/lib/data/useStore";\n' + (extraImports || ""));
  s = s.replace(/\nReactDOM\.createRoot\(document\.getElementById\("root"\)\)\.render\(<App \/>\);\s*$/, "\n");
  return '"use client";\n' + s;
}

write("portals/sales/SalesApp.jsx", portal(read("sales.jsx"), {
  hooks: "useState, useEffect, useMemo",
  extraImports: 'import { createPortal } from "react-dom";\nimport { FullAgreement, AppendixKyc } from "@/portals/shared/contract";\nimport { downloadAgreementWord } from "@/portals/shared/wordexport";\nimport { FloorPlan, unitLevels, unitLevelName } from "@/portals/shared/floorplan";\n',
}));
write("portals/developer/DeveloperApp.jsx", portal(read("developer.jsx"), { hooks: "useState, useMemo" }));
write("portals/revnu/RevnuApp.jsx", portal(read("revnu.jsx"), { hooks: "useState, useMemo" }));
