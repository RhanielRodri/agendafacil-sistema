import test from "node:test";
import assert from "node:assert/strict";
import { parseBrazilPhone, phoneLookupValues, phoneSearchValues } from "../services/phoneService.js";

test("normaliza celular, fixo e colagem brasileira", () => {
  assert.equal(parseBrazilPhone("(27) 99999-1234").normalized, "5527999991234");
  assert.equal(parseBrazilPhone("+55 (27) 99999-1234").normalized, "5527999991234");
  assert.equal(parseBrazilPhone("27 3333-1234").normalized, "552733331234");
});

test("preserva DDD 55 e oferece compatibilidade de busca", () => {
  assert.equal(parseBrazilPhone("(55) 99999-1234").normalized, "5555999991234");
  assert.deepEqual(phoneLookupValues("5527999991234"), ["5527999991234", "27999991234"]);
  assert.deepEqual(phoneSearchValues("+55 (27) 99999-1234"), ["5527999991234", "27999991234"]);
});

test("rejeita DDD e prefixos invÃ¡lidos", () => {
  assert.equal(parseBrazilPhone("(20) 99999-1234"), null);
  assert.equal(parseBrazilPhone("(27) 89999-1234"), null);
  assert.equal(parseBrazilPhone("(27) 1333-1234"), null);
});
