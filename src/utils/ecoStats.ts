import { encode } from "gpt-tokenizer/encoding/o200k_base";

export type EcoTotals = {
  totalTokens: number;
  totalWater: number;
  totalEnergy: number;
  totalCo2: number;
};

type EcoPayload = {
  tokens: number;
  waterMl: number;
  energyWh: number;
  co2Grams: number;
};

const WATER_ML_PER_TOKEN = 1.04;
const ENERGY_WH_PER_TOKEN = 0.12;
const CO2_G_PER_TOKEN = 0.048;

const WORKER_URL = "https://backend.lalitbatchu.workers.dev";
const DEFAULT_TOTALS: EcoTotals = {
  totalTokens: 0,
  totalWater: 0,
  totalEnergy: 0,
  totalCo2: 0
};

type LegacyTotals = {
  tokensSaved: number;
  waterMlSaved: number;
  energyWhSaved: number;
  co2GramsSaved: number;
};

const DEFAULT_LEGACY_TOTALS: LegacyTotals = {
  tokensSaved: 0,
  waterMlSaved: 0,
  energyWhSaved: 0,
  co2GramsSaved: 0
};

export function countPromptTokens(text: string): number {
  try {
    return encode(text).length;
  } catch (error) {
    // Keep extension behavior resilient on unexpected editor artifacts.
    console.warn("sustAIn: tokenization failed, using char fallback", error);
    return Math.ceil(text.length / 4);
  }
}

export function calculateEcoStats(originalTokens: number, compressedTokens: number) {
  const tokens = Math.max(0, originalTokens - compressedTokens);
  const waterMl = tokens * WATER_ML_PER_TOKEN;
  const energyWh = tokens * ENERGY_WH_PER_TOKEN;
  const co2Grams = tokens * CO2_G_PER_TOKEN;

  return { tokens, waterMl, energyWh, co2Grams };
}

export function processSavings(originalText: string, compressedText: string) {
  const originalTokens = countPromptTokens(originalText);
  const compressedTokens = countPromptTokens(compressedText);
  return calculateEcoStats(originalTokens, compressedTokens);
}

export async function logEcoStats(payload: EcoPayload): Promise<void> {
  const toNumber = (value: unknown) => {
    const parsed =
      typeof value === "number" ? value : Number.parseFloat(String(value ?? ""));
    return Number.isFinite(parsed) ? parsed : 0;
  };

  const tokens = Math.max(0, toNumber(payload.tokens));
  const waterMl = Math.max(0, toNumber(payload.waterMl));
  const energyWh = Math.max(0, toNumber(payload.energyWh));
  const rawCo2 = Math.max(0, toNumber(payload.co2Grams));
  const co2Grams = rawCo2 > 0 ? rawCo2 : tokens * CO2_G_PER_TOKEN;

  if (tokens <= 0 && waterMl <= 0 && energyWh <= 0 && co2Grams <= 0) {
    return;
  }

  const totals = await new Promise<EcoTotals & LegacyTotals>((resolve) => {
    chrome.storage.local.get({ ...DEFAULT_TOTALS, ...DEFAULT_LEGACY_TOTALS }, (items) => {
      resolve({
        totalTokens: Number(
          items.totalTokens ?? items.tokensSaved ?? DEFAULT_TOTALS.totalTokens
        ),
        totalWater: Number(
          items.totalWater ?? items.waterMlSaved ?? DEFAULT_TOTALS.totalWater
        ),
        totalEnergy: Number(
          items.totalEnergy ?? items.energyWhSaved ?? DEFAULT_TOTALS.totalEnergy
        ),
        totalCo2: Number(
          items.totalCo2 ?? items.co2GramsSaved ?? DEFAULT_TOTALS.totalCo2
        ),
        tokensSaved: Number(items.tokensSaved ?? DEFAULT_LEGACY_TOTALS.tokensSaved),
        waterMlSaved: Number(items.waterMlSaved ?? DEFAULT_LEGACY_TOTALS.waterMlSaved),
        energyWhSaved: Number(items.energyWhSaved ?? DEFAULT_LEGACY_TOTALS.energyWhSaved),
        co2GramsSaved: Number(items.co2GramsSaved ?? DEFAULT_LEGACY_TOTALS.co2GramsSaved)
      });
    });
  });

  const nextTotals: EcoTotals = {
    totalTokens: totals.totalTokens + tokens,
    totalWater: totals.totalWater + waterMl,
    totalEnergy: totals.totalEnergy + energyWh,
    totalCo2: totals.totalCo2 + co2Grams
  };

  const bottleMl = 500;
  const bottlesSaved = nextTotals.totalWater / bottleMl;
  const phoneCharges = nextTotals.totalEnergy / 12;
  const milesDriven = nextTotals.totalCo2 / 400;

  await new Promise<void>((resolve) => {
    chrome.storage.local.set(
      {
        ...nextTotals,
        // Legacy aliases keep popup updates stable if any older UI path is still present.
        tokensSaved: nextTotals.totalTokens,
        waterMlSaved: nextTotals.totalWater,
        energyWhSaved: nextTotals.totalEnergy,
        co2GramsSaved: nextTotals.totalCo2,
        bottlesSaved,
        phoneCharges,
        milesDriven
      },
      () => resolve()
    );
  });

  console.log("EcoStats: totals updated", {
    totalTokens: nextTotals.totalTokens,
    totalWater: nextTotals.totalWater,
    totalEnergy: nextTotals.totalEnergy,
    totalCo2: nextTotals.totalCo2,
    bottlesSaved,
    phoneCharges,
    milesDriven
  });

  chrome.runtime.sendMessage({
    type: "eco-totals-updated",
    payload: { ...nextTotals, bottlesSaved, phoneCharges, milesDriven }
  });

  const workerPayload = { tokens };
  const fallbackCloudLog = () =>
    fetch(WORKER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(workerPayload)
    }).then((response) => {
      if (!response.ok) {
        throw new Error(`Cloud log failed with status ${response.status}`);
      }
    });

  try {
    chrome.runtime.sendMessage({ type: "eco-log", payload: workerPayload }, (response) => {
      if (chrome.runtime.lastError) {
        console.error("EcoStats cloud log failed", chrome.runtime.lastError);
        // Fallback to direct fetch from content script.
        fallbackCloudLog().catch((error) => {
          console.error("EcoStats cloud log failed", error);
        });
        return;
      }
      if (!response?.ok) {
        console.error("EcoStats cloud log failed", response);
        fallbackCloudLog().catch((error) => {
          console.error("EcoStats cloud log failed", error);
        });
      }
    });
  } catch (error) {
    console.error("EcoStats cloud log failed", error);
  }
}
