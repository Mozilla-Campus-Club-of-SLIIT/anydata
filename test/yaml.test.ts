import assert from "assert"
import { promises as fs } from "fs"
import { yaml, StructuredData } from "../src/index.js"

const simpleYaml = `name: John Doe
age: 30
active: true
score: 95.5
address:
  street: 123 Main St
  city: New York
  zipcode: 10001
hobbies:
  - reading
  - swimming
  - coding`

const complexYaml = `---
# Configuration file
version: "1.0"
database:
  host: localhost
  port: 5432
  credentials:
    username: admin
    password: secret
    ssl: true
servers:
  - name: web1
    ip: "192.168.1.10"
    roles:
      - web
      - api
  - name: db1
    ip: "192.168.1.20" 
    roles:
      - database
features:
  logging: true
  monitoring: false
  backup: null
settings:
  timeout: 30
  retries: 3
  debug: false`

describe("yaml", () => {
  describe("loadFile", () => {
    before(async () => {
      // create file with valid yaml
      await fs.writeFile("test.yaml", simpleYaml)
      // create file with invalid yaml
      await fs.writeFile("invalid.yaml", "name: John\n  invalid: indentation\nage: 30")
    })

    after(async () => {
      // clean up files
      await fs.unlink("test.yaml")
      await fs.unlink("invalid.yaml")
    })

    it("should create a StructuredData object with a valid yaml file", async () => {
      const data = await yaml.loadFile("test.yaml")

      assert.ok(data instanceof StructuredData)
      assert.strictEqual(data.originFormat, "yaml")

      const yamlData = data.data as Record<string, unknown>
      assert.strictEqual(yamlData.name, "John Doe")
      assert.strictEqual(yamlData.age, 30)
      assert.strictEqual(yamlData.active, true)
      assert.strictEqual(yamlData.score, 95.5)
      assert.deepStrictEqual(yamlData.address, {
        street: "123 Main St",
        city: "New York",
        zipcode: 10001
      })
      assert.deepStrictEqual(yamlData.hobbies, ["reading", "swimming", "coding"])
    })

    it("should throw an error for a file with invalid yaml", async () => {
      await assert.rejects(
        async () => await yaml.loadFile("invalid.yaml"),
        {
          name: "SyntaxError"
        }
      )
    })

    it("should throw an error if the file is not found", async () => {
      await assert.rejects(
        async () => await yaml.loadFile("nonexistent.yaml"),
        {
          name: "Error",
          message: "ENOENT: no such file or directory, open 'nonexistent.yaml'"
        }
      )
    })
  })

  describe("from", () => {
    it("should create a StructuredData object with valid simple yaml", () => {
      const data = yaml.from(simpleYaml)

      assert.ok(data instanceof StructuredData)
      assert.strictEqual(data.originFormat, "yaml")

      const yamlData = data.data as Record<string, unknown>
      assert.strictEqual(yamlData.name, "John Doe")
      assert.strictEqual(yamlData.age, 30)
      assert.strictEqual(yamlData.active, true)
    })

    it("should create a StructuredData object with complex yaml", () => {
      const data = yaml.from(complexYaml)

      assert.ok(data instanceof StructuredData)

      const yamlData = data.data as Record<string, unknown>
      assert.strictEqual(yamlData.version, "1.0")
      assert.deepStrictEqual(yamlData.database, {
        host: "localhost",
        port: 5432,
        credentials: {
          username: "admin",
          password: "secret",
          ssl: true
        }
      })

      assert.ok(Array.isArray(yamlData.servers))
      assert.strictEqual(yamlData.servers.length, 2)
      assert.strictEqual(yamlData.servers[0].name, "web1")
      assert.deepStrictEqual(yamlData.servers[0].roles, ["web", "api"])
    })

    it("should handle boolean values correctly", () => {
      const booleanYaml = `
true_values:
  - true
  - yes  
  - on
false_values:
  - false
  - no
  - off`

      const data = yaml.from(booleanYaml)
      const yamlData = data.data as Record<string, unknown>

      assert.deepStrictEqual(yamlData.true_values, [true, true, true])
      assert.deepStrictEqual(yamlData.false_values, [false, false, false])
    })

    it("should handle null values correctly", () => {
      const nullYaml = `
null_value: null
tilde_null: ~
empty_null:
explicit_null: null`

      const data = yaml.from(nullYaml)
      const yamlData = data.data as Record<string, unknown>

      assert.strictEqual(yamlData.null_value, null)
      assert.strictEqual(yamlData.tilde_null, null)
      assert.strictEqual(yamlData.empty_null, null)
      assert.strictEqual(yamlData.explicit_null, null)
    })

    it("should handle different number formats", () => {
      const numberYaml = `
integer: 42
negative: -17
float: 3.14159
negative_float: -2.71828`

      const data = yaml.from(numberYaml)
      const yamlData = data.data as Record<string, unknown>

      assert.strictEqual(yamlData.integer, 42)
      assert.strictEqual(yamlData.negative, -17)
      assert.strictEqual(yamlData.float, 3.14159)
      assert.strictEqual(yamlData.negative_float, -2.71828)
    })

    it("should handle quoted strings", () => {
      const quotedYaml = `
double_quoted: "Hello World"
single_quoted: 'Hello World'
unquoted: Hello World`

      const data = yaml.from(quotedYaml)
      const yamlData = data.data as Record<string, unknown>

      assert.strictEqual(yamlData.double_quoted, "Hello World")
      assert.strictEqual(yamlData.single_quoted, "Hello World")
      assert.strictEqual(yamlData.unquoted, "Hello World")
    })

    it("should handle nested objects and arrays", () => {
      const nestedYaml = `
users:
  - name: Alice
    roles:
      - admin
      - user
    profile:
      email: alice@example.com
      active: true
  - name: Bob
    roles:
      - user
    profile:
      email: bob@example.com
      active: false`

      const data = yaml.from(nestedYaml)
      const yamlData = data.data as Record<string, unknown>

      assert.ok(Array.isArray(yamlData.users))
      const users = yamlData.users as Array<Record<string, unknown>>
      assert.strictEqual(users.length, 2)
      assert.strictEqual(users[0].name, "Alice")
      assert.deepStrictEqual(users[0].roles, ["admin", "user"])
      assert.strictEqual((users[0].profile as Record<string, unknown>).email, "alice@example.com")
    })

    it("should throw an error for empty yaml", () => {
      assert.throws(() => yaml.from(""), {
        name: "SyntaxError",
        message: "Empty YAML document"
      })
    })

    it("should throw an error for invalid yaml syntax", () => {
      assert.throws(() => yaml.from("name: John\n  invalid: indentation"), {
        name: "SyntaxError"
      })
    })

    it("should handle yaml with comments", () => {
      const commentYaml = `# This is a comment
name: John # inline comment
age: 30
# Another comment
city: New York`

      const data = yaml.from(commentYaml)
      const yamlData = data.data as Record<string, unknown>

      assert.strictEqual(yamlData.name, "John")
      assert.strictEqual(yamlData.age, 30)
      assert.strictEqual(yamlData.city, "New York")
    })

    it("should handle document separators", () => {
      const docYaml = `---
name: John
age: 30
...`

      const data = yaml.from(docYaml)
      const yamlData = data.data as Record<string, unknown>

      assert.strictEqual(yamlData.name, "John")
      assert.strictEqual(yamlData.age, 30)
    })
  })

  describe("toYaml", () => {
    it("should convert simple YAML data back to YAML format", () => {
      const originalYaml = `name: John Doe
age: 30
active: true`

      const data = yaml.from(originalYaml)
      const yamlOutput = data.toYaml()

      assert.strictEqual(typeof yamlOutput, "string")

      // Parse the output back to verify round-trip
      const roundTrip = yaml.from(yamlOutput)
      const originalData = data.data as Record<string, unknown>
      const roundTripData = roundTrip.data as Record<string, unknown>

      assert.strictEqual(roundTripData.name, originalData.name)
      assert.strictEqual(roundTripData.age, originalData.age)
      assert.strictEqual(roundTripData.active, originalData.active)
    })

    it("should convert complex nested structures to YAML", () => {
      const complexYaml = `database:
  host: localhost
  port: 5432
  credentials:
    username: admin
    password: secret
servers:
  - name: web1
    roles:
      - web
      - api
  - name: db1
    roles:
      - database`

      const data = yaml.from(complexYaml)
      const yamlOutput = data.toYaml()

      // Verify round-trip conversion
      const roundTrip = yaml.from(yamlOutput)
      const originalData = data.data as Record<string, unknown>
      const roundTripData = roundTrip.data as Record<string, unknown>

      assert.deepStrictEqual(roundTripData.database, originalData.database)
      assert.deepStrictEqual(roundTripData.servers, originalData.servers)
    })

    it("should handle arrays correctly in YAML output", () => {
      const arrayYaml = `hobbies:
  - reading
  - swimming
  - coding
numbers:
  - 1
  - 2
  - 3`

      const data = yaml.from(arrayYaml)
      const yamlOutput = data.toYaml()

      const roundTrip = yaml.from(yamlOutput)
      const originalData = data.data as Record<string, unknown>
      const roundTripData = roundTrip.data as Record<string, unknown>

      assert.deepStrictEqual(roundTripData.hobbies, originalData.hobbies)
      assert.deepStrictEqual(roundTripData.numbers, originalData.numbers)
    })

    it("should handle different data types in YAML output", () => {
      const typesYaml = `string_value: hello
number_value: 42
boolean_true: true
boolean_false: false
null_value: null`

      const data = yaml.from(typesYaml)
      const yamlOutput = data.toYaml()

      const roundTrip = yaml.from(yamlOutput)
      const originalData = data.data as Record<string, unknown>
      const roundTripData = roundTrip.data as Record<string, unknown>

      assert.strictEqual(roundTripData.string_value, originalData.string_value)
      assert.strictEqual(roundTripData.number_value, originalData.number_value)
      assert.strictEqual(roundTripData.boolean_true, originalData.boolean_true)
      assert.strictEqual(roundTripData.boolean_false, originalData.boolean_false)
      assert.strictEqual(roundTripData.null_value, originalData.null_value)
    })

    it("should quote strings that look like other types", () => {
      const specialStringYaml = `normal: hello
looks_like_number: "123"
looks_like_boolean: "true"
has_colon: "key: value"
has_hash: "text # comment"`

      const data = yaml.from(specialStringYaml)
      const yamlOutput = data.toYaml()

      const roundTrip = yaml.from(yamlOutput)
      const originalData = data.data as Record<string, unknown>
      const roundTripData = roundTrip.data as Record<string, unknown>

      assert.strictEqual(roundTripData.looks_like_number, originalData.looks_like_number)
      assert.strictEqual(roundTripData.looks_like_boolean, originalData.looks_like_boolean)
      assert.strictEqual(roundTripData.has_colon, originalData.has_colon)
      assert.strictEqual(roundTripData.has_hash, originalData.has_hash)
    })

    it("should throw error when trying to convert non-YAML data to YAML", () => {
      const jsonData = { name: "John", age: 30 }
      const structuredData = new StructuredData(jsonData, "json")

      assert.throws(() => structuredData.toYaml(), {
        name: "Error",
        message: "Cannot convert to YAML: data was not originally in YAML format"
      })
    })

    it("should handle empty objects and arrays", () => {
      const emptyYaml = `empty_object: {}
empty_array: []
nested:
  empty_obj: {}
  empty_arr: []`

      const data = yaml.from(emptyYaml)
      const yamlOutput = data.toYaml()

      const roundTrip = yaml.from(yamlOutput)
      const originalData = data.data as Record<string, unknown>
      const roundTripData = roundTrip.data as Record<string, unknown>

      assert.deepStrictEqual(roundTripData, originalData)
    })

    it("should maintain data integrity in round-trip conversion", () => {
      const data = yaml.from(complexYaml)
      const yamlOutput = data.toYaml()
      const roundTrip = yaml.from(yamlOutput)

      // The round-trip data should be equivalent to the original
      assert.deepStrictEqual(roundTrip.data, data.data)
      assert.strictEqual(roundTrip.originFormat, "yaml")
    })
  })
})
