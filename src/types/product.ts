export const PRODUCT_CATEGORIES = {
  REFILL: "REFILL",
  NEW_BOTTLE: "NEW_BOTTLE",
  CUPS: "CUPS",
  SHRINK: "SHRINK",
  COOLED: "COOLED",
  OTHER: "OTHER",
} as const;

export type ProductCategory =
  (typeof PRODUCT_CATEGORIES)[keyof typeof PRODUCT_CATEGORIES];

export type Product = {
  id: string;

  name: string;

  category: ProductCategory;

  storePriceFils: number;

  deliveryPriceFils: number;

  isActive: boolean;

  showForEmployee: boolean;

  showForCustomerApp: boolean;

  requiresBottleOrigin: boolean;

  imageUrl: string | null;
};

export type ProductMutationInput = {
  name: string;

  category: ProductCategory;

  storePriceFils: number;

  deliveryPriceFils: number;

  isActive: boolean;

  showForEmployee: boolean;

  showForCustomerApp: boolean;

  requiresBottleOrigin: boolean;

  imageUrl: string | null;
};