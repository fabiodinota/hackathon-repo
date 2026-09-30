// This POC covers one demo scenario. Extend this contract explicitly for new scenarios.
export const allowedIntents = ["home_purchase_planning"] as const;
export const allowedSignals = [
  "Viewed property listings",
  "Used a mortgage calculator",
  "Compared home financing options",
  "Read a home buying guide",
] as const;
