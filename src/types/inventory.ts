export type StockLocation = "ROOM" | "COOLER";
export type BottleOrigin = "JORDANIAN" | "SAUDI" | "DEFAULT";
export type StockKind = "GOODS" | "CONSUMABLE" | "BOTTLE_POOL";
export type StockItem = {
  id: string; code: string; name: string; brand: string; size: string;
  kind: StockKind; baseUnit: string; packLabel: string; unitsPerPack: number;
  origin: BottleOrigin; room: number; cooler: number; reservedRoom: number;
  reservedCooler: number; out: number; owed: number; review: number;
  lowStock: number; active: boolean; identityKey: string;
  definitionVersion?: number; catalogType?: string; bottleSizeMl?: number; trashed?: boolean;
};
export type InventoryPolicy = {
  deliveryEnabled?: boolean;
  productId: string; mode: "STOCK" | "REFILL" | "EXEMPT";
  itemId: string; unitsPerSale: number; location: StockLocation; reason: string;
  consumables: Array<{ itemId: string; quantity: number }>;
  autoBottlePools?: boolean; bottleSizeMl?: number;
  pools: Array<{ origin: BottleOrigin; itemId: string; quantity: number }>;
};
export type StockAllocation = { itemId: string; quantity: number; location: StockLocation; role: "SALE" | "BOTTLE"; label: string; origin: BottleOrigin };
export type InventoryPlan = {
  version: 1; allocations: StockAllocation[];
  // Absent on older orders whose merchandise was deducted at READY.
  merchandiseDeductionStage?: "DELIVERED";
  consumables: Array<{ itemId: string; quantity: number }>;
};
export type BottleReturn = { itemId: string; quantity: number };
