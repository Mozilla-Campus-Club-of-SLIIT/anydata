import csv from "./csv.js"
import json from "./json.js"
import xml from "./xml.js"
import yaml from "./yaml.js"
import any from "./any.js"
import StructuredData from "./StructuredData.js"

/**
 * Public entrypoint for the anydata library. Re-exports each format adapter
 * along with the common StructuredData container so downstream consumers can do
 * named imports like `import { csv, StructuredData } from "anydata"`.
 *
 * Exports:
 * - `csv`  : RFC4180-style parser/loader that understands optional headers.
 * - `json` : Thin wrapper around JSON.parse with StructuredData semantics.
 * - `xml`  : Streaming tokenizer + tree builder for XML documents.
 * - `yaml` : Placeholder adapter slated for future YAML support.
 * - `any`  : Smart facade that auto-detects and delegates to a specific parser.
 * - `StructuredData`: Format-agnostic container used by every adapter.
 */
export { csv, json, xml, yaml, any, StructuredData }
