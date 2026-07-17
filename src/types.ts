export interface Variable {
  id: string;      // Unique Identifier (e.g., A, B, C)
  label: string;   // Friendly display label
  formula: string; // Underlying formula (e.g., "A * B" or "100")
  value: number;   // Calculated value
  hasError: boolean;
  x: number;       // absolute X position on canvas
  y: number;       // absolute Y position on canvas
}

export interface Board {
  id: string;
  name: string;
  variables: Variable[];
}
