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

  it("splits official answer lines and picks a readable answer", () => {
    expect(splitAcceptedAnswers("Correct Answer: .1764, .1765, 3/17")).toEqual([".1764", ".1765", "3/17"]);
    expect(splitAcceptedAnswers("2/3, .6666, .6667, 0.666, 0.667")).toHaveLength(5);
    expect(splitAcceptedAnswers("−5")).toEqual(["-5"]);
    expect(displayAnswer([".1764", ".1765", "3/17"])).toBe("3/17");
    expect(displayAnswer([])).toBeNull();
  });
});
