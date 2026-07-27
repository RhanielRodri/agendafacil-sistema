import { describe, expect, it } from "vitest";
import { parseBrazilPhone, phoneLookupValues, phoneSearchValues } from "../shared/src/phone";

describe("telefone brasileiro", () => {
  it.each([
    ["(27) 99999-1234", "5527999991234", "MOBILE"],
    ["+55 (27) 99999-1234", "5527999991234", "MOBILE"],
    ["27.3333-1234", "552733331234", "LANDLINE"],
    ["(55) 99999-1234", "5555999991234", "MOBILE"]
  ])("normaliza %s", (input, normalized, kind) => {
    expect(parseBrazilPhone(input)).toMatchObject({ normalized, kind });
  });

  it.each(["123", "(27) 89999-1234", "(20) 99999-1234", "(27) 1333-1234"])(
    "rejeita %s",
    (input) => expect(parseBrazilPhone(input)).toBeNull()
  );

  it("mantÃ©m candidatos compatÃ­veis com registros antigos e busca por colagem", () => {
    expect(phoneLookupValues("5527999991234")).toEqual(["5527999991234", "27999991234"]);
    expect(phoneSearchValues("+55 (27) 99999-1234")).toEqual(["5527999991234", "27999991234"]);
  });
});
