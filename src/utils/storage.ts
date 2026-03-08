export type CompressionLevel = "low" | "medium" | "high";

export type StorageState = {
  bottlesSaved: number;
  phoneCharges: number;
  milesDriven: number;
  totalTokens: number;
  totalWater: number;
  totalEnergy: number;
  totalCo2: number;
  undoEnabled: boolean;
  enableSlider: boolean;
  compressionLevel: CompressionLevel;
  hasSeenTutorial: boolean;
};

type LegacyTotals = {
  tokensSaved: number;
  waterMlSaved: number;
  energyWhSaved: number;
  co2GramsSaved: number;
};

type StorageItems = StorageState &
  LegacyTotals & {
    enableSliderInitialized: boolean;
  };

export const DEFAULT_STORAGE_STATE: StorageState = {
  bottlesSaved: 0,
  phoneCharges: 0,
  milesDriven: 0,
  totalTokens: 0,
  totalWater: 0,
  totalEnergy: 0,
  totalCo2: 0,
  undoEnabled: true,
  enableSlider: true,
  compressionLevel: "medium",
  hasSeenTutorial: false
};

const DEFAULT_LEGACY_TOTALS: LegacyTotals = {
  tokensSaved: 0,
  waterMlSaved: 0,
  energyWhSaved: 0,
  co2GramsSaved: 0
};

function toNumber(value: unknown, fallback = 0) {
  const parsed =
    typeof value === "number" ? value : Number.parseFloat(String(value ?? ""));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeCompressionLevel(value: unknown): CompressionLevel {
  return value === "low" || value === "medium" || value === "high"
    ? value
    : DEFAULT_STORAGE_STATE.compressionLevel;
}

export function normalizeStorage(
  items: Partial<StorageItems> | undefined
): StorageState {
  const source = items ?? {};
  const totalTokens = toNumber(
    source.totalTokens ?? source.tokensSaved,
    DEFAULT_STORAGE_STATE.totalTokens
  );
  const totalWater = toNumber(
    source.totalWater ?? source.waterMlSaved,
    DEFAULT_STORAGE_STATE.totalWater
  );
  const totalEnergy = toNumber(
    source.totalEnergy ?? source.energyWhSaved,
    DEFAULT_STORAGE_STATE.totalEnergy
  );
  const totalCo2 = toNumber(
    source.totalCo2 ?? source.co2GramsSaved,
    DEFAULT_STORAGE_STATE.totalCo2
  );

  return {
    bottlesSaved: toNumber(source.bottlesSaved, totalWater / 500),
    phoneCharges: toNumber(source.phoneCharges, totalEnergy / 12),
    milesDriven: toNumber(source.milesDriven, totalCo2 / 400),
    totalTokens,
    totalWater,
    totalEnergy,
    totalCo2,
    undoEnabled: Boolean(source.undoEnabled ?? DEFAULT_STORAGE_STATE.undoEnabled),
    enableSlider: Boolean(
      source.enableSlider ?? DEFAULT_STORAGE_STATE.enableSlider
    ),
    compressionLevel: normalizeCompressionLevel(source.compressionLevel),
    hasSeenTutorial: Boolean(
      source.hasSeenTutorial ?? DEFAULT_STORAGE_STATE.hasSeenTutorial
    )
  };
}

export function getStorage(): Promise<StorageState> {
  return new Promise((resolve) => {
    chrome.storage.local.get(
      [
        "bottlesSaved",
        "phoneCharges",
        "milesDriven",
        "totalTokens",
        "totalWater",
        "totalEnergy",
        "totalCo2",
        "tokensSaved",
        "waterMlSaved",
        "energyWhSaved",
        "co2GramsSaved",
        "undoEnabled",
        "enableSlider",
        "enableSliderInitialized",
        "compressionLevel",
        "hasSeenTutorial"
      ],
      (items) => {
        const typedItems = items as Partial<StorageItems>;
        const normalized = normalizeStorage(typedItems);

        if (!typedItems.enableSliderInitialized) {
          const migrationPatch: Partial<StorageItems> = {
            enableSliderInitialized: true
          };

          if (typeof typedItems.enableSlider !== "boolean") {
            migrationPatch.enableSlider = DEFAULT_STORAGE_STATE.enableSlider;
          }

          chrome.storage.local.set(migrationPatch);
        }

        resolve(normalized);
      }
    );
  });
}

export async function setStorage(
  patch: Partial<StorageState>
): Promise<StorageState> {
  const current = await getStorage();
  const next = normalizeStorage({ ...current, ...patch });
  const storagePatch: Partial<StorageItems> = { ...next };

  if (Object.prototype.hasOwnProperty.call(patch, "enableSlider")) {
    storagePatch.enableSliderInitialized = true;
  }

  await new Promise<void>((resolve) => {
    chrome.storage.local.set(storagePatch, () => resolve());
  });

  return next;
}
