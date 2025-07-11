import { promises as fs, PathLike } from "fs"
import DataFormat from "./types/DataFormat"
import StructuredData from "./StructuredData.js"

// https://www.w3.org/TR/xml/
// https://xmlbeans.apache.org/docs/2.0.0/guide/conUnderstandingXMLTokens.html
type TokenType =
  | "COMMENT"
  | "CDATA"
  | "PROCINST"
  | "DOCTYPE_DECL"
  | "STAG"
  | "ETAG"
  | "EMPTY_ELEM_TAG"
  | "ATTR_NAME"
  | "ATTR_VALUE"
  | "TEXT"

interface Token {
  type: TokenType
  value: string
}

interface Node {
  parent: Node | null
  children: Node[]
  key: string
  value: string
}

const _consumeUntil = (
  str: string,
  chars: string[],
  i: number,
  n: number,
): [value: string, i: number] => {
  let value = ""
  let lookForCharLength = chars[0].length
  let isLookingForSingleCharacter = lookForCharLength == 1
  while (i < n) {
    // some minor optimizations to avoid calling substring
    const c = str[i]
    const currentSearch = isLookingForSingleCharacter ? c : str.substring(i, i + lookForCharLength)
    if (chars.includes(currentSearch)) {
      return [value, i]
    } else {
      value += c
      i++
    }
  }
  throw new SyntaxError("Unexpected EOF")
}

const _processProcInst = (
  str: string,
  i: number,
  n: number,
): [Token, i: number, canCloseTag: boolean] => {
  if (++i >= n) throw new SyntaxError("Unexpected EOF")
  let [value, newIndex] = _consumeUntil(str, ["?"], i, n)
  i = newIndex

  const nextChar = str[i + 1]
  if (nextChar == ">") {
    const token = {
      type: "PROCINST",
      value,
    } as Token
    return [token, i + 1, true]
  } else {
    throw new SyntaxError(`Expected > at ${i + 1}, instead found ${nextChar}`)
  }
}

const _processStartTag = (
  str: string,
  i: number,
  n: number,
): [Token, i: number, canCloseTag: boolean] => {
  let [value, newIndex] = _consumeUntil(str, [" ", ">"], i, n)
  i = newIndex
  const token = {
    type: "STAG",
    value,
  } as Token
  return [token, i, str[i] == " "]
}

const _processEndTag = (
  str: string,
  i: number,
  n: number,
): [Token, i: number, canCloseTag: boolean] => {
  if (++i >= n) throw new SyntaxError("Unexpected EOF")
  let [value, newIndex] = _consumeUntil(str, [">"], i, n)
  i = newIndex
  const token = {
    type: "ETAG",
    value,
  } as Token
  return [token, i, true]
}

const _processEmptyElementTag = (str: string, i: number): [Token, i: number] => {
  const nextChar = str[i + 1]
  if (nextChar == ">") {
    const token = {
      type: "EMPTY_ELEM_TAG",
      value: "",
    } as Token
    return [token, i + 1]
  } else throw new SyntaxError(`Unexpected symbol ${nextChar} at ${i + 1}. Expected >`)
}

const _processDoctype = (
  str: string,
  i: number,
  n: number,
): [Token, i: number, canCloseTag: boolean] => {
  const [value, newIndex] = _consumeUntil(str, [">"], i, n)
  i = newIndex
  const token = {
    type: "DOCTYPE_DECL",
    value,
  } as Token
  return [token, i, true]
}

const _processCData = (
  str: string,
  i: number,
  n: number,
): [Token, i: number, canCloseTag: boolean] => {
  const [value, newIndex] = _consumeUntil(str, ["]]>"], i, n)
  i = newIndex
  const token = {
    type: "CDATA",
    value,
  } as Token
  return [token, i + 2, true]
}

const _processComment = (
  str: string,
  i: number,
  n: number,
): [Token, i: number, canCloseTag: boolean] => {
  const [value, newIndex] = _consumeUntil(str, ["-->"], i, n)
  i = newIndex
  const token = {
    type: "COMMENT",
    value,
  } as Token
  return [token, i + 2, true]
}

