import assert from "assert"
import { promises as fs } from "fs"
import { toml, StructuredData } from "../src/index.js"

// from: https://toml.io/en/v1.0.0
const tomlString = `
# This is a full-line comment
key = "value"  # This is a comment at the end of a line
another = "# This is not a comment"

bare_key = "value"
bare-key = "value"
1234 = "value"

"127.0.0.1" = "value"
"character encoding" = "value"
"ʎǝʞ" = "value"
'key2' = "value"
'quoted "value"' = "value"

"bool1" = true
bool2 = false

int1 = +99
int2 = 42
int3 = 0
int4 = -17
int5 = 1_000
int6 = 5_349_221
int7 = 53_49_221
int8 = 1_2_3_4_5

flt1 = +1.0
flt2 = 3.1415
flt3 = -0.01
flt4 = 5e+22
flt5 = 1e06
flt6 = -2E-2
flt7 = 6.626e-34

sf1 = inf
sf2 = +inf
sf3 = -inf

sf4 = nan 
sf5 = +nan
sf6 = -nan 
`

describe("TOML", function () {
  it("should parse TOML string", function () {
    const data = toml.from(tomlString)
    console.log(data)
    assert(data instanceof StructuredData)
    assert.strictEqual("", "")
  })
})