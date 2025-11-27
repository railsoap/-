
import { GameParams, LogicPlot, CropColor } from '../types';

// --- Helper: Calculate Seed EV based on k checks ---
export const getSeedEV = (k: number, params: GameParams): number => {
  // State vector: [ProbL1, ProbL2, ProbL3, ProbL4]
  let p = [1.0, 0.0, 0.0, 0.0];

  for (let i = 0; i < k; i++) {
    const nextP = [0, 0, 0, 0];
    
    // L1 transitions
    nextP[0] += p[0] * (1 - params.probL1toL2);
    nextP[1] += p[0] * params.probL1toL2;
    
    // L2 transitions
    nextP[1] += p[1] * (1 - params.probL2toL3);
    nextP[2] += p[1] * params.probL2toL3;
    
    // L3 transitions
    nextP[2] += p[2] * (1 - params.probL3toL4);
    nextP[3] += p[2] * params.probL3toL4;
    
    // L4 stays L4
    nextP[3] += p[3] * 1.0;
    
    p = nextP;
  }

  // Calculate Expected Value
  const ev = 
    p[0] * params.valL1 + 
    p[1] * params.valL2 + 
    p[2] * params.valL3 + 
    p[3] * params.valL4;
    
  return ev;
};

// --- Helper: Get Crop Value Multiplier ---
// Logic: Weight = Max(buyCounts) / specificBuyCount
const getCropMultiplier = (color: CropColor, params: GameParams): number => {
  const maxCount = Math.max(params.buyCountPurple, params.buyCountBlue, params.buyCountYellow);
  
  let currentCount = 0;
  switch (color) {
    case 'purple': currentCount = params.buyCountPurple; break;
    case 'blue': currentCount = params.buyCountBlue; break;
    case 'yellow': currentCount = params.buyCountYellow; break;
  }

  if (currentCount <= 0) return 0; // Prevent division by zero
  return maxCount / currentCount;
};

// --- Solver State Key Generator ---
const generateKey = (plots: LogicPlot[]): string => {
  const sorted = [...plots].sort((a, b) => {
    if (a.fieldId !== b.fieldId) return a.fieldId.localeCompare(b.fieldId);
    return a.side.localeCompare(b.side);
  });
  
  return sorted.map(p => `${p.fieldId}:${p.side}:${p.color}:${p.k}`).join('|');
};

// --- The Core Solver ---
export interface SolveResult {
  maxEV: number;
  path: string[];
  bestMoveId?: string; // ID of the plot to harvest next (e.g. field1-L)
}

const memo = new Map<string, SolveResult>();

export const solve = (plots: LogicPlot[], params: GameParams): SolveResult => {
  // Base case: No crops left
  if (plots.length === 0) {
    return { maxEV: 0, path: [] };
  }

  const stateKey = generateKey(plots);
  if (memo.has(stateKey)) {
    return memo.get(stateKey)!;
  }

  let bestResult: SolveResult = { maxEV: -1, path: [] };

  // Iterate through all possible moves (harvesting any currently active plot)
  for (let i = 0; i < plots.length; i++) {
    const currentPlot = plots[i];
    
    // 1. Calculate Immediate Gain
    const seedEV = getSeedEV(currentPlot.k, params);
    const multiplier = getCropMultiplier(currentPlot.color, params);
    const immediateGain = multiplier * seedEV;

    // 2. Identify neighbors and other crops
    const otherPlots = plots.filter((_, idx) => idx !== i);
    const neighbor = otherPlots.find(p => p.fieldId === currentPlot.fieldId);
    const nonNeighbors = otherPlots.filter(p => p.fieldId !== currentPlot.fieldId);

    // 3. Logic Branching
    
    // --- BRANCH A: Neighbor Withered (or didn't exist) ---
    // The 'currentPlot' is removed. Global Update -> All *other* surviving crops with diff color get k+1
    
    const nextPlotsA = nonNeighbors.map(p => ({
      ...p,
      k: p.color !== currentPlot.color ? p.k + 1 : p.k
    }));
    
    const resA = solve(nextPlotsA, params);
    
    // --- BRANCH B: Neighbor Survives ---
    // Only possible if neighbor exists
    
    let branchB_EV = 0;
    
    if (neighbor) {
      // Neighbor survives. 
      // It gets Global Update (+1 if diff color) + Local Update (+1 if diff color) -> +2 Total
      // Non-neighbors get Global Update (+1 if diff color)
      
      const nextPlotsB: LogicPlot[] = [
        // The surviving neighbor
        {
          ...neighbor,
          k: neighbor.color !== currentPlot.color ? neighbor.k + 2 : neighbor.k
        },
        // The other fields
        ...nonNeighbors.map(p => ({
          ...p,
          k: p.color !== currentPlot.color ? p.k + 1 : p.k
        }))
      ];
      
      const resB = solve(nextPlotsB, params);
      branchB_EV = resB.maxEV;
    }

    // 4. Combine Probabilities
    let totalExpectedValue = 0;
    
    if (neighbor) {
      // Expected = Gain + (1-B)*Rest(A) + B*Rest(B)
      totalExpectedValue = immediateGain + (1 - params.probSurvival) * resA.maxEV + params.probSurvival * branchB_EV;
    } else {
      // Deterministic transition
      totalExpectedValue = immediateGain + resA.maxEV;
    }

    // 5. Compare with Max
    if (totalExpectedValue > bestResult.maxEV) {
      const plotName = getPlotDisplayName(currentPlot);
      let stepDesc = `收割 ${plotName} (Lv.${currentPlot.k})`;
      
      // Construct ID to return for UI highlighting
      const plotId = `${currentPlot.fieldId}-${currentPlot.side === 'left' ? 'L' : 'R'}`;

      bestResult = {
        maxEV: totalExpectedValue,
        path: [stepDesc, ...resA.path],
        bestMoveId: plotId
      };
    }
  }

  memo.set(stateKey, bestResult);
  return bestResult;
};

// Helper for UI display
const getPlotDisplayName = (p: LogicPlot) => {
  const colorMap: Record<string, string> = { purple: '紫', blue: '蓝', yellow: '黄' };
  return `[${p.fieldId} ${p.side === 'left' ? '左' : '右'}] ${colorMap[p.color]}`;
};

export const clearMemo = () => {
  memo.clear();
};
