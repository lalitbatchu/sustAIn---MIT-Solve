import type { StorageState } from "./storage";

type EcoDisplaySource = Pick<
  StorageState,
  "totalTokens" | "totalWater" | "totalEnergy" | "totalCo2"
>;

type SplitLabel = {
  value: string;
  rest: string;
};

export function getEcoDisplayStats(source: EcoDisplaySource) {
  const bottlesSaved = source.totalWater / 500;
  const phoneCharges = source.totalEnergy / 12;
  const milesDriven = source.totalCo2 / 400;

  return {
    ...source,
    bottlesSaved,
    phoneCharges,
    milesDriven,
    bottlesLabel:
      bottlesSaved === 1
        ? "1.00 bottle saved"
        : `${bottlesSaved.toFixed(2)} bottles saved`,
    chargesLabel:
      phoneCharges === 1
        ? "1 phone charge"
        : `${phoneCharges.toFixed(1)} phone charges`,
    milesLabel:
      milesDriven === 1
        ? "1.000 miles driven"
        : `${milesDriven.toFixed(3)} miles driven`
  };
}

export function splitMetricLabel(text: string): SplitLabel {
  const match = text.match(/^([0-9]+(?:\.[0-9]+)?)\s+(.*)$/i);
  if (!match) {
    return { value: text, rest: "" };
  }

  return {
    value: match[1],
    rest: match[2]
  };
}