const _processOpenTag = (
  str: string,
  i: number,
  n: number,
): [Token, i: number, canCloseTag: boolean] => {
  if (++i >= n) throw new SyntaxError("Unexpected EOF")
  const c = str[i]

  if (c == "?") {
    return _processProcInst(str, i, n)
  } else if (c == "/") {
    return _processEndTag(str, i, n)
  } else if (c == "!") {
    if (str.startsWith("!--", i)) return _processComment(str, i + 3, n)
    else if (str.startsWith("!DOCTYPE ", i)) return _processDoctype(str, i + 9, n)
    else if (str.startsWith("![CDATA[", i)) return _processCData(str, i + 8, n)
    else throw new SyntaxError(`Unexpected symbol ! at ${i}`)
  } else {
    // starting tag
    return _processStartTag(str, i, n)
  }
}

const _processAttribute = (str: string, i: number, n: number): [Token, i: number] => {
  let c = str[i]

  const isAttributeValue = c == '"'
  const endCharacter = isAttributeValue ? '"' : "="

  if (isAttributeValue) i++

  let [value, newIndex] = _consumeUntil(str, [endCharacter], i, n)
  i = newIndex
  const token = {
    type: isAttributeValue ? "ATTR_VALUE" : "ATTR_NAME",
    value,
  } as Token
  return [token, i]
}

const _processText = (str: string, i: number, n: number): [Token, i: number] => {
  let [value, newIndex] = _consumeUntil(str, ["<"], i, n)
  i = newIndex
  const token = {
    type: "TEXT",
    value,
  } as Token
  return [token, i - 1]
}

const tokenize = (str: string): Token[] => {
  const tokens = [] as Token[]
  const n = str.length
  let i = 0
  let tagOpen = false

  while (i < n) {
    const c = str[i]

    if (c == "<") {
      tagOpen = true
      const [token, newIndex, canCloseTag] = _processOpenTag(str, i, n)
      i = newIndex
      tagOpen = canCloseTag
      tokens.push(token)
    } else if (c == ">") {
      if (tagOpen) tagOpen = false
      else throw new SyntaxError(`Unexpected symbol > at ${i}`)
    } else if (c == "/") {
      // expecting a self closing tag
      const [token, newIndex] = _processEmptyElementTag(str, i)
      i = newIndex
      tokens.push(token)
    } else if (c == "\n" || c == "\t" || c == " ") {
      i++
      continue
    } else {
      let token: Token

      if (tagOpen) {
        // if tag is opened, it must be an attribute
        ;[token, i] = _processAttribute(str, i, n)
      } else {
        // if tag is closed, it must be text
        ;[token, i] = _processText(str, i, n)
      }
      tokens.push(token)
    }
    i++
  }

  return tokens
}

/*const _constructObject = (node: Node): Record<string, any> => {
  let obj = node.key && node.value ?
  {
    [node.key]: node.value,
  } :
  { } as Record<string, any>

  console.log(node)

  if (node.children.length == 0) return obj
  else {
    for (let child of node.children) {
      console.log(child.value)
      obj[child.key] = child.value || _constructObject(child)
    }
    return obj
  }
}

const parse = (str: string): Record<string, any> => {
  const tokens = tokenize(str)

  let root = {
    children: [] as Node[]
  } as Node

  let currentParent: Node | null = root
  let obj: Record<string, any> = {}

  for (let token of tokens) {
    if (token.type === "STAG") {
      let newNode = {
        key: token.value,
        parent: currentParent,
        children: [] as Node[]
      } as Node
      currentParent?.children.push(newNode)
      currentParent = newNode
    } else if (token.type === "ETAG") {
      currentParent = currentParent?.parent || null
    } else if (token.type === "EMPTY_ELEM_TAG") {
      currentParent = currentParent?.parent || null
    } else if (token.type === "TEXT") {
      if (currentParent) currentParent.value = token.value
    }
  }

  // recursively create the object while transversing through the nodes
  obj = _constructObject(root)
  console.log(JSON.stringify(obj))

  return obj
}*/

const xml: DataFormat = {
  loadFile: async function (path: PathLike | fs.FileHandle): Promise<StructuredData> {
    throw new Error("Function not implemented.")
  },

  from: function (text: string): StructuredData {
    console.log(parse(text))
    return new StructuredData({}, "xml")
  },
}

export default xml
