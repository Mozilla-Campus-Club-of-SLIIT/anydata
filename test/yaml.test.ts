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

      const yamlData = data.data as Record<string, any>
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

      const yamlData = data.data as Record<string, any>
      assert.strictEqual(yamlData.name, "John Doe")
      assert.strictEqual(yamlData.age, 30)
      assert.strictEqual(yamlData.active, true)
    })

    it("should create a StructuredData object with complex yaml", () => {
      const data = yaml.from(complexYaml)

      assert.ok(data instanceof StructuredData)

      const yamlData = data.data as Record<string, any>
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
      const yamlData = data.data as Record<string, any>

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
      const yamlData = data.data as Record<string, any>

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
      const yamlData = data.data as Record<string, any>

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
      const yamlData = data.data as Record<string, any>

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
      const yamlData = data.data as Record<string, any>

      assert.ok(Array.isArray(yamlData.users))
      assert.strictEqual(yamlData.users.length, 2)
      assert.strictEqual(yamlData.users[0].name, "Alice")
      assert.deepStrictEqual(yamlData.users[0].roles, ["admin", "user"])
      assert.strictEqual(yamlData.users[0].profile.email, "alice@example.com")
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
      const yamlData = data.data as Record<string, any>

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
      const yamlData = data.data as Record<string, any>

      assert.strictEqual(yamlData.name, "John")
      assert.strictEqual(yamlData.age, 30)
    })
  })
})
