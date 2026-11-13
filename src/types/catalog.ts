import type { BottleOrigin, StockItem } from "./inventory";
export type CatalogType = "CUPS" | "SHRINK" | "NEW_BOTTLE" | "FILTER" | "GOODS" | "CONSUMABLE" | "BOTTLE_POOL" | "REFILL";
export type CatalogEntry = {
  deliveryEnabled?: boolean;
  id: string; legacyProductId: string; code: string; type: CatalogType; name: string;
  brand: string; size: string; baseUnit: string; packLabel: string; unitsPerPack: number;
  origin: BottleOrigin; lowStock: number; version: number; definitionVersion: number;
  publish: boolean; showForEmployee: boolean; showForCustomerApp: boolean; cooled: boolean;
  storePriceFils: number; deliveryPriceFils: number; cooledStorePriceFils: number; cooledDeliveryPriceFils: number;
  normalProductId: string; cooledProductId: string; requiresBottleOrigin: boolean;
  pools: Array<{ origin: BottleOrigin; itemId: string; quantity: number }>;
  archived: boolean; legacy: boolean; stock: StockItem | null;
  legacyUnmappedCold?: boolean;
  related: Array<{ id: string; name: string; location: string }>;
};
export type CatalogSnapshot = { entries: CatalogEntry[]; items: StockItem[]; recipe: Array<{ itemId: string; quantity: number }>; recipeConfigured: boolean };
