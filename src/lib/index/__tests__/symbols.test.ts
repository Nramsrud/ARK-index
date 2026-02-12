/**
 * Tests for symbols.ts - symbol extraction and ID generation
 */

import { describe, it, expect } from 'vitest';
import {
  generateSymbolId,
  extractSymbolsBaseline,
  countLinesOfCode,
  countImports,
  JS_KEYWORDS,
  getLineNumber,
  extractSymbolNames,
  getSymbolAtLine,
} from '../symbols.js';

describe('symbols.ts', () => {
  describe('generateSymbolId', () => {
    it('generates simple ID for top-level symbol', () => {
      const existingIds = new Set<string>();
      const id = generateSymbolId('src/utils.ts', 'formatDate', 10, existingIds);
      expect(id).toBe('src/utils.ts::formatDate');
    });

    it('handles collision with line number', () => {
      const existingIds = new Set<string>(['src/utils.ts::formatDate']);
      const id = generateSymbolId('src/utils.ts', 'formatDate', 20, existingIds);
      expect(id).toBe('src/utils.ts::formatDate:L20');
    });

    it('includes container in ID', () => {
      const existingIds = new Set<string>();
      const id = generateSymbolId('src/client.ts', 'get', 10, existingIds, 'HttpClient');
      expect(id).toBe('src/client.ts::HttpClient.get');
    });

    it('preserves container in name if already present', () => {
      const existingIds = new Set<string>();
      const id = generateSymbolId('src/client.ts', 'HttpClient.get', 10, existingIds);
      expect(id).toBe('src/client.ts::HttpClient.get');
    });
  });

  describe('extractSymbolsBaseline', () => {
    describe('TypeScript/JavaScript', () => {
      it('extracts exported functions', () => {
        const content = `export function hello() { return "world"; }`;
        const symbols = extractSymbolsBaseline(content, 'index.ts');

        expect(symbols.length).toBe(1);
        expect(symbols[0].name).toBe('hello');
        expect(symbols[0].kind).toBe('function');
      });

      it('extracts exported async functions', () => {
        const content = `export async function fetchData() { return []; }`;
        const symbols = extractSymbolsBaseline(content, 'index.ts');

        expect(symbols.length).toBe(1);
        expect(symbols[0].name).toBe('fetchData');
        expect(symbols[0].kind).toBe('function');
      });

      it('extracts exported classes', () => {
        const content = `export class MyClass {}`;
        const symbols = extractSymbolsBaseline(content, 'index.ts');

        expect(symbols.length).toBe(1);
        expect(symbols[0].name).toBe('MyClass');
        expect(symbols[0].kind).toBe('class');
      });

      it('extracts exported interfaces', () => {
        const content = `export interface MyInterface {}`;
        const symbols = extractSymbolsBaseline(content, 'index.ts');

        expect(symbols.length).toBe(1);
        expect(symbols[0].name).toBe('MyInterface');
        expect(symbols[0].kind).toBe('interface');
      });

      it('extracts exported types', () => {
        const content = `export type MyType = string;`;
        const symbols = extractSymbolsBaseline(content, 'index.ts');

        expect(symbols.length).toBe(1);
        expect(symbols[0].name).toBe('MyType');
        expect(symbols[0].kind).toBe('type');
      });

      it('extracts exported constants', () => {
        const content = `export const VALUE = 42;`;
        const symbols = extractSymbolsBaseline(content, 'index.ts');

        expect(symbols.length).toBe(1);
        expect(symbols[0].name).toBe('VALUE');
        expect(symbols[0].kind).toBe('variable');
      });
    });

    describe('Python', () => {
      it('extracts functions', () => {
        const content = `def hello():\n    return "world"`;
        const symbols = extractSymbolsBaseline(content, 'main.py');

        expect(symbols.length).toBe(1);
        expect(symbols[0].name).toBe('hello');
        expect(symbols[0].kind).toBe('function');
      });

      it('extracts classes', () => {
        const content = `class MyClass:\n    pass`;
        const symbols = extractSymbolsBaseline(content, 'main.py');

        expect(symbols.length).toBe(1);
        expect(symbols[0].name).toBe('MyClass');
        expect(symbols[0].kind).toBe('class');
      });

      it('extracts constants', () => {
        const content = `MAX_VALUE = 100`;
        const symbols = extractSymbolsBaseline(content, 'main.py');

        expect(symbols.length).toBe(1);
        expect(symbols[0].name).toBe('MAX_VALUE');
        expect(symbols[0].kind).toBe('constant');
      });
    });

    describe('Rust', () => {
      it('extracts public functions', () => {
        const content = `pub fn hello() -> String { String::new() }`;
        const symbols = extractSymbolsBaseline(content, 'lib.rs');

        expect(symbols.length).toBe(1);
        expect(symbols[0].name).toBe('hello');
        expect(symbols[0].kind).toBe('function');
      });

      it('extracts public structs', () => {
        const content = `pub struct MyStruct {}`;
        const symbols = extractSymbolsBaseline(content, 'lib.rs');

        expect(symbols.length).toBe(1);
        expect(symbols[0].name).toBe('MyStruct');
        expect(symbols[0].kind).toBe('class');
      });

      it('extracts public enums', () => {
        const content = `pub enum Status { Active, Inactive }`;
        const symbols = extractSymbolsBaseline(content, 'lib.rs');

        expect(symbols.length).toBe(1);
        expect(symbols[0].name).toBe('Status');
        expect(symbols[0].kind).toBe('enum');
      });

      it('extracts public traits', () => {
        const content = `pub trait Drawable {}`;
        const symbols = extractSymbolsBaseline(content, 'lib.rs');

        expect(symbols.length).toBe(1);
        expect(symbols[0].name).toBe('Drawable');
        expect(symbols[0].kind).toBe('interface');
      });
    });

    describe('Go', () => {
      it('extracts exported functions', () => {
        const content = `func Hello() string { return "world" }`;
        const symbols = extractSymbolsBaseline(content, 'main.go');

        expect(symbols.length).toBe(1);
        expect(symbols[0].name).toBe('Hello');
        expect(symbols[0].kind).toBe('function');
        expect(symbols[0].visibility).toBe('export');
      });

      it('extracts private functions', () => {
        const content = `func hello() string { return "world" }`;
        const symbols = extractSymbolsBaseline(content, 'main.go');

        expect(symbols.length).toBe(1);
        expect(symbols[0].name).toBe('hello');
        expect(symbols[0].visibility).toBe('private');
      });

      it('extracts structs', () => {
        const content = `type User struct { Name string }`;
        const symbols = extractSymbolsBaseline(content, 'main.go');

        expect(symbols.length).toBe(1);
        expect(symbols[0].name).toBe('User');
        expect(symbols[0].kind).toBe('class');
      });

      it('extracts interfaces', () => {
        const content = `type Reader interface { Read() }`;
        const symbols = extractSymbolsBaseline(content, 'main.go');

        expect(symbols.length).toBe(1);
        expect(symbols[0].name).toBe('Reader');
        expect(symbols[0].kind).toBe('interface');
      });
    });

    describe('unsupported languages', () => {
      it('returns empty array for unsupported extensions', () => {
        const content = `some content`;
        const symbols = extractSymbolsBaseline(content, 'file.xyz');
        expect(symbols).toEqual([]);
      });
    });
  });

  describe('countLinesOfCode', () => {
    it('counts non-empty, non-comment lines', () => {
      const content = `
// Comment
function hello() {
  return "world";
}

/* Block comment */
`;
      const loc = countLinesOfCode(content, 'typescript');
      expect(loc).toBe(3); // function line, return line, closing brace
    });

    it('skips Python comments', () => {
      const content = `
# Comment
def hello():
    return "world"
`;
      const loc = countLinesOfCode(content, 'python');
      expect(loc).toBe(2);
    });

    it('handles empty content', () => {
      expect(countLinesOfCode('', 'typescript')).toBe(0);
    });
  });

  describe('countImports', () => {
    it('counts TypeScript imports', () => {
      const content = `
import { foo } from './foo';
import bar from './bar';
const baz = require('./baz');
`;
      expect(countImports(content, 'typescript')).toBe(3);
    });

    it('counts Python imports', () => {
      const content = `
import os
from pathlib import Path
`;
      expect(countImports(content, 'python')).toBe(2);
    });

    it('counts Rust use statements', () => {
      const content = `
use std::io;
use std::fs::File;
`;
      expect(countImports(content, 'rust')).toBe(2);
    });

    it('counts Go imports', () => {
      const content = `
import "fmt"
import "os"
`;
      expect(countImports(content, 'go')).toBe(2);
    });
  });

  describe('JS_KEYWORDS', () => {
    it('contains common JavaScript keywords', () => {
      expect(JS_KEYWORDS.has('if')).toBe(true);
      expect(JS_KEYWORDS.has('for')).toBe(true);
      expect(JS_KEYWORDS.has('while')).toBe(true);
      expect(JS_KEYWORDS.has('return')).toBe(true);
      expect(JS_KEYWORDS.has('await')).toBe(true);
    });

    it('does not contain actual method names', () => {
      expect(JS_KEYWORDS.has('render')).toBe(false);
      expect(JS_KEYWORDS.has('handleClick')).toBe(false);
      expect(JS_KEYWORDS.has('getData')).toBe(false);
    });
  });

  describe('getLineNumber', () => {
    it('returns 1 for offset at start of content', () => {
      const content = 'line1\nline2\nline3';
      expect(getLineNumber(content, 0)).toBe(1);
    });

    it('returns correct line for middle of file', () => {
      const content = 'line1\nline2\nline3';
      // 'line2' starts at offset 6
      expect(getLineNumber(content, 6)).toBe(2);
      // 'line3' starts at offset 12
      expect(getLineNumber(content, 12)).toBe(3);
    });
  });

  describe('extractSymbolNames', () => {
    it('extracts function declarations', () => {
      const content = `
function foo() {}
export function bar() {}
async function baz() {}
export async function qux() {}
      `;
      const symbols = extractSymbolNames(content);

      const functions = symbols.filter((s) => s.kind === 'function');
      expect(functions.map((s) => s.name)).toEqual(['foo', 'bar', 'baz', 'qux']);
    });

    it('extracts class declarations', () => {
      const content = `
class MyClass {}
export class ExportedClass {}
      `;
      const symbols = extractSymbolNames(content);

      const classes = symbols.filter((s) => s.kind === 'class');
      expect(classes.map((s) => s.name)).toEqual(['MyClass', 'ExportedClass']);
    });

    it('extracts interface declarations', () => {
      const content = `
interface IProps {}
export interface IState {}
      `;
      const symbols = extractSymbolNames(content);

      const interfaces = symbols.filter((s) => s.kind === 'interface');
      expect(interfaces.map((s) => s.name)).toEqual(['IProps', 'IState']);
    });

    it('extracts type declarations', () => {
      const content = `
type MyType = string;
export type ExportedType = number;
      `;
      const symbols = extractSymbolNames(content);

      const types = symbols.filter((s) => s.kind === 'type');
      expect(types.map((s) => s.name)).toEqual(['MyType', 'ExportedType']);
    });

    it('extracts const declarations', () => {
      const content = `
const MY_CONST = 'value';
export const EXPORTED_CONST = 123;
      `;
      const symbols = extractSymbolNames(content);

      const consts = symbols.filter((s) => s.kind === 'const');
      expect(consts.map((s) => s.name)).toEqual(['MY_CONST', 'EXPORTED_CONST']);
    });

    it('extracts method declarations', () => {
      const content = `
class MyClass {
  myMethod() {
  }
  async asyncMethod() {
  }
}
      `;
      const symbols = extractSymbolNames(content);

      const methods = symbols.filter((s) => s.kind === 'method');
      expect(methods.map((s) => s.name)).toContain('myMethod');
      expect(methods.map((s) => s.name)).toContain('asyncMethod');
    });

    it('filters out keywords from method detection', () => {
      const content = `
function test() {
  if (true) {
    return foo();
  }
  for (let i = 0; i < 10; i++) {}
  while (condition) {}
}
      `;
      const symbols = extractSymbolNames(content);

      const names = symbols.map((s) => s.name);
      expect(names).not.toContain('if');
      expect(names).not.toContain('return');
      expect(names).not.toContain('for');
      expect(names).not.toContain('while');
      expect(names).toContain('test');
    });

    it('returns symbols sorted by line number', () => {
      const content = `
const A = 1;
function B() {}
class C {}
      `;
      const symbols = extractSymbolNames(content);

      const lines = symbols.map((s) => s.line);
      expect(lines).toEqual([...lines].sort((a, b) => a - b));
    });

    it('handles empty content', () => {
      const symbols = extractSymbolNames('');
      expect(symbols).toEqual([]);
    });
  });

  describe('getSymbolAtLine', () => {
    const testSymbols = [
      { name: 'functionA', kind: 'function' as const, line: 5 },
      { name: 'ClassB', kind: 'class' as const, line: 15 },
      { name: 'methodC', kind: 'method' as const, line: 20 },
    ];

    it('returns the symbol at the exact line', () => {
      expect(getSymbolAtLine(testSymbols, 5)).toBe('functionA()');
      expect(getSymbolAtLine(testSymbols, 15)).toBe('ClassB()');
      expect(getSymbolAtLine(testSymbols, 20)).toBe('methodC()');
    });

    it('returns the closest symbol before the line', () => {
      expect(getSymbolAtLine(testSymbols, 10)).toBe('functionA()');
      expect(getSymbolAtLine(testSymbols, 18)).toBe('ClassB()');
      expect(getSymbolAtLine(testSymbols, 25)).toBe('methodC()');
    });

    it('returns line_X fallback when no symbol before line', () => {
      expect(getSymbolAtLine(testSymbols, 1)).toBe('line_1');
      expect(getSymbolAtLine(testSymbols, 4)).toBe('line_4');
    });

    it('returns line_X fallback for empty symbols array', () => {
      expect(getSymbolAtLine([], 10)).toBe('line_10');
    });
  });
});
