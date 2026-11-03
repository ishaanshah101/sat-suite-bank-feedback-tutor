import { describe, expect, it } from "vitest";
import { displayAnswer, isSprCorrect, parseSprEntry, splitAcceptedAnswers } from "@/lib/questions/spr";

describe("grid-in entries", () => {
  it("accepts integers, decimals and fractions within the SAT length limits", () => {
    expect(parseSprEntry("403")).toMatchObject({ ok: true, kind: "integer" });
    expect(parseSprEntry(".75")).toMatchObject({ ok: true, kind: "decimal" });
    expect(parseSprEntry("-3/4")).toMatchObject({ ok: true, kind: "fraction" });
    expect(parseSprEntry(" 7 / 2 ")).toMatchObject({ ok: true, text: "7/2" });
    expect(parseSprEntry("-.6666")).toMatchObject({ ok: true });
  });

  it("rejects what the test rejects", () => {
    expect(parseSprEntry("")).toMatchObject({ ok: false });
    expect(parseSprEntry("3 1/2")).toMatchObject({ ok: false, error: expect.stringContaining("Mixed numbers") });
    expect(parseSprEntry("25%")).toMatchObject({ ok: false });
    expect(parseSprEntry("$12")).toMatchObject({ ok: false });
    expect(parseSprEntry("1,200")).toMatchObject({ ok: false });
    expect(parseSprEntry("0.6667")).toMatchObject({ ok: false });
    expect(parseSprEntry("-0.666")).toMatchObject({ ok: true });
    expect(parseSprEntry("-0.6667")).toMatchObject({ ok: false });
    expect(parseSprEntry("-0.66667")).toMatchObject({ ok: false });
    expect(parseSprEntry("x=4")).toMatchObject({ ok: false });
  });

  it("reads every dash as a minus sign", () => {
    for (const dash of ["-", "\u2212", "\u2013", "\u2014", "\u2012"]) {
      expect(parseSprEntry(`${dash}3/4`)).toMatchObject({ ok: true, text: "-3/4", kind: "fraction" });
      expect(parseSprEntry(`${dash}0.333`)).toMatchObject({ ok: true, text: "-0.333" });
      expect(isSprCorrect(`${dash}6`, ["\u22126"])).toBe(true);
    }
    expect(splitAcceptedAnswers("\u20135, \u20146")).toEqual(["-5", "-6"]);
  });

  it("rejects extra leading zeros but keeps a single one", () => {
    expect(parseSprEntry("00.67")).toMatchObject({ ok: false, error: "Remove the extra leading zeros." });
    expect(parseSprEntry("007")).toMatchObject({ ok: false, error: "Remove the extra leading zeros." });
    expect(parseSprEntry("-00.5")).toMatchObject({ ok: false, error: "Remove the extra leading zeros." });
    expect(parseSprEntry("0.67")).toMatchObject({ ok: true });
    expect(parseSprEntry(".67")).toMatchObject({ ok: true });
    expect(parseSprEntry("0")).toMatchObject({ ok: true, kind: "integer" });
    expect(parseSprEntry("-0.5")).toMatchObject({ ok: true });
    expect(isSprCorrect("00.67", ["2/3"])).toBe(false);
    expect(isSprCorrect("0.666", ["2/3"])).toBe(true);
  });

  it("accepts a trailing decimal point as the integer", () => {
    expect(parseSprEntry("5.")).toMatchObject({ ok: true, text: "5", kind: "integer" });
    expect(parseSprEntry("-12.")).toMatchObject({ ok: true, text: "-12", kind: "integer" });
    expect(isSprCorrect("5.", ["5"])).toBe(true);
    expect(parseSprEntry(".")).toMatchObject({ ok: false });
  });
});

describe("grid-in correctness", () => {
  it("matches equal values in any form", () => {
    expect(isSprCorrect("1/4", ["0.25", "1/4"])).toBe(true);
    expect(isSprCorrect(".25", ["0.25", "1/4"])).toBe(true);
    expect(isSprCorrect("2/8", ["0.25", "1/4"])).toBe(true);
    expect(isSprCorrect("3.5", ["7/2"])).toBe(true);
    expect(isSprCorrect("-6", ["-6"])).toBe(true);
    expect(isSprCorrect("6", ["-6"])).toBe(false);
  });

  it("follows the fill-every-space rule for decimals that do not fit", () => {
    for (const ok of ["2/3", ".6666", ".6667", "0.666", "0.667"]) expect(isSprCorrect(ok, ["2/3"])).toBe(true);
    for (const bad of [".66", ".67", "0.66", "0.67", ".667"]) expect(isSprCorrect(bad, ["2/3"])).toBe(false);
    for (const ok of ["-1/3", "-.3333", "-0.333"]) expect(isSprCorrect(ok, ["-1/3"])).toBe(true);
    for (const bad of ["-.33", "-0.33"]) expect(isSprCorrect(bad, ["-1/3"])).toBe(false);
    expect(isSprCorrect("0.176", [".1764", ".1765", "3/17"])).toBe(true);
    expect(isSprCorrect(".1764", [".1764", ".1765", "3/17"])).toBe(true);
    expect(isSprCorrect(".176", [".1764", ".1765", "3/17"])).toBe(false);
  });

  it("accepts an exact or longer entry when the listed answer is itself a rounded decimal", () => {
    expect(isSprCorrect("2/3", ["0.667"])).toBe(true);
    expect(isSprCorrect(".6666", ["0.667"])).toBe(true);
    expect(isSprCorrect(".6667", ["0.667"])).toBe(true);
    // Only the listed approximation is known, so a different truncation of the unknown exact value is not.
    expect(isSprCorrect("0.666", ["0.667"])).toBe(false);
    expect(isSprCorrect(".66", ["0.667"])).toBe(false);
    expect(isSprCorrect(".67", ["0.667"])).toBe(false);
    expect(isSprCorrect("3/17", [".1765"])).toBe(true);
    expect(isSprCorrect("3/17", [".1764"])).toBe(true);
    expect(isSprCorrect("-1/3", ["-0.333"])).toBe(true);
    expect(isSprCorrect("-1/3", ["-.3333"])).toBe(true);
    // A short listed decimal is exact, so nearby values do not round into it.
    expect(isSprCorrect("0.49", ["0.5"])).toBe(false);
    expect(isSprCorrect("1/2", ["0.5"])).toBe(true);
  });

  it("splits official answer lines and picks a readable answer", () => {
    expect(splitAcceptedAnswers("Correct Answer: .1764, .1765, 3/17")).toEqual([".1764", ".1765", "3/17"]);
    expect(splitAcceptedAnswers("2/3, .6666, .6667, 0.666, 0.667")).toHaveLength(5);
    expect(splitAcceptedAnswers("−5")).toEqual(["-5"]);
    expect(displayAnswer([".1764", ".1765", "3/17"])).toBe("3/17");
    expect(displayAnswer([])).toBeNull();
  });
});
