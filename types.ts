
export type CropColor = 'purple' | 'blue' | 'yellow';

export interface PlotConfig {
  id: string; // Unique ID for the plot (e.g., "field1-L")
  color: CropColor;
  active: boolean; // Is there a crop here?
  k: number; // Current upgrade count (Level)
}

export interface FieldConfig {
  id: string; // Unique ID for the field (e.g., "field1")
  left: PlotConfig;
  right: PlotConfig;
}

export interface GameParams {
  // Purchase quantities per standard unit (Used to calculate weights)
  // Logic: Weight = Max(Counts) / CurrentCount
  buyCountPurple: number;
  buyCountBlue: number;
  buyCountYellow: number;
  
  // Survival probability B
  probSurvival: number;

  // Seed values
  valL1: number;
  valL2: number;
  valL3: number;
  valL4: number;

  // Upgrade probabilities
  probL1toL2: number;
  probL2toL3: number;
  probL3toL4: number;
}

// Logic types for Solver
export interface LogicPlot {
  fieldId: string;
  side: 'left' | 'right';
  color: CropColor;
  k: number; // Current upgrade count
}

export interface LogicState {
  plots: LogicPlot[];
}
