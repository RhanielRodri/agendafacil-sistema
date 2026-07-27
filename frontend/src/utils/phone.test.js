import test from "node:test";
import assert from "node:assert/strict";
import {
  formatBrazilPhone,
  maskBrazilPhone,
  normalizeBrazilPhone
} from "./phone.js";

test("aplica mÃ¡scara progressiva", () => {
  assert.equal(maskBrazilPhone("2"), "(2");
  assert.equal(maskBrazilPhone("27"), "(27");
  assert.equal(maskBrazilPhone("279"), "(27) 9");
  assert.equal(maskBrazilPhone("27999991234"), "(27) 99999-1234");
});

test("aceita colagem e formata celular e fixo", () => {
  assert.equal(maskBrazilPhone("+55 (27) 99999-1234"), "(27) 99999-1234");
  assert.equal(formatBrazilPhone("552733331234"), "(27) 3333-1234");
  assert.equal(normalizeBrazilPhone("(55) 99999-1234"), "5555999991234");
});

test("rejeita telefone brasileiro invÃ¡lido", () => {
  assert.equal(normalizeBrazilPhone("(20) 99999-1234"), null);
  assert.equal(normalizeBrazilPhone("(27) 89999-1234"), null);
});
